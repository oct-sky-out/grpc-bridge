package proto

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// ImportAnalyzer analyzes proto file dependencies
type ImportAnalyzer struct {
	importRegex *regexp.Regexp
}

// NewImportAnalyzer creates a new import analyzer
func NewImportAnalyzer() *ImportAnalyzer {
	// Regex to match: import "path/to/file.proto";
	// Also matches: import public "path.proto";
	return &ImportAnalyzer{
		importRegex: regexp.MustCompile(`^\s*import\s+(?:public\s+)?["']([^"']+)["']\s*;`),
	}
}

// ImportInfo represents information about a proto import
type ImportInfo struct {
	ImportPath string   // The import path as written in the proto file
	IsPublic   bool     // Whether it's a public import
	SourceFile string   // The file that contains this import
	IsStdlib   bool     // Whether this is a standard library import
	Found      bool     // Whether the imported file was found
	ResolvedPath string // Resolved absolute path (if found)
}

// AnalyzeFile analyzes a single proto file and extracts its imports
func (a *ImportAnalyzer) AnalyzeFile(filePath string) ([]ImportInfo, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	var imports []ImportInfo
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := scanner.Text()

		// Check if line contains an import
		matches := a.importRegex.FindStringSubmatch(line)
		if len(matches) > 1 {
			importPath := matches[1]
			isPublic := strings.Contains(line, "public")
			isStdlib := isStandardLibrary(importPath)

			imports = append(imports, ImportInfo{
				ImportPath: importPath,
				IsPublic:   isPublic,
				SourceFile: filePath,
				IsStdlib:   isStdlib,
				Found:      false, // Will be updated by ResolveImports
			})
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading file: %w", err)
	}

	return imports, nil
}

// AnalyzeDirectory analyzes all proto files in a directory
func (a *ImportAnalyzer) AnalyzeDirectory(rootDir string) (map[string][]ImportInfo, error) {
	result := make(map[string][]ImportInfo)

	err := filepath.Walk(rootDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip directories and non-proto files
		if info.IsDir() || !strings.HasSuffix(path, ".proto") {
			return nil
		}

		imports, err := a.AnalyzeFile(path)
		if err != nil {
			return fmt.Errorf("error analyzing %s: %w", path, err)
		}

		// Store with relative path
		relPath, err := filepath.Rel(rootDir, path)
		if err != nil {
			relPath = path
		}

		result[relPath] = imports
		return nil
	})

	if err != nil {
		return nil, err
	}

	return result, nil
}

// ResolveImports checks if all imports can be resolved within the root directory
func (a *ImportAnalyzer) ResolveImports(rootDir string, imports map[string][]ImportInfo) []ImportInfo {
	var missing []ImportInfo

	// Build a set of available proto files
	availableFiles := make(map[string]bool)
	filepath.Walk(rootDir, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() && strings.HasSuffix(path, ".proto") {
			relPath, _ := filepath.Rel(rootDir, path)
			// Normalize path separators
			relPath = filepath.ToSlash(relPath)
			availableFiles[relPath] = true
		}
		return nil
	})

	// Check each import
	for sourceFile, importList := range imports {
		for i, imp := range importList {
			// Skip standard library imports
			if imp.IsStdlib {
				imports[sourceFile][i].Found = true
				continue
			}

			// Normalize import path
			normalizedImport := filepath.ToSlash(imp.ImportPath)

			// Check if file exists
			if availableFiles[normalizedImport] {
				imports[sourceFile][i].Found = true
				imports[sourceFile][i].ResolvedPath = filepath.Join(rootDir, imp.ImportPath)
			} else {
				imports[sourceFile][i].Found = false
				missing = append(missing, imports[sourceFile][i])
			}
		}
	}

	return missing
}

// DependencyGraph represents a dependency graph of proto files
type DependencyGraph struct {
	Nodes map[string]*DependencyNode
}

// DependencyNode represents a node in the dependency graph
type DependencyNode struct {
	FilePath     string
	Dependencies []string // Files this node depends on
	Dependents   []string // Files that depend on this node
}

// BuildDependencyGraph builds a dependency graph from import analysis
func (a *ImportAnalyzer) BuildDependencyGraph(rootDir string, imports map[string][]ImportInfo) *DependencyGraph {
	graph := &DependencyGraph{
		Nodes: make(map[string]*DependencyNode),
	}

	// Initialize nodes
	for file := range imports {
		graph.Nodes[file] = &DependencyNode{
			FilePath:     file,
			Dependencies: []string{},
			Dependents:   []string{},
		}
	}

	// Build edges
	for sourceFile, importList := range imports {
		node := graph.Nodes[sourceFile]
		for _, imp := range importList {
			if imp.Found && !imp.IsStdlib {
				normalizedImport := filepath.ToSlash(imp.ImportPath)
				node.Dependencies = append(node.Dependencies, normalizedImport)

				// Add reverse dependency
				if depNode, exists := graph.Nodes[normalizedImport]; exists {
					depNode.Dependents = append(depNode.Dependents, sourceFile)
				}
			}
		}
	}

	return graph
}

// isStandardLibrary checks if an import is from the standard proto library
func isStandardLibrary(importPath string) bool {
	stdlibPrefixes := []string{
		"google/protobuf/",
		"google/api/",
		"google/rpc/",
		"google/type/",
	}

	for _, prefix := range stdlibPrefixes {
		if strings.HasPrefix(importPath, prefix) {
			return true
		}
	}

	return false
}

// GetMissingStandardLibraries returns a list of missing standard library imports
func (a *ImportAnalyzer) GetMissingStandardLibraries(imports map[string][]ImportInfo) []string {
	stdlibSet := make(map[string]bool)

	for _, importList := range imports {
		for _, imp := range importList {
			if imp.IsStdlib && !imp.Found {
				stdlibSet[imp.ImportPath] = true
			}
		}
	}

	result := make([]string, 0, len(stdlibSet))
	for path := range stdlibSet {
		result = append(result, path)
	}

	return result
}
