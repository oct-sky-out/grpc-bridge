package grpc

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

// Proxy handles gRPC communication using grpcurl
type Proxy struct {
	grpcurlPath string
}

// NewProxy creates a new gRPC proxy
func NewProxy() *Proxy {
	// Try to find grpcurl in PATH
	grpcurlPath, err := exec.LookPath("grpcurl")
	if err != nil {
		// If not found, use default path
		grpcurlPath = "grpcurl"
	}

	return &Proxy{
		grpcurlPath: grpcurlPath,
	}
}

// CallOptions represents options for a gRPC call
type CallOptions struct {
	SessionID   string
	ProtoFiles  []string
	Target      string
	Service     string
	Method      string
	Data        interface{}
	Metadata    map[string]string
	Plaintext   bool
	ImportPaths []string
}

// CallResult represents the result of a gRPC call
type CallResult struct {
	Response interface{} `json:"response"`
	Headers  interface{} `json:"headers,omitempty"`
	Trailers interface{} `json:"trailers,omitempty"`
	Status   string      `json:"status"`
}

// Call executes a gRPC call using grpcurl
func (p *Proxy) Call(ctx context.Context, opts CallOptions) (*CallResult, error) {
	args := []string{}

	// Add proto files
	for _, protoFile := range opts.ProtoFiles {
		args = append(args, "-proto", protoFile)
	}

	// Add import paths
	for _, importPath := range opts.ImportPaths {
		args = append(args, "-import-path", importPath)
	}

	// Add metadata headers
	for key, value := range opts.Metadata {
		args = append(args, "-H", fmt.Sprintf("%s: %s", key, value))
	}

	// Add plaintext flag if needed
	if opts.Plaintext {
		args = append(args, "-plaintext")
	}

	// Add format flags for better output
	args = append(args, "-format", "json")
	args = append(args, "-emit-defaults")

	// Add data if provided
	if opts.Data != nil {
		dataJSON, err := json.Marshal(opts.Data)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request data: %w", err)
		}
		args = append(args, "-d", string(dataJSON))
	} else {
		args = append(args, "-d", "{}")
	}

	// Add target and method
	fullMethod := fmt.Sprintf("%s/%s", opts.Service, opts.Method)
	args = append(args, opts.Target, fullMethod)

	// Execute grpcurl command
	cmd := exec.CommandContext(ctx, p.grpcurlPath, args...)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return nil, fmt.Errorf("grpcurl execution failed: %s\nstderr: %s", err.Error(), stderr.String())
	}

	// Parse output
	var response interface{}
	if stdout.Len() > 0 {
		if err := json.Unmarshal(stdout.Bytes(), &response); err != nil {
			// If not valid JSON, return raw output
			response = stdout.String()
		}
	}

	result := &CallResult{
		Response: response,
		Status:   "OK",
	}

	return result, nil
}

// ListOptions represents options for listing services
type ListOptions struct {
	SessionID  string
	ProtoFiles []string
	Target     string
	Plaintext  bool
}

// ListServices lists available gRPC services
func (p *Proxy) ListServices(ctx context.Context, opts ListOptions) ([]string, error) {
	args := []string{}

	// Add proto files
	for _, protoFile := range opts.ProtoFiles {
		args = append(args, "-proto", protoFile)
	}

	// Add plaintext flag if needed
	if opts.Plaintext {
		args = append(args, "-plaintext")
	}

	// List services
	args = append(args, opts.Target, "list")

	// Execute grpcurl command
	cmd := exec.CommandContext(ctx, p.grpcurlPath, args...)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return nil, fmt.Errorf("grpcurl execution failed: %s\nstderr: %s", err.Error(), stderr.String())
	}

	// Parse output (one service per line)
	services := []string{}
	for _, line := range strings.Split(stdout.String(), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			services = append(services, line)
		}
	}

	return services, nil
}

// DescribeOptions represents options for describing a service
type DescribeOptions struct {
	SessionID  string
	ProtoFiles []string
	Target     string
	Service    string
	Plaintext  bool
}

// DescribeService describes a gRPC service
func (p *Proxy) DescribeService(ctx context.Context, opts DescribeOptions) (interface{}, error) {
	args := []string{}

	// Add proto files
	for _, protoFile := range opts.ProtoFiles {
		args = append(args, "-proto", protoFile)
	}

	// Add plaintext flag if needed
	if opts.Plaintext {
		args = append(args, "-plaintext")
	}

	// Describe service
	args = append(args, opts.Target, "describe", opts.Service)

	// Execute grpcurl command
	cmd := exec.CommandContext(ctx, p.grpcurlPath, args...)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return nil, fmt.Errorf("grpcurl execution failed: %s\nstderr: %s", err.Error(), stderr.String())
	}

	// Return raw description output
	return map[string]string{
		"description": stdout.String(),
	}, nil
}
