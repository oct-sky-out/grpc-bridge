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
	fmt.Printf("[UploadStructure] Created/ensured session root dir: %s\n", sessionDir)

	// Set root path
	if err := h.sessionManager.SetRootPath(req.SessionID, sessionDir); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "failed to set root path",
		})
		return
	}

	// Copy standard library files to session directory
	fmt.Printf("[ProtoHandler] Copying stdlib to session: %s\n", sessionDir)
	if err := h.stdlibManager.CopyToSession(sessionDir); err != nil {
		// Log error but don't fail the request
		fmt.Printf("[ProtoHandler] Warning: failed to copy stdlib to session: %v\n", err)
	} else {
		fmt.Printf("[ProtoHandler] Successfully copied stdlib to session\n")
	}

	uploadedFiles := []session.ProtoFile{}
	errorFiles := []string{}
	dirSet := map[string]struct{}{}

	// Determine common leading directory prefix (root folder name chosen in browser)
	// webkitRelativePath provides paths like: <rootFolder>/sub/dir/file.proto
	// We want to strip the first segment so UI sees relative paths identical to desktop scan output.
	var leadingPrefix string
	if len(files) > 0 {
		// Find first .proto file to infer leading segment
		for _, fh := range files {
			// Use original filename attribute as provided via FormData append (webkitRelativePath)
			parts := strings.Split(fh.Filename, "/")
			if len(parts) > 1 { // has a folder component
				leadingPrefix = parts[0]
				break
			}
		}
		fmt.Printf("[ProtoHandler] Inferred leading prefix: '%s'\n", leadingPrefix)
	}

	normalizeRelPath := func(p string) string {
		// Ensure forward slashes
		p = strings.ReplaceAll(p, "\\", "/")
		// Strip leading ./ if present
		p = strings.TrimPrefix(p, "./")
		if leadingPrefix != "" && strings.HasPrefix(p, leadingPrefix+"/") {
			p = strings.TrimPrefix(p, leadingPrefix+"/")
		}
		// Prevent empty path (should not happen; fallback to original filename base)
		if p == "" {
			return filepath.Base(p)
		}
		return p
	}

	// Single-pass: for each proto file create its directory (using relative path) then store the file
	for _, fileHeader := range files {
		originalPath := fileHeader.Filename
		// Diagnostic: log raw filename and whether it contains any directory separators
		containsSlash := strings.Contains(originalPath, "/")
		if !containsSlash {
			fmt.Printf("[UploadStructure][diag] Raw filename has no slash (flat): %s\n", originalPath)
		} else {
			fmt.Printf("[UploadStructure][diag] Raw filename with path: %s\n", originalPath)
		}
		relativePath := normalizeRelPath(originalPath)
		fmt.Printf("originalPath: %s\n", originalPath)
		fmt.Printf("relativePath: %s\n", relativePath)
		if !strings.HasSuffix(relativePath, ".proto") { continue }

		// Directory metadata collection
		relDirForMeta := filepath.Dir(relativePath)
		if relDirForMeta != "." && relDirForMeta != "" {
			parts := strings.Split(relDirForMeta, "/")
			cur := ""
			for i, p := range parts { if i == 0 { cur = p } else { cur = cur + "/" + p }; if _, exists := dirSet[cur]; !exists { dirSet[cur] = struct{}{} } }
		}

		// Ensure directory exists (mkdir based on relative path directory)
		absPath := filepath.Join(sessionDir, relativePath)
		absDir := filepath.Dir(absPath)
		if err := os.MkdirAll(absDir, 0755); err != nil {
			errorFiles = append(errorFiles, relativePath)
			continue
		}
		relDirPrinted := filepath.Dir(relativePath)
		if relDirPrinted == "." { relDirPrinted = "(root)" }
		fmt.Printf("[UploadStructure] [session=%s] dir ok: %s -> %s (file=%s)\n", req.SessionID, relDirPrinted, absDir, relativePath)

		// Save file content
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
		src.Close(); dst.Close()
		if err != nil {
			errorFiles = append(errorFiles, relativePath)
			continue
		}

		protoFile := session.ProtoFile{ Name: filepath.Base(relativePath), RelativePath: relativePath, AbsolutePath: absPath, Size: fileHeader.Size }
		fmt.Printf("[UploadStructure] Stored file: %s (size=%d)\n", protoFile.AbsolutePath, protoFile.Size)
		uploadedFiles = append(uploadedFiles, protoFile)
		if err := h.sessionManager.AddProtoFile(req.SessionID, protoFile); err != nil {
			errorFiles = append(errorFiles, relativePath)
		}
	}

	// Persist directory metadata into session
	if len(dirSet) > 0 {
		dirs := make([]session.ProtoDir, 0, len(dirSet))
		for d := range dirSet {
			absDir := filepath.Join(sessionDir, d)
			dirs = append(dirs, session.ProtoDir{ RelativePath: d, AbsolutePath: absDir })
		}
		if err := h.sessionManager.AddDirectories(req.SessionID, dirs); err != nil {
			fmt.Printf("[ProtoHandler] Warning: failed to add directories: %v\n", err)
		}
	}

	// Prepare directory list for event
	dirList := make([]string, 0, len(dirSet))
	for d := range dirSet { dirList = append(dirList, d) }

	// Build lightweight file descriptors for event (avoid leaking absolute paths unless needed)
	eventFiles := make([]gin.H, 0, len(uploadedFiles))
	for _, f := range uploadedFiles {
		eventFiles = append(eventFiles, gin.H{
			"name":          f.Name,
			"relative_path": f.RelativePath,
			"size":          f.Size,
		})
	}

	clientStripped := leadingPrefix != "" // heuristic: prefix was detected and removed
	h.hub.EmitToSession(req.SessionID, "proto://upload_done", gin.H{
		"session_id":       req.SessionID,
		"uploaded_count":   len(uploadedFiles),
		"error_count":      len(errorFiles),
		"files":            eventFiles,
		"directories":      dirList,
		"normalized":       true,
		"stripped_prefix":  leadingPrefix,
		"client_stripped":  clientStripped,
	})

	response := gin.H{
		"session":         sess,
		"uploaded_files":  uploadedFiles,
		"uploaded_count":  len(uploadedFiles),
		"directories":     dirList,
		"client_stripped": leadingPrefix != "",
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
	h.hub.EmitToSession(sessionID, "proto://index_start", gin.H{
		"session_id": sessionID,
	})

	analyzer := proto.NewImportAnalyzer()

	// Analyze all imports
	imports, err := analyzer.AnalyzeDirectory(sess.RootPath)
	if err != nil {
		h.hub.EmitToSession(sessionID, "proto://index_error", gin.H{
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

	// Build file list (relative paths)
	files := make([]string, 0, len(sess.ProtoFiles))
	for _, f := range sess.ProtoFiles {
		files = append(files, f.RelativePath)
	}

	fmt.Printf("[AnalyzeDependencies] Sending proto://index_done with %d files\n", len(files))
	fmt.Printf("[AnalyzeDependencies] Files: %v\n", files)

	// Emit completion event (compatible with desktop proto://index_done)
	h.hub.EmitToSession(sessionID, "proto://index_done", gin.H{
		"rootId": sessionID,
		"summary": gin.H{
			"files":    len(files),
			"services": 0, // Will be populated by listServices call
		},
		"services": []interface{}{}, // Empty, client will call listServices
		"files":    files,
	})

	c.JSON(http.StatusOK, gin.H{
		"session_id":       sessionID,
		"imports":          imports,
		"missing_imports":  missingImports,
		"missing_stdlib":   missingStdlib,
		"dependency_graph": depGraph,
		"files":            files,
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
