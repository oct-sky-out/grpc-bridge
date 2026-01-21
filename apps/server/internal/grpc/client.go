package grpc

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/desc/protoparse"
	"github.com/jhump/protoreflect/dynamic"
	"github.com/jhump/protoreflect/dynamic/grpcdynamic"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	reflectionpb "google.golang.org/grpc/reflection/grpc_reflection_v1alpha"
)

// NativeClient implements gRPC calls using native Go gRPC client
type NativeClient struct {
	// Cache for file descriptors by session
	descriptorCache map[string]map[string]*desc.FileDescriptor
}

// NewNativeClient creates a new native gRPC client
func NewNativeClient() *NativeClient {
	return &NativeClient{
		descriptorCache: make(map[string]map[string]*desc.FileDescriptor),
	}
}

// NativeCallOptions represents options for a native gRPC call
type NativeCallOptions struct {
	SessionID   string
	SessionRoot string            // Root directory for proto files
	ProtoFiles  []string          // Proto file paths
	Target      string            // gRPC server address
	Service     string            // Fully qualified service name
	Method      string            // Method name
	Data        interface{}       // Request data (JSON or map)
	Metadata    map[string]string // gRPC metadata headers
	Plaintext   bool              // Use insecure connection
	Timeout     time.Duration     // Call timeout
}

// NativeCallResult represents the result of a native gRPC call
type NativeCallResult struct {
	Response interface{}            `json:"response"`
	Headers  map[string][]string    `json:"headers,omitempty"`
	Trailers map[string][]string    `json:"trailers,omitempty"`
	Status   string                 `json:"status"`
}

// Call executes a gRPC call using native Go gRPC client
func (c *NativeClient) Call(ctx context.Context, opts NativeCallOptions) (*NativeCallResult, error) {
	// Apply timeout
	if opts.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, opts.Timeout)
		defer cancel()
	}

	// Load file descriptors for this session
	fileDescs, err := c.loadFileDescriptors(opts.SessionID, opts.SessionRoot, opts.ProtoFiles)
	if err != nil {
		return nil, fmt.Errorf("failed to load file descriptors: %w", err)
	}

	// Find service descriptor
	serviceDesc, err := c.findServiceDescriptor(fileDescs, opts.Service)
	if err != nil {
		return nil, fmt.Errorf("service not found: %w", err)
	}

	// Find method descriptor
	methodDesc := serviceDesc.FindMethodByName(opts.Method)
	if methodDesc == nil {
		return nil, fmt.Errorf("method %s not found in service %s", opts.Method, opts.Service)
	}

	// Create gRPC connection
	dialOpts := []grpc.DialOption{}
	if opts.Plaintext {
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	conn, err := grpc.NewClient(opts.Target, dialOpts...)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to %s: %w", opts.Target, err)
	}
	defer conn.Close()

	// Create dynamic stub
	stub := grpcdynamic.NewStub(conn)

	// Create request message
	reqMsg := dynamic.NewMessage(methodDesc.GetInputType())
	if opts.Data != nil {
		// Convert data to JSON bytes
		dataBytes, err := json.Marshal(opts.Data)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request data: %w", err)
		}

		// Unmarshal JSON into dynamic message
		if err := reqMsg.UnmarshalJSON(dataBytes); err != nil {
			return nil, fmt.Errorf("failed to unmarshal request: %w", err)
		}
	}

	// Add metadata to context
	if len(opts.Metadata) > 0 {
		md := metadata.New(opts.Metadata)
		ctx = metadata.NewOutgoingContext(ctx, md)
	}

	// Capture headers and trailers
	var respHeaders, respTrailers metadata.MD

	// Execute RPC call
	respMsg, err := stub.InvokeRpc(ctx, methodDesc, reqMsg,
		grpc.Header(&respHeaders),
		grpc.Trailer(&respTrailers),
	)

	if err != nil {
		return nil, fmt.Errorf("RPC call failed: %w", err)
	}

	// Convert response to JSON-compatible format
	// Cast to dynamic.Message to access MarshalJSON
	dynamicResp, ok := respMsg.(*dynamic.Message)
	if !ok {
		return nil, fmt.Errorf("unexpected response type")
	}

	respJSON, err := dynamicResp.MarshalJSON()
	if err != nil {
		return nil, fmt.Errorf("failed to marshal response: %w", err)
	}

	var respData interface{}
	if err := json.Unmarshal(respJSON, &respData); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &NativeCallResult{
		Response: respData,
		Headers:  metadataToMap(respHeaders),
		Trailers: metadataToMap(respTrailers),
		Status:   "OK",
	}, nil
}

// ListServices lists available services using gRPC reflection
func (c *NativeClient) ListServices(ctx context.Context, target string, plaintext bool) ([]string, error) {
	// Create connection
	dialOpts := []grpc.DialOption{}
	if plaintext {
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	conn, err := grpc.NewClient(target, dialOpts...)
	if err != nil {
		return nil, fmt.Errorf("failed to connect: %w", err)
	}
	defer conn.Close()

	// Create reflection client
	refClient := reflectionpb.NewServerReflectionClient(conn)
	stream, err := refClient.ServerReflectionInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to create reflection stream: %w", err)
	}

	// Request list of services
	if err := stream.Send(&reflectionpb.ServerReflectionRequest{
		MessageRequest: &reflectionpb.ServerReflectionRequest_ListServices{
			ListServices: "*",
		},
	}); err != nil {
		return nil, fmt.Errorf("failed to send list services request: %w", err)
	}

	// Receive response
	resp, err := stream.Recv()
	if err != nil {
		return nil, fmt.Errorf("failed to receive services list: %w", err)
	}

	listResp := resp.GetListServicesResponse()
	if listResp == nil {
		return nil, fmt.Errorf("no list services response")
	}

	services := make([]string, 0, len(listResp.Service))
	for _, svc := range listResp.Service {
		services = append(services, svc.Name)
	}

	return services, nil
}

// loadFileDescriptors loads and parses proto files for a session
func (c *NativeClient) loadFileDescriptors(sessionID, sessionRoot string, protoFiles []string) (map[string]*desc.FileDescriptor, error) {
	// Check cache
	if cached, exists := c.descriptorCache[sessionID]; exists {
		return cached, nil
	}

	// Parse proto files
	parser := protoparse.Parser{
		ImportPaths: []string{sessionRoot},
	}

	// Extract relative paths from absolute paths
	relativePaths := make([]string, len(protoFiles))
	for i, absPath := range protoFiles {
		// Remove sessionRoot prefix to get relative path
		if len(absPath) > len(sessionRoot) {
			relativePaths[i] = absPath[len(sessionRoot)+1:]
		} else {
			relativePaths[i] = absPath
		}
	}

	fileDescs, err := parser.ParseFiles(relativePaths...)
	if err != nil {
		return nil, fmt.Errorf("failed to parse proto files: %w", err)
	}

	// Build map
	descMap := make(map[string]*desc.FileDescriptor)
	for _, fd := range fileDescs {
		descMap[fd.GetName()] = fd
	}

	// Cache for this session
	c.descriptorCache[sessionID] = descMap

	return descMap, nil
}

// findServiceDescriptor finds a service descriptor by fully qualified name
func (c *NativeClient) findServiceDescriptor(fileDescs map[string]*desc.FileDescriptor, fqService string) (*desc.ServiceDescriptor, error) {
	for _, fd := range fileDescs {
		for _, svc := range fd.GetServices() {
			if svc.GetFullyQualifiedName() == fqService {
				return svc, nil
			}
		}
	}
	return nil, fmt.Errorf("service %s not found in proto files", fqService)
}

// metadataToMap converts gRPC metadata to a regular map
func metadataToMap(md metadata.MD) map[string][]string {
	result := make(map[string][]string)
	for k, v := range md {
		result[k] = v
	}
	return result
}

// GetMethodDescriptor returns the input type descriptor for a method (for generating skeleton)
func (c *NativeClient) GetMethodDescriptor(sessionID, sessionRoot string, protoFiles []string, fqService, method string) (*desc.MethodDescriptor, error) {
	fileDescs, err := c.loadFileDescriptors(sessionID, sessionRoot, protoFiles)
	if err != nil {
		return nil, err
	}

	serviceDesc, err := c.findServiceDescriptor(fileDescs, fqService)
	if err != nil {
		return nil, err
	}

	methodDesc := serviceDesc.FindMethodByName(method)
	if methodDesc == nil {
		return nil, fmt.Errorf("method %s not found", method)
	}

	return methodDesc, nil
}

// ListServicesFromProto lists services from proto files (no server connection needed)
func (c *NativeClient) ListServicesFromProto(sessionID, sessionRoot string, protoFiles []string) ([]string, error) {
	fileDescs, err := c.loadFileDescriptors(sessionID, sessionRoot, protoFiles)
	if err != nil {
		return nil, err
	}

	services := []string{}
	for _, fd := range fileDescs {
		for _, svc := range fd.GetServices() {
			services = append(services, svc.GetFullyQualifiedName())
		}
	}

	return services, nil
}

// ClearCache clears the descriptor cache for a session (call on session delete)
func (c *NativeClient) ClearCache(sessionID string) {
	delete(c.descriptorCache, sessionID)
}
