package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/grpc-bridge/server/internal/grpc"
	"github.com/grpc-bridge/server/internal/session"
	"github.com/grpc-bridge/server/internal/websocket"
)

type GRPCHandler struct {
	sessionManager *session.Manager
	grpcProxy      *grpc.Proxy
	wsHub          *websocket.Hub
}

func NewGRPCHandler(sm *session.Manager, gp *grpc.Proxy, hub *websocket.Hub) *GRPCHandler {
	return &GRPCHandler{
		sessionManager: sm,
		grpcProxy:      gp,
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

	// Execute gRPC call using grpcurl in a goroutine
	go func() {
		result, err := h.grpcProxy.Call(c.Request.Context(), grpc.CallOptions{
			SessionID:   sessionID,
			ProtoFiles:  protoFiles,
			Target:      req.Target,
			Service:     req.Service,
			Method:      req.Method,
			Data:        req.Data,
			Metadata:    req.Metadata,
			Plaintext:   req.Plaintext,
			ImportPaths: req.ImportPaths,
			SessionRoot: session.RootPath,
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
	Target    string `json:"target" binding:"required"` // gRPC server address
	Plaintext bool   `json:"plaintext"`                 // Use plaintext (insecure) connection
}

// ListServices lists available gRPC services using reflection
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

	// Build proto file paths from session
	protoFiles := make([]string, len(session.ProtoFiles))
	for i, pf := range session.ProtoFiles {
		protoFiles[i] = pf.AbsolutePath
	}

	// List services using grpcurl
	services, err := h.grpcProxy.ListServices(c.Request.Context(), grpc.ListOptions{
		SessionID:   sessionID,
		ProtoFiles:  protoFiles,
		Target:      req.Target,
		Plaintext:   req.Plaintext,
		SessionRoot: session.RootPath,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "failed to list services: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"services": services,
	})
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
