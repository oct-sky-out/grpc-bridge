package handler

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/grpc-bridge/server/internal/proto"
	"github.com/grpc-bridge/server/internal/session"
	"github.com/grpc-bridge/server/internal/websocket"
)

type ProtoHandler struct {
	sessionManager *session.Manager
	hub            *websocket.Hub
	uploadDir      string
	stdlibManager  *proto.StdlibManager
}

func NewProtoHandler(sm *session.Manager, hub *websocket.Hub, uploadDir string) *ProtoHandler {
	return &ProtoHandler{
		sessionManager: sm,
		hub:            hub,
		uploadDir:      uploadDir,
		stdlibManager:  proto.NewStdlibManager(),
	}
}

// UploadStructureRequest represents the upload request
type UploadStructureRequest struct {
	SessionID string `form:"sessionId" binding:"required"`
}

// UploadStructure handles directory structure upload with webkitdirectory
func (h *ProtoHandler) UploadStructure(c *gin.Context) {
	var req UploadStructureRequest
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "session_id is required",
		})
		return
	}

	// Verify session exists
	sess, exists := h.sessionManager.Get(req.SessionID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "session not found",
		})
		return
	}

	// Emit start event
	h.hub.EmitToSession(req.SessionID, "proto://upload_start", gin.H{
		"session_id": req.SessionID,
	})

	// Get multipart form
	form, err := c.MultipartForm()
	if err != nil {
		h.hub.EmitToSession(req.SessionID, "proto://upload_error", gin.H{
			"error": "failed to parse multipart form",
		})
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "failed to parse multipart form",
		})
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		h.hub.EmitToSession(req.SessionID, "proto://upload_error", gin.H{
			"error": "no files provided",
		})
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "no files provided",
		})
		return
	}

	// Create session directory
	sessionDir := filepath.Join(h.uploadDir, req.SessionID)
	if err := os.MkdirAll(sessionDir, 0755); err != nil {
		h.hub.EmitToSession(req.SessionID, "proto://upload_error", gin.H{
			"error": "failed to create session directory",
		})
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "failed to create session directory",
		})
		return
	}

	// Set root path
	if err := h.sessionManager.SetRootPath(req.SessionID, sessionDir); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "failed to set root path",
		})
		return
	}

	// Copy standard library files to session directory
	if err := h.stdlibManager.CopyToSession(sessionDir); err != nil {
		// Log error but don't fail the request
		fmt.Printf("Warning: failed to copy stdlib to session: %v\n", err)
	}

	uploadedFiles := []session.ProtoFile{}
	errorFiles := []string{}

	// Process each file
	for _, fileHeader := range files {
		// Get relative path from filename
		// Browser sends full path in filename when using webkitdirectory
		relativePath := fileHeader.Filename

		// Skip non-proto files
		if !strings.HasSuffix(relativePath, ".proto") {
			continue
		}

		// Create directory structure
		absPath := filepath.Join(sessionDir, relativePath)
		dir := filepath.Dir(absPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			errorFiles = append(errorFiles, relativePath)
			continue
		}

		// Save file
		src, err := fileHeader.Open()
		if err != nil {
			errorFiles = append(errorFiles, relativePath)
			continue
		}

		dst, err := os.Create(absPath)
		if err != nil {
			src.Close()
			errorFiles = append(errorFiles, relativePath)
			continue
		}

		_, err = io.Copy(dst, src)
		src.Close()
		dst.Close()

		if err != nil {
			errorFiles = append(errorFiles, relativePath)
			continue
		}

		// Add to uploaded files
		protoFile := session.ProtoFile{
			Name:         filepath.Base(relativePath),
			RelativePath: relativePath,
			AbsolutePath: absPath,
			Size:         fileHeader.Size,
		}

		uploadedFiles = append(uploadedFiles, protoFile)
		if err := h.sessionManager.AddProtoFile(req.SessionID, protoFile); err != nil {
			errorFiles = append(errorFiles, relativePath)
		}
	}

	// Emit completion event
	h.hub.EmitToSession(req.SessionID, "proto://upload_done", gin.H{
		"session_id":     req.SessionID,
		"uploaded_count": len(uploadedFiles),
		"error_count":    len(errorFiles),
		"files":          uploadedFiles,
	})

	// Return response
	response := gin.H{
		"session":        sess,
		"uploaded_files": uploadedFiles,
		"uploaded_count": len(uploadedFiles),
	}

	if len(errorFiles) > 0 {
		response["errors"] = errorFiles
		response["error_count"] = len(errorFiles)
	}

	c.JSON(http.StatusOK, response)
}

// ListFiles returns all proto files in a session
func (h *ProtoHandler) ListFiles(c *gin.Context) {
	sessionID := c.Param("sessionId")

	sess, exists := h.sessionManager.Get(sessionID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "session not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"session_id": sessionID,
		"files":      sess.ProtoFiles,
		"count":      len(sess.ProtoFiles),
	})
}

// GetFileContent returns the content of a specific proto file
func (h *ProtoHandler) GetFileContent(c *gin.Context) {
	sessionID := c.Param("sessionId")
	relativePath := c.Query("file")

	if relativePath == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "file parameter is required",
		})
		return
	}

	sess, exists := h.sessionManager.Get(sessionID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "session not found",
		})
		return
	}

	// Find file in session
	var targetFile *session.ProtoFile
	for _, file := range sess.ProtoFiles {
		if file.RelativePath == relativePath {
			targetFile = &file
			break
		}
	}

	if targetFile == nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": fmt.Sprintf("file not found: %s", relativePath),
		})
		return
	}

	// Read file content
	content, err := os.ReadFile(targetFile.AbsolutePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "failed to read file",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"file":    targetFile,
		"content": string(content),
	})
}

// AnalyzeDependencies analyzes proto file imports and dependencies
func (h *ProtoHandler) AnalyzeDependencies(c *gin.Context) {
	sessionID := c.Param("sessionId")

	sess, exists := h.sessionManager.Get(sessionID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "session not found",
		})
		return
	}

	if sess.RootPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "no files uploaded for this session",
		})
		return
	}

	// Emit start event
	h.hub.EmitToSession(sessionID, "proto://analyze_start", gin.H{
		"session_id": sessionID,
	})

	analyzer := proto.NewImportAnalyzer()

	// Analyze all imports
	imports, err := analyzer.AnalyzeDirectory(sess.RootPath)
	if err != nil {
		h.hub.EmitToSession(sessionID, "proto://analyze_error", gin.H{
			"error": fmt.Sprintf("failed to analyze imports: %v", err),
		})
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to analyze imports: %v", err),
		})
		return
	}

	// Resolve imports
	missingImports := analyzer.ResolveImports(sess.RootPath, imports)

	// Get missing standard libraries
	missingStdlib := analyzer.GetMissingStandardLibraries(imports)

	// Build dependency graph
	depGraph := analyzer.BuildDependencyGraph(sess.RootPath, imports)

	// Emit completion event
	h.hub.EmitToSession(sessionID, "proto://analyze_done", gin.H{
		"session_id":       sessionID,
		"total_files":      len(imports),
		"missing_count":    len(missingImports),
		"missing_stdlib":   missingStdlib,
		"has_missing":      len(missingImports) > 0,
	})

	c.JSON(http.StatusOK, gin.H{
		"session_id":      sessionID,
		"imports":         imports,
		"missing_imports": missingImports,
		"missing_stdlib":  missingStdlib,
		"dependency_graph": depGraph,
	})
}

// ListStdlibFiles returns available standard library proto files
func (h *ProtoHandler) ListStdlibFiles(c *gin.Context) {
	files, err := h.stdlibManager.ListAvailableFiles()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to list stdlib files: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"files": files,
		"count": len(files),
	})
}

// GetStdlibFileContent returns the content of a standard library file
func (h *ProtoHandler) GetStdlibFileContent(c *gin.Context) {
	filePath := c.Query("file")
	if filePath == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "file parameter is required",
		})
		return
	}

	content, err := h.stdlibManager.GetFileContent(filePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"file":    filePath,
		"content": content,
	})
}
