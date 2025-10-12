package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/grpc-bridge/server/internal/session"
	"github.com/grpc-bridge/server/internal/storage"
)

type FileHandler struct {
	sessionManager *session.Manager
	fileStorage    *storage.FileStorage
}

func NewFileHandler(sm *session.Manager, fs *storage.FileStorage) *FileHandler {
	return &FileHandler{
		sessionManager: sm,
		fileStorage:    fs,
	}
}

// UploadProtoFiles handles proto file uploads
func (h *FileHandler) UploadProtoFiles(c *gin.Context) {
	sessionID := c.GetHeader("X-Session-ID")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "session ID required in X-Session-ID header",
		})
		return
	}

	// Verify session exists
	_, exists := h.sessionManager.Get(sessionID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "session not found",
		})
		return
	}

	// Get uploaded files
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "failed to parse multipart form: " + err.Error(),
		})
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "no files provided",
		})
		return
	}

	var uploadedFiles []string
	var errors []string

	for _, file := range files {
		filePath, err := h.fileStorage.SaveFile(sessionID, file)
		if err != nil {
			errors = append(errors, err.Error())
			continue
		}

		// Add file to session
		if err := h.sessionManager.AddProtoFile(sessionID, filePath); err != nil {
			errors = append(errors, "failed to add file to session: "+err.Error())
			continue
		}

		uploadedFiles = append(uploadedFiles, filePath)
	}

	response := gin.H{
		"uploaded": len(uploadedFiles),
		"files":    uploadedFiles,
	}

	if len(errors) > 0 {
		response["errors"] = errors
	}

	statusCode := http.StatusCreated
	if len(uploadedFiles) == 0 {
		statusCode = http.StatusBadRequest
	}

	c.JSON(statusCode, response)
}

// ListFiles returns all proto files for a session
func (h *FileHandler) ListFiles(c *gin.Context) {
	sessionID := c.Param("sessionId")

	// Verify session exists
	session, exists := h.sessionManager.Get(sessionID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "session not found",
		})
		return
	}

	files, err := h.fileStorage.GetSessionFiles(sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "failed to list files: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"session_id": session.ID,
		"files":      files,
		"count":      len(files),
	})
}
