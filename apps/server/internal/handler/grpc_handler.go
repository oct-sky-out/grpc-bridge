package handler

import (
	"context"
	"net/http"
	"time"
	"strings"
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/grpc-bridge/server/internal/grpc"
	pparser "github.com/grpc-bridge/server/internal/proto"
	"github.com/grpc-bridge/server/internal/session"
	"github.com/grpc-bridge/server/internal/websocket"
)

type GRPCHandler struct {
	sessionManager *session.Manager
	grpcProxy      *grpc.Proxy         // Legacy grpcurl wrapper (deprecated)
	nativeClient   *grpc.NativeClient  // New native gRPC client
	wsHub          *websocket.Hub
}

func NewGRPCHandler(sm *session.Manager, gp *grpc.Proxy, hub *websocket.Hub) *GRPCHandler {
	return &GRPCHandler{
		sessionManager: sm,
		grpcProxy:      gp,
		nativeClient:   grpc.NewNativeClient(),
		wsHub:          hub,
	}
}

// CallRequest represents a gRPC call request
type CallRequest struct {
	Target      string            `json:"target" binding:"required"`       // gRPC server address
	Service     string            `json:"service" binding:"required"`      // Full service name (e.g. "grpc.reflection.v1alpha.ServerReflection")
	Method      string            `json:"method" binding:"required"`       // Method name
	Data        interface{}       `json:"data"`                            // Request payload (JSON)
	Metadata    map[string]string `json:"metadata"`                        // gRPC metadata headers
	Plaintext   bool              `json:"plaintext"`                       // Use plaintext (insecure) connection
	ImportPaths []string          `json:"import_paths"`                    // Additional proto import paths
}

// CallGRPC handles gRPC call requests
func (h *GRPCHandler) CallGRPC(c *gin.Context) {
	sessionID := c.GetHeader("X-Session-ID")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "session ID required in X-Session-ID header",
		})
		return
	}

	// Verify session exists
	session, exists := h.sessionManager.Get(sessionID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "session not found",
		})
		return
	}

	var req CallRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "invalid request: " + err.Error(),
		})
		return
	}

	// Emit start event
	startTime := time.Now()

	// Build proto file paths from session
	protoFiles := make([]string, len(session.ProtoFiles))
	for i, pf := range session.ProtoFiles {
		protoFiles[i] = pf.AbsolutePath
	}

	// Execute gRPC call using native Go gRPC client in a goroutine
	go func() {
		result, err := h.nativeClient.Call(c.Request.Context(), grpc.NativeCallOptions{
			SessionID:   sessionID,
			SessionRoot: session.RootPath,
			ProtoFiles:  protoFiles,
			Target:      req.Target,
			Service:     req.Service,
			Method:      req.Method,
			Data:        req.Data,
			Metadata:    req.Metadata,
			Plaintext:   req.Plaintext,
			Timeout:     30 * time.Second, // Default 30s timeout
		})

		tookMs := time.Since(startTime).Milliseconds()

		if err != nil {
			// Emit error event via WebSocket
			h.wsHub.EmitToSession(sessionID, "grpc://error", gin.H{
				"error":   err.Error(),
				"took_ms": tookMs,
				"kind":    "error",
			})
		} else {
			// Emit success event via WebSocket
			h.wsHub.EmitToSession(sessionID, "grpc://response", gin.H{
				"raw":     result.Response,
				"parsed":  result.Response,
				"headers": result.Headers,
				"trailers": result.Trailers,
				"took_ms": tookMs,
			})
		}
	}()

	// Immediately return accepted status
	c.JSON(http.StatusAccepted, gin.H{
		"message": "gRPC call initiated",
	})
}

// ListServicesRequest represents a request to list services
type ListServicesRequest struct {
	Target    string `json:"target"`    // gRPC server address (optional - if empty, reads from proto files)
	Plaintext bool   `json:"plaintext"` // Use plaintext (insecure) connection
}

// ListServices lists available gRPC services
// If Target is provided: uses gRPC reflection
// If Target is empty: reads from uploaded proto files (like desktop)
func (h *GRPCHandler) ListServices(c *gin.Context) {
	sessionID := c.GetHeader("X-Session-ID")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "session ID required in X-Session-ID header",
		})
		return
	}

	// Verify session exists
	session, exists := h.sessionManager.Get(sessionID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "session not found",
		})
		return
	}

	var req ListServicesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "invalid request: " + err.Error(),
		})
		return
	}

	// Helper: parse proto files to build rich service metadata (fq_service, file, methods)
	parseFromProto := func() {
		protoFiles := make([]string, len(session.ProtoFiles))
		for i, pf := range session.ProtoFiles { protoFiles[i] = pf.AbsolutePath }
		if len(protoFiles) == 0 {
			c.JSON(http.StatusOK, gin.H{"services": []interface{}{}, "source": "proto_files"})
			return
		}
		parser := pparser.NewServiceParser()
		parsed, err := parser.ParseServices(session.RootPath, protoFiles)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse proto files: " + err.Error()})
			return
		}
		// Cache best-effort
		_ = h.sessionManager.SetServices(session.ID, parsed)
		out := make([]gin.H, 0, len(parsed))
		for _, svc := range parsed {
			methods := make([]gin.H, 0, len(svc.Methods))
			for _, m := range svc.Methods {
				methods = append(methods, gin.H{
					"name":        m.Name,
					"input_type":  m.InputType,
					"output_type": m.OutputType,
					"streaming":   m.Streaming,
				})
			}
			out = append(out, gin.H{
				"fq_service": svc.FQService,
				"file":       svc.File,
				"methods":    methods,
			})
		}
		c.JSON(http.StatusOK, gin.H{"services": out, "source": "proto_files"})
	}

	// If no target OR target appears to be placeholder localhost with no server reachable -> parse locally
	if req.Target == "" { parseFromProto(); return }

	// Attempt reflection with short timeout
	ctx, cancel := context.WithTimeout(c.Request.Context(), 1200*time.Millisecond)
	defer cancel()
	services, err := h.nativeClient.ListServices(ctx, req.Target, req.Plaintext)
	if err != nil {
		// Fallback on common dial errors
		lowered := strings.ToLower(err.Error())
		if strings.Contains(lowered, "unavailable") || strings.Contains(lowered, "refused") || strings.Contains(lowered, "deadline") || strings.Contains(lowered, "connect") {
			fmt.Printf("[ListServices] reflection failed (%v) – falling back to proto parsing\n", err)
			parseFromProto()
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list services: " + err.Error()})
		return
	}

	// Convert reflection list (string names) to minimal service meta objects (methods empty; can be enriched later)
	out := make([]gin.H, 0, len(services))
	for _, name := range services {
		out = append(out, gin.H{
			"fq_service": name,
			"file":       "(reflection)",
			"methods":    []gin.H{},
		})
	}
	c.JSON(http.StatusOK, gin.H{"services": out, "source": "reflection"})
}

// DescribeServiceRequest represents a request to describe a service
type DescribeServiceRequest struct {
	Target    string `json:"target" binding:"required"`  // gRPC server address
	Service   string `json:"service" binding:"required"` // Service name to describe
	Plaintext bool   `json:"plaintext"`                  // Use plaintext (insecure) connection
}

// DescribeService describes a gRPC service (methods, types, etc.)
func (h *GRPCHandler) DescribeService(c *gin.Context) {
	sessionID := c.GetHeader("X-Session-ID")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "session ID required in X-Session-ID header",
		})
		return
	}

	// Verify session exists
	session, exists := h.sessionManager.Get(sessionID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "session not found",
		})
		return
	}

	var req DescribeServiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "invalid request: " + err.Error(),
		})
		return
	}

	// Build proto file paths from session
	protoFiles := make([]string, len(session.ProtoFiles))
	for i, pf := range session.ProtoFiles {
		protoFiles[i] = pf.AbsolutePath
	}

	// Describe service using grpcurl
	description, err := h.grpcProxy.DescribeService(c.Request.Context(), grpc.DescribeOptions{
		SessionID:   sessionID,
		ProtoFiles:  protoFiles,
		Target:      req.Target,
		Service:     req.Service,
		Plaintext:   req.Plaintext,
		SessionRoot: session.RootPath,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "failed to describe service: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, description)
}
