package session

import (
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
)

// ProtoFile represents a proto file with its relative path
type ProtoFile struct {
	Name         string `json:"name"`          // File name (e.g., "service.proto")
	RelativePath string `json:"relative_path"` // Path relative to root (e.g., "api/v1/service.proto")
	AbsolutePath string `json:"absolute_path"` // Absolute path on server
	Size         int64  `json:"size"`          // File size in bytes
}

// ProtoDir represents a directory in the uploaded proto structure
// We store directories explicitly so the client (or future tooling) does not
// need to re-derive hierarchy from file paths alone (useful for empty dirs
// or quickly rendering large trees).
type ProtoDir struct {
	RelativePath string `json:"relative_path"` // e.g., "api/v1"
	AbsolutePath string `json:"absolute_path"` // Full path on server
}

// ServiceInfo represents a parsed gRPC service
type ServiceInfo struct {
	FQService string       `json:"fq_service"` // Fully qualified service name
	File      string       `json:"file"`       // Proto file containing this service
	Methods   []MethodInfo `json:"methods"`    // Service methods
}

// MethodInfo represents a gRPC method
type MethodInfo struct {
	Name       string `json:"name"`        // Method name
	InputType  string `json:"input_type"`  // Fully qualified input type
	OutputType string `json:"output_type"` // Fully qualified output type
	Streaming  bool   `json:"streaming"`   // Whether it's a streaming method
}

// Session represents a user session with uploaded proto files
type Session struct {
	ID         string        `json:"id"`
	Name       string        `json:"name"`        // User-specified name for this session
	CreatedAt  time.Time     `json:"created_at"`
	ExpiresAt  time.Time     `json:"expires_at"`
	ProtoFiles []ProtoFile   `json:"proto_files"` // Uploaded proto files with structure
	Directories []ProtoDir   `json:"directories"` // Uploaded directory hierarchy (excluding root)
	Services   []ServiceInfo `json:"services"`    // Parsed services (cached)
	ParsedAt   *time.Time    `json:"parsed_at"`   // Last parse time
	RootPath   string        `json:"root_path"`   // Root directory path on server
}

// Manager manages user sessions
type Manager struct {
	sessions  map[string]*Session
	mu        sync.RWMutex
	ttl       time.Duration
	uploadDir string // Root upload directory for cleanup
}

// NewManager creates a new session manager
func NewManager(uploadDir string) *Manager {
	m := &Manager{
		sessions:  make(map[string]*Session),
		ttl:       24 * time.Hour, // Sessions expire after 24 hours
		uploadDir: uploadDir,
	}

	// Start cleanup goroutine
	go m.cleanupExpired()

	return m
}

// Create creates a new session with optional name
func (m *Manager) Create(name string) *Session {
	m.mu.Lock()
	defer m.mu.Unlock()

	sessionID := uuid.New().String()
	session := &Session{
		ID:         sessionID,
		Name:       name,
		CreatedAt:  time.Now(),
		ExpiresAt:  time.Now().Add(m.ttl),
		ProtoFiles: []ProtoFile{},
		Directories: []ProtoDir{},
		Services:   []ServiceInfo{},
		RootPath:   "", // Will be set when files are uploaded
	}

	m.sessions[session.ID] = session
	return session
}

// CreateWithID creates a new session with a specific ID
func (m *Manager) CreateWithID(id, name string) *Session {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check if session already exists
	if existing, exists := m.sessions[id]; exists {
		return existing
	}

	session := &Session{
		ID:         id,
		Name:       name,
		CreatedAt:  time.Now(),
		ExpiresAt:  time.Now().Add(m.ttl),
		ProtoFiles: []ProtoFile{},
		Directories: []ProtoDir{},
		Services:   []ServiceInfo{},
		RootPath:   "",
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

// Delete removes a session and its directory
func (m *Manager) Delete(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, exists := m.sessions[id]
	if exists && session.RootPath != "" {
		// Delete session directory
		if err := os.RemoveAll(session.RootPath); err != nil {
			fmt.Printf("Error removing session directory %s: %v\n", session.RootPath, err)
		}
	}

	delete(m.sessions, id)
}

// AddProtoFile adds a proto file to a session
func (m *Manager) AddProtoFile(sessionID string, file ProtoFile) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, exists := m.sessions[sessionID]
	if !exists {
		return ErrSessionNotFound
	}

	session.ProtoFiles = append(session.ProtoFiles, file)
	return nil
}

// AddDirectories merges a set of directories into the session (deduplicated)
func (m *Manager) AddDirectories(sessionID string, dirs []ProtoDir) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, exists := m.sessions[sessionID]
	if !exists {
		return ErrSessionNotFound
	}

	// Build a set of existing dirs for quick lookup
	existing := make(map[string]struct{}, len(session.Directories))
	for _, d := range session.Directories { existing[d.RelativePath] = struct{}{} }

	for _, d := range dirs {
		if d.RelativePath == "" { // skip root marker
			continue
		}
		if _, ok := existing[d.RelativePath]; ok { continue }
		session.Directories = append(session.Directories, d)
		existing[d.RelativePath] = struct{}{}
	}
	return nil
}

// SetRootPath sets the root path for a session
func (m *Manager) SetRootPath(sessionID, rootPath string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, exists := m.sessions[sessionID]
	if !exists {
		return ErrSessionNotFound
	}

	session.RootPath = rootPath
	return nil
}

// SetServices updates the cached services for a session
func (m *Manager) SetServices(sessionID string, services []ServiceInfo) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, exists := m.sessions[sessionID]
	if !exists {
		return ErrSessionNotFound
	}

	now := time.Now()
	session.Services = services
	session.ParsedAt = &now
	return nil
}

// cleanupExpired removes expired sessions and their directories periodically
func (m *Manager) cleanupExpired() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		m.cleanupExpiredSessions()
	}
}

// cleanupExpiredSessions performs the actual cleanup
func (m *Manager) cleanupExpiredSessions() {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	for id, session := range m.sessions {
		if now.After(session.ExpiresAt) {
			// Delete session directory if it exists
			if session.RootPath != "" {
				if err := os.RemoveAll(session.RootPath); err != nil {
					// Log error but continue cleanup
					fmt.Printf("Error removing session directory %s: %v\n", session.RootPath, err)
				}
			}
			// Remove from memory
			delete(m.sessions, id)
		}
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
