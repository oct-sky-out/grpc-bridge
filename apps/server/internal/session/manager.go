package session

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

// Session represents a user session with uploaded proto files
type Session struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
	ProtoFiles []string `json:"proto_files"` // List of uploaded proto file paths
}

// Manager manages user sessions
type Manager struct {
	sessions map[string]*Session
	mu       sync.RWMutex
	ttl      time.Duration
}

// NewManager creates a new session manager
func NewManager() *Manager {
	m := &Manager{
		sessions: make(map[string]*Session),
		ttl:      24 * time.Hour, // Sessions expire after 24 hours
	}

	// Start cleanup goroutine
	go m.cleanupExpired()

	return m
}

// Create creates a new session
func (m *Manager) Create() *Session {
	m.mu.Lock()
	defer m.mu.Unlock()

	session := &Session{
		ID:        uuid.New().String(),
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(m.ttl),
		ProtoFiles: []string{},
	}

	m.sessions[session.ID] = session
	return session
}

// Get retrieves a session by ID
func (m *Manager) Get(id string) (*Session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	session, exists := m.sessions[id]
	if !exists {
		return nil, false
	}

	// Check if expired
	if time.Now().After(session.ExpiresAt) {
		return nil, false
	}

	return session, true
}

// Delete removes a session
func (m *Manager) Delete(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.sessions, id)
}

// AddProtoFile adds a proto file to a session
func (m *Manager) AddProtoFile(sessionID, filePath string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, exists := m.sessions[sessionID]
	if !exists {
		return ErrSessionNotFound
	}

	session.ProtoFiles = append(session.ProtoFiles, filePath)
	return nil
}

// cleanupExpired removes expired sessions periodically
func (m *Manager) cleanupExpired() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		m.mu.Lock()
		now := time.Now()
		for id, session := range m.sessions {
			if now.After(session.ExpiresAt) {
				delete(m.sessions, id)
			}
		}
		m.mu.Unlock()
	}
}

// Errors
var (
	ErrSessionNotFound = &SessionError{"session not found"}
)

type SessionError struct {
	Message string
}

func (e *SessionError) Error() string {
	return e.Message
}
