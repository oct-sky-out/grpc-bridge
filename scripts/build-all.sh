#!/bin/bash

# Build all applications (desktop + web)

set -e

echo "========================================="
echo "Building All gRPC Bridge Applications"
echo "========================================="
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Build web application
echo "Building web application..."
bash "$SCRIPT_DIR/build-web.sh"

echo ""
echo "========================================="
echo ""

# Build desktop application
echo "Building desktop application..."
bash "$SCRIPT_DIR/build-desktop.sh"

echo ""
echo "========================================="
echo "✓ Desktop builds completed!"
echo "========================================="

# Build go server application
echo "Building go server application..."
bash "$SCRIPT_DIR/build-web.sh"

echo ""
echo "========================================="
echo "✓ Webserver builds completed! (All done)"
echo "========================================="
