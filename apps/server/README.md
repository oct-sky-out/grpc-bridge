# gRPC Bridge Web API

Go-based backend API for the gRPC Bridge web version. Provides session management, proto file upload, and gRPC proxy functionality using grpcurl.

## Architecture

```
apps/server/
├── cmd/
│   └── server/          # Application entry point
│       └── main.go
├── internal/
│   ├── grpc/           # gRPC proxy using grpcurl
│   │   └── proxy.go
│   ├── handler/        # HTTP request handlers
│   │   ├── session_handler.go
│   │   ├── file_handler.go
│   │   └── grpc_handler.go
│   ├── middleware/     # HTTP middleware
│   │   ├── cors.go
│   │   └── logger.go
│   ├── session/        # Session management
│   │   └── manager.go
│   └── storage/        # File storage
│       └── file_storage.go
├── go.mod
├── go.sum
├── project.json        # Nx configuration
└── README.md
```

## API Endpoints

### Health Check

**GET** `/api/health`

Check if the server is running.

**Response:**
```json
{
  "status": "ok",
  "service": "grpc-bridge-server"
}
```

### Session Management

#### Create Session

**POST** `/api/sessions`

Creates a new session with a unique ID and 24-hour TTL.

**Response:**
```json
{
  "session": {
    "id": "31ac7f1e-6700-4403-8a4b-670fe231b28e",
    "created_at": "2025-10-13T03:50:46Z",
    "expires_at": "2025-10-14T03:50:46Z",
    "proto_files": []
  }
}
```

#### Get Session

**GET** `/api/sessions/:sessionId`

Retrieves session information.

**Response:**
```json
{
  "session": {
    "id": "31ac7f1e-6700-4403-8a4b-670fe231b28e",
    "created_at": "2025-10-13T03:50:46Z",
    "expires_at": "2025-10-14T03:50:46Z",
    "proto_files": ["/path/to/file1.proto", "/path/to/file2.proto"]
  }
}
```

#### Delete Session

**DELETE** `/api/sessions/:sessionId`

Deletes a session and its associated files.

**Response:**
```json
{
  "message": "session deleted"
}
```

### File Upload

#### Upload Proto Files

**POST** `/api/upload/proto`

Uploads one or more .proto files to a session.

**Headers:**
- `X-Session-ID`: Session ID (required)

**Body:** `multipart/form-data`
- `files`: Proto files to upload

**Response:**
```json
{
  "uploaded": 2,
  "files": [
    "/uploads/session-id/abc123_service.proto",
    "/uploads/session-id/def456_types.proto"
  ]
}
```

#### List Session Files

**GET** `/api/sessions/:sessionId/files`

Lists all proto files uploaded to a session.

**Response:**
```json
{
  "session_id": "31ac7f1e-6700-4403-8a4b-670fe231b28e",
  "files": [
    "/uploads/session-id/abc123_service.proto",
    "/uploads/session-id/def456_types.proto"
  ],
  "count": 2
}
```

### gRPC Proxy

#### Call gRPC Method

**POST** `/api/grpc/call`

Executes a gRPC call using grpcurl.

**Headers:**
- `X-Session-ID`: Session ID (required)

**Request Body:**
```json
{
  "target": "localhost:50051",
  "service": "myapp.MyService",
  "method": "GetUser",
  "data": {
    "user_id": "12345"
  },
  "metadata": {
    "authorization": "Bearer token123"
  },
  "plaintext": true,
  "import_paths": ["/path/to/protos"]
}
```

**Response:**
```json
{
  "response": {
    "user_id": "12345",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "status": "OK"
}
```

#### List Services

**POST** `/api/grpc/services`

Lists available gRPC services using reflection.

**Headers:**
- `X-Session-ID`: Session ID (required)

**Request Body:**
```json
{
  "target": "localhost:50051",
  "plaintext": true
}
```

**Response:**
```json
{
  "services": [
    "grpc.reflection.v1alpha.ServerReflection",
    "myapp.MyService",
    "myapp.AnotherService"
  ]
}
```

#### Describe Service

**POST** `/api/grpc/describe`

Describes a gRPC service (methods, message types, etc.).

**Headers:**
- `X-Session-ID`: Session ID (required)

**Request Body:**
```json
{
  "target": "localhost:50051",
  "service": "myapp.MyService",
  "plaintext": true
}
```

**Response:**
```json
{
  "description": "service MyService {\n  rpc GetUser(GetUserRequest) returns (User);\n  rpc ListUsers(ListUsersRequest) returns (stream User);\n}\n..."
}
```

## Development

### Prerequisites

- Go 1.23+
- grpcurl (for gRPC proxy functionality)

### Install grpcurl

```bash
# macOS
brew install grpcurl

# Linux/WSL
go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest

# Windows
choco install grpcurl
```

### Running the Server

Using Nx:
```bash
# Serve (development)
nx serve server

# Build
nx build server

# Test
nx test server

# Lint
nx lint server
```

Using Go directly:
```bash
cd apps/server

# Run
go run ./cmd/server/main.go

# Build
go build -o ../../dist/apps/server ./cmd/server

# Test
go test ./...

# Run with custom port
PORT=9000 go run ./cmd/server/main.go
```

### Environment Variables

- `PORT`: Server port (default: 8800)
- `GIN_MODE`: Gin mode (debug, release, test)

## Testing

Example using curl:

```bash
# 1. Create a session
SESSION_RESPONSE=$(curl -X POST http://localhost:8800/api/sessions)
SESSION_ID=$(echo $SESSION_RESPONSE | jq -r '.session.id')

# 2. Upload proto files
curl -X POST http://localhost:8800/api/upload/proto \
  -H "X-Session-ID: $SESSION_ID" \
  -F "files=@service.proto" \
  -F "files=@types.proto"

# 3. List services (requires gRPC server with reflection)
curl -X POST http://localhost:8800/api/grpc/services \
  -H "X-Session-ID: $SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"target": "localhost:50051", "plaintext": true}'

# 4. Call gRPC method
curl -X POST http://localhost:8800/api/grpc/call \
  -H "X-Session-ID: $SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "target": "localhost:50051",
    "service": "myapp.MyService",
    "method": "GetUser",
    "data": {"user_id": "123"},
    "plaintext": true
  }'

# 5. Delete session
curl -X DELETE http://localhost:8800/api/sessions/$SESSION_ID
```

## Features

- **Session Management**: UUID-based sessions with 24-hour TTL and automatic cleanup
- **File Upload**: Multi-file proto upload with validation (only .proto files)
- **gRPC Proxy**: Uses grpcurl for gRPC calls (same as desktop version)
- **CORS Support**: Cross-origin requests enabled for web frontend
- **Request Logging**: HTTP request/response logging middleware
- **Error Handling**: Comprehensive error responses with details

## Next Steps (Phase 2-4)

- Phase 2: Web frontend with platform abstraction layer
- Phase 3: Docker containerization and deployment
- Phase 4: Testing and performance optimization
