# gRPC Bridge - AI Coding Agent Instructions

## Architecture Overview

**Hybrid mono-platform architecture**: Single React UI codebase (`apps/ui/`) supports both:
- **Desktop**: Tauri + Rust backend (local proto parsing, direct gRPC via grpcurl)
- **Web**: Go HTTP API + WebSocket (session-based proto storage, gRPC proxy)

Platform abstraction layer (`apps/ui/src/lib/platform/`) dynamically selects adapter based on build target (`VITE_PLATFORM` env var).

### Key Architectural Decisions

1. **Platform Detection**: Build-time via Vite config (`vite.config.desktop.ts` vs `vite.config.web.ts`) sets `VITE_PLATFORM`, runtime fallback checks `window.__TAURI__`
2. **Proto Management**: Desktop uses Rust scanner (`apps/desktop/src-tauri/src/proto_index/`), Web uploads to Go session storage
3. **State Management**: Zustand stores in `apps/ui/src/state/` - no persistence, resets on app restart
4. **Event System**: Desktop uses Tauri events (`proto://index_done`, `grpc://response`), Web uses WebSocket pub/sub

## Project Structure

```
grpc-bridge/                    # Nx monorepo (pnpm workspaces)
├── apps/ui/                    # Shared React frontend
│   ├── src/lib/platform/       # Platform abstraction (desktop-adapter.ts, web-adapter.ts, types.ts)
│   ├── src/state/              # Zustand stores (protoFiles.ts, services.ts, request.ts, history.ts)
│   ├── vite.config.{desktop,web}.ts  # Build-time platform selection
├── apps/desktop/src-tauri/     # Rust backend (Tauri 2.0)
│   ├── src/proto_index/        # Proto parsing (scanner.rs, parser.rs)
│   ├── src/main.rs             # Tauri commands (register_proto_root, scan_proto_root, run_grpc_call)
├── apps/server/                # Go backend (Gin web framework)
│   ├── internal/grpc/proxy.go  # grpcurl wrapper for gRPC calls
│   ├── internal/session/       # Session manager (24h TTL, file storage)
│   ├── internal/proto/         # Proto analyzer (import resolution, stdlib detection)
│   ├── internal/websocket/     # WebSocket hub for real-time events
│   ├── internal/static/        # Embedded UI build (go:embed)
├── libs/shared/                # Shared types (currently minimal, consider expanding)
```

## Development Workflows

### Build System (Nx + pnpm)

```bash
# Desktop: UI (port 5173) + Rust dev build
pnpm dev:desktop  # or nx run desktop:dev

# Web: UI (port 5174) + Go API (port 8080)
pnpm dev:ui       # Frontend only
pnpm dev:server   # Backend only (nx run server:dev)

# Production builds
pnpm build:desktop     # Tauri bundle (dist/desktop/ + src-tauri/target/release/)
pnpm build:web         # UI -> dist/web/ -> apps/server/internal/static/dist/ -> Go binary
bash scripts/build-web.sh  # Full web build with Go embedding
```

**Critical**: Web build requires 3 steps (see `scripts/build-web.sh`):
1. Build UI with web config → `dist/web/`
2. Copy to Go static dir → `apps/server/internal/static/dist/`
3. Build Go binary with `go:embed` directive

### Testing gRPC Calls

Both platforms use **grpcurl** under the hood:
- Desktop: Rust `tokio::process::Command` spawns grpcurl with proto root paths
- Web: Go `exec.Command` with session-uploaded proto files

Expect grpcurl in PATH. Install: `brew install grpcurl` (macOS) or `go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest`

### Proto File Handling

**Desktop flow**:
1. User selects directory → `register_proto_root(path)` → UUID assigned
2. `scan_proto_root(root_id)` → Rust scans with `ignore` crate → emits `proto://index_start`
3. Rust parser extracts services/methods → emits `proto://index_done` with `ParsedService[]`

**Web flow**:
1. User selects directory (webkitdirectory) → `POST /api/sessions` → session UUID
2. Upload files → `POST /api/upload/proto` with `X-Session-ID` header → stored in `./uploads/<session-id>/`
3. Go proto analyzer (`internal/proto/analyzer.go`) parses imports → returns services via API

## Code Conventions

### Platform Adapter Pattern

Always use `getPlatform()` or `usePlatform()` hook, never import Tauri directly in shared UI code:

```typescript
// ✓ Correct
import { getPlatform } from '@/lib/platform';
const platform = getPlatform();
await platform.proto.registerProtoRoot(path);

// ✗ Wrong
import { invoke } from '@tauri-apps/api/core';
await invoke('register_proto_root', { path });
```

See `apps/ui/src/components/grpc/configuration/DesktopConfigPanel.tsx` and `WebConfigPanel.tsx` for reference implementations.

### State Management

Zustand stores use **flat actions** pattern (no nested reducers):

```typescript
// From apps/ui/src/state/protoFiles.ts
export const useProtoFiles = create<ProtoFilesState>((set, get) => ({
  files: [],
  selected: {},
  setFiles: (f) => set({ files: f, selected: Object.fromEntries(f.map(p => [p, true])) }),
  toggle: (p) => set(s => ({ selected: { ...s.selected, [p]: !s.selected[p] } })),
  selectFolder: (folder, filesUnder) => set(s => {
    const allSelected = filesUnder.every(f => s.selected[f]);
    // Toggle all files under folder...
  })
}));
```

Use selectors for derived state: `const services = useServicesStore(s => s.services)`

### Tauri Commands (Rust)

Follow snake_case naming with `#[tauri::command(rename_all = "snake_case")]`:

```rust
#[tauri::command(rename_all = "snake_case")]
async fn register_proto_root(state: tauri::State<'_, AppState>, path: String) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    // Store in AppState.roots Arc<Mutex<HashMap>>...
    Ok(id)
}
```

Commands are registered in `main.rs` `.invoke_handler()` macro.

### Go API Handlers (Web)

Use Gin context methods, session middleware pattern:

```go
// From apps/server/internal/handler/grpc_handler.go
func (h *GRPCHandler) CallGRPC(c *gin.Context) {
    sessionID := c.GetHeader("X-Session-ID")
    if sessionID == "" {
        c.JSON(400, gin.H{"error": "X-Session-ID header required"})
        return
    }
    
    session, err := h.sessionManager.GetSession(sessionID)
    // Use session.ProtoFiles for grpcurl --proto flag...
}
```

All gRPC proxy calls require `X-Session-ID` header on web platform.

## Cross-Platform Build

Desktop only (macOS host): `./cross-build.sh` uses Rust cross-compilation for:
- `aarch64-apple-darwin` (Apple Silicon)
- `x86_64-apple-darwin` (Intel Mac)
- `x86_64-pc-windows-gnu` (Windows via MinGW)

Outputs to `dist-artifacts/` with platform suffixes. Requires: `cargo`, `mingw-w64` (Windows target).

## Common Issues

1. **Proto import resolution**: Go analyzer (`internal/proto/analyzer.go`) includes embedded stdlib (`google/protobuf/*.proto`) via `go:embed`. Rust parser assumes local import paths only.

2. **Event timing**: Desktop events fire immediately after Rust commands complete. Web events via WebSocket may have latency - UI must handle loading states.

3. **Session cleanup**: Web sessions auto-expire after 24h, files deleted on cleanup. Desktop has no session concept.

4. **Nx caching**: `nx.json` enables cache for `build`, `lint`, `type-check` targets. Clear with `nx reset`.

## Key Files for Onboarding

- Platform abstraction: `apps/ui/src/lib/platform/types.ts` (interface contracts)
- State examples: `apps/ui/src/state/services.ts` (service metadata store)
- Rust proto scanner: `apps/desktop/src-tauri/src/proto_index/scanner.rs`
- Go gRPC proxy: `apps/server/internal/grpc/proxy.go` (grpcurl wrapper)
- Build orchestration: `scripts/build-web.sh`, `scripts/build-desktop.sh`

## i18n Support

Uses `react-i18next` with JSON files in `apps/ui/src/locales/` (en.json, ja.json, ko.json). Language switcher in ConfigPanel persists to localStorage.

**Pattern**: Namespace keys by feature: `"config.server.address": "Server Address"` → `t('config.server.address')`
