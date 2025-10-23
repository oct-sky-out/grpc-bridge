package static

import (
	"embed"
	"io/fs"
	"net/http"
)

// Embedded frontend build files from dist/web directory
//
// go:embed all:dist
var embeddedFiles embed.FS

// GetFS returns the embedded filesystem for serving static files
func GetFS() (fs.FS, error) {
	// Strip the "dist" prefix to serve files from root
	return fs.Sub(embeddedFiles, "dist")
}

// GetFileServer returns an http.FileServer for the embedded files
func GetFileServer() (http.Handler, error) {
	fsys, err := GetFS()
	if err != nil {
		return nil, err
	}
	return http.FileServer(http.FS(fsys)), nil
}
