#!/bin/bash

# Cross-platform build script for gRPC Bridge

set -e

# Build phase selector:
#   - mac: build only macOS targets
#   - windows: build only Windows target
#   - all: build both (default)
BUILD_PHASE="${BUILD_PHASE:-all}"

detect_windows_target() {
    local os
    os=$(uname -s)

    case "$os" in
        MINGW*|MSYS*|CYGWIN*)
            echo "x86_64-pc-windows-msvc"
            ;;
        *)
            echo "x86_64-pc-windows-gnu"
            ;;
    esac
}

WINDOWS_TARGET="${WINDOWS_TARGET:-$(detect_windows_target)}"

echo "🚀 Cross-platform build for gRPC Bridge"
echo "======================================="
echo "🎛️  Build phase: ${BUILD_PHASE}"
echo "🪟 Windows target: ${WINDOWS_TARGET}"

# Load cargo environment if needed
if ! command -v cargo >/dev/null 2>&1; then
    [ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
fi

# Detect current platform and set appropriate rustup toolchain
detect_toolchain() {
    local arch=$(uname -m)
    local os=$(uname -s)

    case "$os" in
        Darwin)
            case "$arch" in
                arm64|aarch64) echo "stable-aarch64-apple-darwin" ;;
                x86_64) echo "stable-x86_64-apple-darwin" ;;
                *) echo "stable" ;;
            esac
            ;;
        Linux)
            case "$arch" in
                x86_64) echo "stable-x86_64-unknown-linux-gnu" ;;
                aarch64) echo "stable-aarch64-unknown-linux-gnu" ;;
                *) echo "stable" ;;
            esac
            ;;
        MINGW*|MSYS*|CYGWIN*)
            echo "stable-x86_64-pc-windows-msvc"
            ;;
        *)
            echo "stable"
            ;;
    esac
}

# Use platform-specific rustup toolchain if available
TOOLCHAIN=$(detect_toolchain)
TOOLCHAIN_PATH="$HOME/.rustup/toolchains/$TOOLCHAIN/bin"

if [ -d "$TOOLCHAIN_PATH" ]; then
    echo "🔧 Using toolchain: $TOOLCHAIN"
    export PATH="$TOOLCHAIN_PATH:$PATH"
else
    echo "⚠️  Toolchain $TOOLCHAIN not found, using system rustc"
fi

# Build frontend first
echo "📦 Building frontend..."
pnpm install
pnpm nx run ui:build

# Check available targets
echo "🎯 Available Rust targets:"
rustup target list --installed

# Ensure required Rust targets are installed before building.
echo "📥 Installing required Rust targets (stable toolchain)..."
if [ "$BUILD_PHASE" = "mac" ] || [ "$BUILD_PHASE" = "all" ]; then
    rustup target add aarch64-apple-darwin --toolchain stable 2>/dev/null || true
    rustup target add x86_64-apple-darwin --toolchain stable 2>/dev/null || true
fi
if [ "$BUILD_PHASE" = "windows" ] || [ "$BUILD_PHASE" = "all" ]; then
    rustup target add "$WINDOWS_TARGET" --toolchain stable 2>/dev/null || true
fi

echo ""
echo "🔨 Building for multiple platforms..."

if [ "$BUILD_PHASE" = "mac" ] || [ "$BUILD_PHASE" = "all" ]; then
    # Build for macOS (arm64)
    echo "🍎 Building for macOS (aarch64-apple-darwin)..."
    rustup run stable cargo build --release --manifest-path apps/desktop/src-tauri/Cargo.toml --target aarch64-apple-darwin
    echo "   ✅ macOS build complete: ./apps/desktop/src-tauri/target/aarch64-apple-darwin/release/grpc-bridge"

    # Build for macOS Intel
    echo "🍎 Building for macOS Intel (x86_64-apple-darwin)..."
    rustup run stable cargo build --release --manifest-path apps/desktop/src-tauri/Cargo.toml --target x86_64-apple-darwin
    echo "   ✅ macOS Intel build complete: ./apps/desktop/src-tauri/target/x86_64-apple-darwin/release/grpc-bridge"
fi

if [ "$BUILD_PHASE" = "windows" ] || [ "$BUILD_PHASE" = "all" ]; then
    # Build for Windows
    echo "🪟 Building for Windows (${WINDOWS_TARGET})..."
    if [ "$WINDOWS_TARGET" = "x86_64-pc-windows-gnu" ]; then
        missing_tools=()
        for tool in x86_64-w64-mingw32-gcc x86_64-w64-mingw32-g++ x86_64-w64-mingw32-ar; do
            if ! command -v "$tool" >/dev/null 2>&1; then
                missing_tools+=("$tool")
            fi
        done
        if [ "${#missing_tools[@]}" -gt 0 ]; then
            echo "❌ Missing MinGW toolchain for ${WINDOWS_TARGET}: ${missing_tools[*]}"
            echo "   Install mingw-w64 or set WINDOWS_TARGET=x86_64-pc-windows-msvc on Windows runners."
            exit 1
        fi

        export CC_x86_64_pc_windows_gnu="x86_64-w64-mingw32-gcc"
        export CXX_x86_64_pc_windows_gnu="x86_64-w64-mingw32-g++"
        export AR_x86_64_pc_windows_gnu="x86_64-w64-mingw32-ar"
        export CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER="x86_64-w64-mingw32-gcc"
    else
        unset CC_x86_64_pc_windows_gnu
        unset CXX_x86_64_pc_windows_gnu
        unset AR_x86_64_pc_windows_gnu
        unset CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER
    fi

    rustup run stable cargo build --release --manifest-path apps/desktop/src-tauri/Cargo.toml --target "$WINDOWS_TARGET"
    echo "   ✅ Windows build complete: ./apps/desktop/src-tauri/target/${WINDOWS_TARGET}/release/grpc-bridge.exe"
fi

echo ""
echo "📁 Built files:"
echo "  🍎 macOS ARM:   ./apps/desktop/src-tauri/target/aarch64-apple-darwin/release/grpc-bridge"
echo "  🍎 macOS Intel: ./apps/desktop/src-tauri/target/x86_64-apple-darwin/release/grpc-bridge"
echo "  🪟 Windows:     ./apps/desktop/src-tauri/target/${WINDOWS_TARGET}/release/grpc-bridge.exe"
echo ""
echo "✅ Cross-platform build complete!"

# Create distribution directory
echo "📦 Creating distribution packages..."
mkdir -p dist-artifacts
if [ "$BUILD_PHASE" = "mac" ] || [ "$BUILD_PHASE" = "all" ]; then
    cp apps/desktop/src-tauri/target/aarch64-apple-darwin/release/grpc-bridge dist-artifacts/grpc-bridge-macos-arm64
    cp apps/desktop/src-tauri/target/x86_64-apple-darwin/release/grpc-bridge dist-artifacts/grpc-bridge-macos-x64
fi
if [ "$BUILD_PHASE" = "windows" ] || [ "$BUILD_PHASE" = "all" ]; then
    cp "apps/desktop/src-tauri/target/${WINDOWS_TARGET}/release/grpc-bridge.exe" dist-artifacts/grpc-bridge-windows-x64.exe
fi

echo "📦 Distribution packages created in ./dist-artifacts/"
ls -la dist-artifacts/
