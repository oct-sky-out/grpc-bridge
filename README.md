# gRPC Bridge

A modern, cross-platform gRPC testing tool built with Tauri, React, and TypeScript. Test gRPC services with an intuitive desktop interface featuring proto file discovery, request/response handling, and beautiful UI components powered by shadcn/ui.

Built with **Nx monorepo** for scalable development and optimized builds.

## ✨ Features

- 🔍 **Auto Proto Discovery**: Automatically scan and parse .proto files
- 🚀 **Unary gRPC Calls**: Test unary gRPC methods with ease
- 💾 **Request History**: Save and reuse previous requests
- 🎨 **Modern UI**: Beautiful interface built with Tailwind CSS + shadcn/ui
- 🌍 **Cross Platform**: Works on macOS, Windows, and Linux (Desktop) or any browser (Web)
- 🌐 **Multi-language Support**: English, Japanese, Korean interface
- ⚡ **Fast Performance**: Native Rust backend with React frontend (Desktop) or Go backend (Web)
- 🔧 **Developer Friendly**: JSON syntax highlighting and validation
- 🌐 **Web Version**: Browser-based gRPC testing with Go backend API

## ✨ Features Details

### 1. Frontend (Web, Desktop) - `apps/ui`

- Dual UI build targets are implemented: `build:desktop` and `build:web`.
- A platform abstraction layer switches behavior between Tauri desktop and Web API mode.
- Proto file workflows are implemented for both platforms:
  - Desktop: register proto root, scan/rescan, list/remove known roots.
  - Web: directory upload (`webkitdirectory`) with preserved folder structure and session-based analysis.
- Proto tree visualization is implemented with file/folder selection, select-all/select-none, and folder-level bulk selection.
- Request builder is implemented with target/service/method selection, JSON payload validation/formatting, and payload diff against last request.
- Metadata/header editing is implemented, including optional automatic `Authorization: Bearer <token>` injection.
- Unary request execution and response handling are implemented with success/error events and elapsed time tracking.
- Response viewer supports pretty JSON output and copy-to-clipboard.
- Request history is implemented with load/delete/clear actions and local persistence (`localStorage`).
- i18n (English, Japanese, Korean) and theme toggle (light/dark with persistence) are implemented.

### 2. Backend (Relay API) - `apps/server`

- HTTP API server is implemented with Gin, including health, session, proto, grpc, and websocket endpoints.
- Session lifecycle is implemented (create/get/delete), with optional client-provided session IDs and TTL-based cleanup.
- Proto upload pipeline is implemented for multi-file directory structure uploads per session.
- Embedded protobuf standard library files are copied into each session workspace for import resolution.
- Proto analysis is implemented:
  - import scanning,
  - missing import detection,
  - missing standard library detection,
  - dependency graph generation.
- gRPC execution relay is implemented with a native Go dynamic gRPC client:
  - JSON request decoding into dynamic messages,
  - metadata forwarding,
  - response/header/trailer capture.
- Service discovery is implemented with reflection-first strategy and fallback to local proto parsing.
- WebSocket hub is implemented to push `proto://*` and `grpc://*` events to the matching session client.
- CORS middleware and HTTP request logging middleware are implemented.
- Embedded static frontend serving is implemented for web distribution.

### 3. Desktop Layer (Native Bridge) - `apps/desktop`

- Tauri native command bridge is implemented for:
  - proto root registration/list/removal,
  - proto scanning and file listing,
  - service listing and method skeleton generation,
  - grpc execution.
- Desktop state management is implemented in Rust for roots, parsed services, and files by root.
- Local proto scanning is implemented using filesystem walking with `.proto` filtering.
- Lightweight proto parsing is implemented in Rust to extract package/service/rpc metadata and streaming flags.
- Native event emission to the frontend is implemented (`proto://index_start`, `proto://index_done`, `grpc://response`, `grpc://error`).
- gRPC execution through `grpcurl` subprocess is implemented with target sanitization and error-kind classification.
- Single active unary request guard is implemented to prevent concurrent call overlap.
- Tauri capabilities are configured to allow frontend event listening.

## 📦 Installation

### Prerequisites

Before building gRPC Bridge, ensure you have the following installed:

#### For All Platforms:

- **Node.js** (v18 or later) - [Download](https://nodejs.org/)
- **pnpm** - Package manager
- **Rust** (v1.70 or later) - [Install via rustup](https://rustup.rs/)

#### Platform-Specific Requirements:

##### macOS:

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Rust via rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

##### Windows:

```powershell
# Install Rust
winget install Rustlang.Rustup

# Install C++ Build Tools
winget install Microsoft.VisualStudio.2022.BuildTools

# Install Node.js
winget install OpenJS.NodeJS
```

##### Ubuntu/Debian:

```bash
# Install dependencies
sudo apt update
sudo apt install -y libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Install pnpm

```bash
npm install -g pnpm
```

## 🏗️ Building from Source

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/grpc-bridge.git
cd grpc-bridge
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
pnpm install
```

### 3. Build Options

#### Development Build (with hot reload)

```bash
# Start Tauri development server (UI + Desktop)
pnpm dev

# Or start UI development server only
pnpm dev:ui
```

#### Production Build

```bash
# Build all projects (UI + Desktop)
pnpm build

# Build UI only
pnpm build:ui

# Build desktop app only
pnpm build:desktop

# The built application will be available in:
# - macOS: apps/desktop/src-tauri/target/release/bundle/dmg/
# - Windows: apps/desktop/src-tauri/target/release/bundle/msi/
# - Linux: apps/desktop/src-tauri/target/release/bundle/deb/ or bundle/appimage/
```

#### Cross-Platform Build (macOS only)

```bash
# Make cross-build script executable
chmod +x cross-build.sh

# Build for multiple platforms
./cross-build.sh

# Built binaries will be in dist-artifacts/ folder:
# - grpc-bridge-macos-arm64 (Apple Silicon)
# - grpc-bridge-macos-x64 (Intel Mac)
# - grpc-bridge-windows-x64.exe (Windows)
```

## 🚀 Usage

### Quick Start

1. **Launch the application**

   ```bash
   # Development (Tauri + UI)
   pnpm dev

   # Or run the built application
   ./grpc-bridge  # macOS/Linux
   grpc-bridge.exe  # Windows
   ```

2. **Load Proto Files**
   - Click "Scan Directory" to automatically discover .proto files
   - Or manually select individual .proto files

3. **Configure gRPC Target**
   - Enter your gRPC server address (e.g., `localhost:50051`)
   - Select the service and method from discovered protos

4. **Send Requests**
   - Fill in the request JSON payload
   - Add any required headers or metadata
   - Click "Send Request" to execute the gRPC call

5. **Change Language**
   - Click the language switcher in the Configuration panel
   - Choose from English (🇺🇸), Japanese (🇯🇵), or Korean (🇰🇷)
   - Language preference is automatically saved

## 🛠️ Development

### Project Structure

```
grpc-bridge/                    # Nx monorepo root
├── apps/
│   ├── ui/                     # React frontend application
│   │   ├── src/
│   │   │   ├── components/     # UI components
│   │   │   │   ├── ui/        # shadcn/ui components
│   │   │   │   └── grpc/      # gRPC-specific components
│   │   │   ├── locales/       # i18n translation files
│   │   │   │   ├── en.json    # English translations
│   │   │   │   ├── ja.json    # Japanese translations
│   │   │   │   └── ko.json    # Korean translations
│   │   │   ├── state/         # Zustand state management
│   │   │   ├── lib/           # Utilities
│   │   │   └── i18n.ts        # Internationalization setup
│   │   ├── vite.config.ts
│   │   └── package.json
│   ├── desktop/                # Tauri desktop application
│   │   ├── src-tauri/          # Rust backend
│   │   │   ├── src/
│   │   │   │   ├── main.rs     # Tauri app entry
│   │   │   │   ├── proto_index/# Proto file parsing
│   │   │   │   └── commands/   # Backend commands
│   │   │   └── Cargo.toml
│   │   └── package.json
│   └── server/                # Go backend API (Web version)
│       ├── cmd/
│       │   └── server/         # API server entry point
│       ├── internal/
│       │   ├── grpc/          # gRPC proxy (grpcurl)
│       │   ├── handler/       # HTTP handlers
│       │   ├── middleware/    # HTTP middleware
│       │   ├── session/       # Session management
│       │   └── storage/       # File storage
│       ├── go.mod
│       ├── project.json       # Nx configuration
│       └── README.md
├── libs/
│   └── shared/                 # Shared libraries
│       ├── src/
│       │   ├── types.ts        # Shared TypeScript types
│       │   └── utils.ts        # Shared utilities
│       └── package.json
├── dist/                       # Built frontend assets
├── dist-artifacts/             # Cross-platform build artifacts
├── nx.json                     # Nx workspace configuration
├── pnpm-workspace.yaml         # pnpm workspace configuration
└── tsconfig.base.json          # Base TypeScript configuration
```

### Tech Stack

**Monorepo:**

- **Nx** - Build system and monorepo tooling
- **pnpm** - Fast, disk space efficient package manager
- **pnpm workspaces** - Monorepo workspace management

**Frontend:**

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **shadcn/ui** - Component library
- **Zustand** - State management
- **Radix UI** - Accessible primitives
- **react-i18next** - Internationalization (English, Japanese, Korean)

**Backend (Desktop):**

- **Rust** - System programming language
- **Tauri** - Desktop app framework
- **Tokio** - Async runtime
- **serde** - Serialization
- **anyhow** - Error handling

**Backend (Web API):**

- **Go 1.23** - Backend language
- **Gin** - HTTP web framework
- **grpcurl** - gRPC command-line tool for proxy
- **UUID** - Session ID generation

### Development Scripts

#### Desktop App (Tauri + React)

```bash
# Start Tauri development server (UI + Desktop)
pnpm dev

# Start UI development server only
pnpm dev:ui

# Build all projects
pnpm build

# Build specific projects
pnpm build:ui         # Build UI only
pnpm build:desktop    # Build desktop app only

# Cross-platform build (macOS only)
./cross-build.sh
```

#### Web API (Go)

```bash
# Start web API server
nx serve server

# Build web API
nx build server

# Test web API
nx test server

# Lint web API
nx lint server

# Using Go directly
cd apps/server
go run ./cmd/server/main.go
```

#### General Commands

```bash
# Run linting on all projects
pnpm lint

# Run type checking on all projects
pnpm type-check

# Format code
pnpm format

# View project dependency graph
pnpm graph

# Nx commands
pnpm nx show projects              # List all projects
pnpm nx run ui:build               # Build specific project
pnpm nx run-many -t build          # Run target on multiple projects
pnpm nx graph                      # View dependency graph
```

## 📋 Requirements

### Minimum System Requirements

- **OS**: macOS 10.15+, Windows 10+, or Ubuntu 18.04+
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 100MB for application
- **Network**: Internet connection for gRPC calls

### Development Requirements

**Desktop App:**
- **Node.js**: v18.0.0 or later
- **Rust**: v1.70.0 or later
- **pnpm**: v8.0.0 or later (recommended package manager)

**Web API:**
- **Go**: v1.23.0 or later
- **grpcurl**: Latest version (for gRPC proxy functionality)

## Commands (Rust Backend)

| Command                                  | Description                         |
| ---------------------------------------- | ----------------------------------- |
| `register_proto_root(path)`              | Register a new proto root directory |
| `scan_proto_root(rootId)`                | Scan and index proto files          |
| `list_proto_roots()`                     | List all registered proto roots     |
| `list_services(rootId?)`                 | Get available gRPC services         |
| `get_method_skeleton(fqService, method)` | Get method request skeleton         |
| `run_grpc_call(params)`                  | Execute gRPC unary call via grpcurl |
| `remove_proto_root(rootId)`              | Remove proto root                   |

### RunParams Structure

```json
{
  "target": "localhost:50051",
  "service": "your.package.Service",
  "method": "YourMethod",
  "payload": "{\"field\":\"value\"}",
  "proto_files": [],
  "root_id": "root-uuid-here"
}
```

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests if applicable
5. Commit your changes (`git commit -m 'Add some amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
