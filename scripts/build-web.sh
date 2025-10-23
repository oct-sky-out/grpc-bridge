#!/bin/bash

# Build script for web application (UI + Go server)
# This script builds the React UI for web and embeds it into the Go server

set -e

echo "========================================="
echo "Building gRPC Bridge Web Application"
echo "========================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Build React UI for web
echo -e "${BLUE}[1/3] Building React UI (web target)...${NC}"
pnpm --filter @grpc-bridge/ui build:web

# Step 2: Copy built files to Go server static directory
echo -e "${BLUE}[2/3] Copying build to Go server static directory...${NC}"
rm -rf apps/server/internal/static/dist
mkdir -p apps/server/internal/static/dist
cp -r dist/web/* apps/server/internal/static/dist/

echo -e "${GREEN}✓ Frontend copied to apps/server/internal/static/dist/${NC}"

# Step 3: Build Go server
echo -e "${BLUE}[3/3] Building Go server with embedded frontend...${NC}"
cd apps/server
go build -o ../../dist/bin/grpc-bridge-server ./main.go

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}✓ Web build completed successfully!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Output:"
echo "  Server binary: dist/bin/grpc-bridge-server"
echo "  Frontend embedded in binary"
echo ""
echo "To run the server:"
echo "  ./dist/bin/grpc-bridge-server"
echo ""
