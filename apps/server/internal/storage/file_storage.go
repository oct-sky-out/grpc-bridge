package storage

import (
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

// FileStorage handles file uploads and storage
type FileStorage struct {
	baseDir string
}

// NewFileStorage creates a new file storage
func NewFileStorage(baseDir string) *FileStorage {
	// Create base directory if it doesn't exist
	os.MkdirAll(baseDir, 0755)

	return &FileStorage{
		baseDir: baseDir,
	}
}

// SaveFile saves an uploaded file and returns the file path
func (fs *FileStorage) SaveFile(sessionID string, file *multipart.FileHeader) (string, error) {
	// Validate file extension
	if !strings.HasSuffix(file.Filename, ".proto") {
		return "", fmt.Errorf("invalid file type: %s (only .proto files allowed)", file.Filename)
	}

	// Create session directory
	sessionDir := filepath.Join(fs.baseDir, sessionID)
	if err := os.MkdirAll(sessionDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create session directory: %w", err)
	}

	// Generate unique filename
	filename := fmt.Sprintf("%s_%s", uuid.New().String()[:8], file.Filename)
	filePath := filepath.Join(sessionDir, filename)

	// Open uploaded file
	src, err := file.Open()
	if err != nil {
		return "", fmt.Errorf("failed to open uploaded file: %w", err)
	}
	defer src.Close()

	// Create destination file
	dst, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to create file: %w", err)
	}
	defer dst.Close()

	// Copy file contents
	if _, err := io.Copy(dst, src); err != nil {
		return "", fmt.Errorf("failed to save file: %w", err)
	}

	return filePath, nil
}

// GetSessionFiles returns all proto files for a session
func (fs *FileStorage) GetSessionFiles(sessionID string) ([]string, error) {
	sessionDir := filepath.Join(fs.baseDir, sessionID)

	files, err := os.ReadDir(sessionDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, fmt.Errorf("failed to read session directory: %w", err)
	}

	var protoFiles []string
	for _, file := range files {
		if !file.IsDir() && strings.HasSuffix(file.Name(), ".proto") {
			protoFiles = append(protoFiles, filepath.Join(sessionDir, file.Name()))
		}
	}

	return protoFiles, nil
}

// DeleteSession removes all files for a session
func (fs *FileStorage) DeleteSession(sessionID string) error {
	sessionDir := filepath.Join(fs.baseDir, sessionID)
	if err := os.RemoveAll(sessionDir); err != nil {
		return fmt.Errorf("failed to delete session directory: %w", err)
	}
	return nil
}

// GetFilePath returns the full path for a file
func (fs *FileStorage) GetFilePath(sessionID, filename string) string {
	return filepath.Join(fs.baseDir, sessionID, filename)
}
