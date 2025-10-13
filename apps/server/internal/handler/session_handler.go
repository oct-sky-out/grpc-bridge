package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/grpc-bridge/server/internal/session"
)

type SessionHandler struct {
	sessionManager *session.Manager
}

func NewSessionHandler(sm *session.Manager) *SessionHandler {
	return &SessionHandler{
		sessionManager: sm,
	}
}

// CreateSessionRequest represents the request body for creating a session
type CreateSessionRequest struct {
	Name string `json:"name"` // Optional user-specified name
}

// CreateSession creates a new session
func (h *SessionHandler) CreateSession(c *gin.Context) {
	var req CreateSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// If no body provided, create session with empty name
		req.Name = ""
	}

	session := h.sessionManager.Create(req.Name)

	c.JSON(http.StatusCreated, gin.H{
		"session": session,
	})
}

// GetSession retrieves session information
func (h *SessionHandler) GetSession(c *gin.Context) {
	sessionID := c.Param("sessionId")

	session, exists := h.sessionManager.Get(sessionID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "session not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"session": session,
	})
}

// DeleteSession removes a session
func (h *SessionHandler) DeleteSession(c *gin.Context) {
	sessionID := c.Param("sessionId")

	h.sessionManager.Delete(sessionID)

	c.JSON(http.StatusOK, gin.H{
		"message": "session deleted",
	})
}
