package proto

import (
	"embed"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// Embedded standard proto library files
//
//go:embed all:stdlib
var stdlibFiles embed.FS

// StdlibManager manages standard proto library files
type StdlibManager struct {
	embeddedFS embed.FS
}

// NewStdlibManager creates a new standard library manager
func NewStdlibManager() *StdlibManager {
	return &StdlibManager{
		embeddedFS: stdlibFiles,
	}
}

// ExtractToDirectory extracts all standard library files to a target directory
func (m *StdlibManager) ExtractToDirectory(targetDir string) error {
	return fs.WalkDir(m.embeddedFS, "stdlib", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		// Skip the stdlib root directory itself
		if path == "stdlib" {
			return nil
		}

		// Remove "stdlib/" prefix from path for target
		// e.g., "stdlib/google/api/annotations.proto" -> "google/api/annotations.proto"
		relativePath := strings.TrimPrefix(path, "stdlib/")
		targetPath := filepath.Join(targetDir, relativePath)

		if d.IsDir() {
			// Create directory
			return os.MkdirAll(targetPath, 0755)
		}

		// Create parent directory if needed
		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return fmt.Errorf("failed to create directory: %w", err)
		}

		// Read embedded file
		content, err := m.embeddedFS.ReadFile(path)
		if err != nil {
			return fmt.Errorf("failed to read embedded file %s: %w", path, err)
		}

		// Write to target
		if err := os.WriteFile(targetPath, content, 0644); err != nil {
			return fmt.Errorf("failed to write file %s: %w", targetPath, err)
		}

		return nil
	})
}

// CopyToSession copies standard library files to a session directory
func (m *StdlibManager) CopyToSession(sessionDir string) error {
	// Extract to session directory
	return m.ExtractToDirectory(sessionDir)
}

// ListAvailableFiles returns a list of all available standard library files
func (m *StdlibManager) ListAvailableFiles() ([]string, error) {
	var files []string

	err := fs.WalkDir(m.embeddedFS, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if !d.IsDir() && filepath.Ext(path) == ".proto" {
			// Remove "stdlib/" prefix for cleaner paths
			cleanPath := filepath.ToSlash(path)
			if len(cleanPath) > 7 && cleanPath[:7] == "stdlib/" {
				cleanPath = cleanPath[7:]
			}
			files = append(files, cleanPath)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return files, nil
}

// GetFileContent returns the content of a specific stdlib file
func (m *StdlibManager) GetFileContent(relativePath string) (string, error) {
	// Add stdlib prefix if not present
	fullPath := relativePath
	if len(relativePath) < 7 || relativePath[:7] != "stdlib/" {
		fullPath = "stdlib/" + relativePath
	}

	content, err := m.embeddedFS.ReadFile(fullPath)
	if err != nil {
		return "", fmt.Errorf("file not found: %s", relativePath)
	}

	return string(content), nil
}

// ExtractFile extracts a single file to a target location
func (m *StdlibManager) ExtractFile(relativePath, targetPath string) error {
	// Add stdlib prefix if not present
	fullPath := relativePath
	if len(relativePath) < 7 || relativePath[:7] != "stdlib/" {
		fullPath = "stdlib/" + relativePath
	}

	// Read embedded file
	file, err := m.embeddedFS.Open(fullPath)
	if err != nil {
		return fmt.Errorf("failed to open embedded file: %w", err)
	}
	defer file.Close()

	// Create parent directory
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	// Create target file
	targetFile, err := os.Create(targetPath)
	if err != nil {
		return fmt.Errorf("failed to create target file: %w", err)
	}
	defer targetFile.Close()

	// Copy content
	if _, err := io.Copy(targetFile, file); err != nil {
		return fmt.Errorf("failed to copy file: %w", err)
	}

	return nil
}
