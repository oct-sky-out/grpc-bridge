#!/bin/bash

# Build script for desktop application (UI + Tauri)
# This script builds the React UI for desktop and packages it with Tauri

set -e

echo "==========================================="
echo "Building gRPC Bridge Desktop Application"
echo "==========================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Build desktop app (Tauri will handle UI build via beforeBuildCommand)
echo -e "${BLUE}Building desktop application...${NC}"
pnpm nx run desktop:build

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}✓ Desktop build completed successfully!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo "Output location:"
echo "  dist/desktop/app/target/release/bundle/"
echo ""
echo "Available bundles:"
find dist/desktop/app/target/release/bundle -type f \( -name "*.dmg" -o -name "*.msi" -o -name "*.deb" -o -name "*.AppImage" \) 2>/dev/null | sed 's/^/  /' || echo "  (no bundles found)"
echo ""
