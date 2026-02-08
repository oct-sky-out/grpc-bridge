package proto

import (
    "bufio"
    "fmt"
    "os"
    "path/filepath"
    "regexp"
    "strings"

    "github.com/grpc-bridge/server/internal/session"
)

// ServiceParser provides lightweight parsing of proto service & rpc definitions.
// This is a heuristic parser (not a full protobuf parser) meant to extract
// enough metadata for listing services and their methods without invoking protoc.
type ServiceParser struct {
    rePackage *regexp.Regexp
    reService *regexp.Regexp
    reRPC     *regexp.Regexp
}

// NewServiceParser creates a new ServiceParser.
func NewServiceParser() *ServiceParser {
    return &ServiceParser{
        rePackage: regexp.MustCompile(`^\s*package\s+([a-zA-Z0-9_\.]+)\s*;`),
        reService: regexp.MustCompile(`^\s*service\s+([A-Za-z0-9_]+)\s*\{`),
        // rpc Foo(Stream Input) returns (stream Output) {}; captures: name, reqStream?, inputType, respStream?, outputType
        reRPC:     regexp.MustCompile(`^\s*rpc\s+([A-Za-z0-9_]+)\s*\(\s*(stream\s+)?([\.A-Za-z0-9_]+)\s*\)\s+returns\s*\(\s*(stream\s+)?([\.A-Za-z0-9_]+)\s*\)`),
    }
}

// ParseServices walks provided proto files and extracts services.
// protoFiles: absolute paths. rootDir: session root to compute relative file path for response.
func (p *ServiceParser) ParseServices(rootDir string, protoFiles []string) ([]session.ServiceInfo, error) {
    services := []session.ServiceInfo{}

    for _, filePath := range protoFiles {
        f, err := os.Open(filePath)
        if err != nil {
            return nil, fmt.Errorf("open proto file: %w", err)
        }
        scanner := bufio.NewScanner(f)

        pkg := ""
        currentServiceIndex := -1
        braceDepth := 0

        rel := filePath
        if rp, err := filepath.Rel(rootDir, filePath); err == nil {
            rel = filepath.ToSlash(rp)
        }

        for scanner.Scan() {
            line := scanner.Text()
            // Strip inline comments (// ...)
            if i := strings.Index(line, "//"); i >= 0 {
                line = line[:i]
            }
            line = strings.TrimSpace(line)
            if line == "" { continue }

            if pkg == "" {
                if m := p.rePackage.FindStringSubmatch(line); len(m) == 2 {
                    pkg = m[1]
                }
            }

            if m := p.reService.FindStringSubmatch(line); len(m) == 2 {
                svcName := m[1]
                fq := svcName
                if pkg != "" { fq = pkg + "." + svcName }
                services = append(services, session.ServiceInfo{
                    FQService: fq,
                    File:      rel,
                    Methods:   []session.MethodInfo{},
                })
                currentServiceIndex = len(services) - 1
                // service opening brace encountered; set brace depth = 1 for this block
                braceDepth = 1
                continue
            }

            if currentServiceIndex >= 0 {
                // Track braces to know when service block ends
                braceDepth += strings.Count(line, "{")
                braceDepth -= strings.Count(line, "}")
                if braceDepth <= 0 { // service block ended
                    currentServiceIndex = -1
                    braceDepth = 0
                    continue
                }
                if m := p.reRPC.FindStringSubmatch(line); len(m) == 6 {
                    methodName := m[1]
                    reqStream := m[2] != ""
                    inputType := m[3]
                    respStream := m[4] != ""
                    outputType := m[5]
                    streaming := reqStream || respStream
                    // Normalize types to fully-qualified if package not present and local package known.
                    if !strings.Contains(inputType, ".") && pkg != "" {
                        inputType = pkg + "." + inputType
                    }
                    if !strings.Contains(outputType, ".") && pkg != "" {
                        outputType = pkg + "." + outputType
                    }
                    si := &services[currentServiceIndex]
                    si.Methods = append(si.Methods, session.MethodInfo{
                        Name:       methodName,
                        InputType:  inputType,
                        OutputType: outputType,
                        Streaming:  streaming,
                    })
                }
            }
        }
        f.Close()
        if err := scanner.Err(); err != nil {
            return nil, fmt.Errorf("scan proto file %s: %w", filePath, err)
        }
    }

    return services, nil
}
