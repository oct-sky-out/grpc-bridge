#!/bin/bash

# Development Environment Setup Script for gRPC Bridge
# This script helps set up the development environment on different platforms

set -e

echo "🚀 Setting up gRPC Bridge development environment..."
echo "=================================================="

# Check if we're on macOS, Linux, or Windows (Git Bash/WSL)
OS="$(uname -s)"
case "${OS}" in
    Darwin*)    PLATFORM=macOS;;
    Linux*)     PLATFORM=Linux;;
    CYGWIN*|MINGW*|MSYS*) PLATFORM=Windows;;
    *)          PLATFORM=Unknown;;
esac

echo "📍 Detected platform: ${PLATFORM}"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Node.js
echo "🔍 Checking Node.js..."
if command_exists node; then
    NODE_VERSION=$(node --version)
    echo "   ✅ Node.js found: ${NODE_VERSION}"
    
    # Check if version is >= 18
    NODE_MAJOR=$(echo ${NODE_VERSION} | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -lt 18 ]; then
        echo "   ⚠️  Warning: Node.js version should be 18 or higher"
    fi
else
    echo "   ❌ Node.js not found"
    echo "   📥 Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check pnpm
echo "🔍 Checking pnpm..."
if command_exists pnpm; then
    PNPM_VERSION=$(pnpm --version)
    echo "   ✅ pnpm found: v${PNPM_VERSION}"
else
    echo "   ⚠️  pnpm not found, installing..."
    npm install -g pnpm
    echo "   ✅ pnpm installed"
fi

# Check Rust
echo "🔍 Checking Rust..."
if command_exists rustc; then
    RUST_VERSION=$(rustc --version)
    echo "   ✅ Rust found: ${RUST_VERSION}"
else
    echo "   ❌ Rust not found"
    echo "   📥 Installing Rust..."
    
    if [ "${PLATFORM}" = "Windows" ]; then
        echo "   Please install Rust manually from https://rustup.rs/"
        exit 1
    else
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source $HOME/.cargo/env
        echo "   ✅ Rust installed"
    fi
fi

# Check rustup and add targets
echo "🔍 Checking Rust targets..."
if command_exists rustup; then
    echo "   📦 Adding cross-compilation targets..."
    rustup target add x86_64-apple-darwin 2>/dev/null || echo "   x86_64-apple-darwin already installed"
    rustup target add aarch64-apple-darwin 2>/dev/null || echo "   aarch64-apple-darwin already installed"
    
    if [ "${PLATFORM}" = "macOS" ]; then
        rustup target add x86_64-pc-windows-gnu 2>/dev/null || echo "   x86_64-pc-windows-gnu already installed"
    fi
    
    echo "   ✅ Rust targets configured"
fi

# Platform-specific dependencies
echo "🔍 Checking platform-specific dependencies..."
case "${PLATFORM}" in
    macOS)
        if command_exists xcode-select; then
            echo "   ✅ Xcode Command Line Tools found"
        else
            echo "   ⚠️  Installing Xcode Command Line Tools..."
            xcode-select --install
        fi
        
        if command_exists brew; then
            echo "   ✅ Homebrew found"
            echo "   📦 Installing mingw-w64 for cross-compilation..."
            brew install mingw-w64 2>/dev/null || echo "   mingw-w64 already installed"
        else
            echo "   ⚠️  Homebrew not found, cross-compilation to Windows may not work"
        fi
        ;;
    Linux)
        echo "   📦 Checking Linux dependencies..."
        if command_exists apt; then
            echo "   📥 Installing required packages..."
            sudo apt update
            sudo apt install -y \
                libwebkit2gtk-4.0-dev \
                build-essential \
                curl \
                wget \
                file \
                libssl-dev \
                libgtk-3-dev \
                libayatana-appindicator3-dev \
                librsvg2-dev
            echo "   ✅ Linux dependencies installed"
        elif command_exists yum; then
            echo "   📥 Installing required packages (CentOS/RHEL)..."
            sudo yum install -y \
                webkit2gtk4.0-devel \
                openssl-devel \
                curl \
                wget \
                file \
                libappindicator-gtk3-devel \
                librsvg2-devel
        else
            echo "   ⚠️  Unknown package manager, please install dependencies manually"
        fi
        ;;
    Windows)
        echo "   ⚠️  Windows detected. Please ensure you have:"
        echo "      - Microsoft Visual Studio Build Tools"
        echo "      - Windows SDK"
        ;;
esac

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
pnpm install
echo "   ✅ Dependencies installed"

# Create .cargo config for cross-compilation
echo "⚙️  Setting up Cargo configuration..."
mkdir -p .cargo
cat > .cargo/config.toml << EOF
[target.x86_64-pc-windows-gnu]
linker = "x86_64-w64-mingw32-gcc"
ar = "x86_64-w64-mingw32-ar"

[build]
target = "$(rustc -vV | grep host | cut -d' ' -f2)"
EOF
echo "   ✅ Cargo configuration created"

# Test build
echo "🧪 Testing build..."
if pnpm nx run ui:build; then
    echo "   ✅ Frontend build successful"
else
    echo "   ❌ Frontend build failed"
    exit 1
fi

# Final checks
echo ""
echo "🎉 Development environment setup complete!"
echo "=========================================="
echo ""
echo "📋 Next steps:"
echo "   1. Run 'pnpm dev' to start development (Tauri + UI)"
echo "   2. Run 'pnpm dev:ui' to start UI only"
echo "   3. Run 'pnpm build' to build all projects"
echo "   4. Run './cross-build.sh' for cross-platform builds (macOS only)"
echo ""
echo "🔧 Available commands:"
echo "   pnpm dev            - Start Tauri development server"
echo "   pnpm dev:ui         - Start UI development server only"
echo "   pnpm build          - Build all projects"
echo "   pnpm build:ui       - Build UI only"
echo "   pnpm build:desktop  - Build desktop app only"
echo "   pnpm lint           - Run linting on all projects"
echo "   pnpm format         - Format code"
echo "   pnpm type-check     - Type check TypeScript on all projects"
echo "   pnpm graph          - View project dependency graph"
echo ""
echo "✨ Happy coding!"
