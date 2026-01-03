#!/bin/bash

# Automaker Network Launch Script
# Levanta backend (puerto 3008) y frontend (puerto 3007) para acceso desde red LAN

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Banner
echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║          Automaker Network Launch Script             ║"
echo "╠═══════════════════════════════════════════════════════╣"
echo "║  Backend:  Port 3008 (API + WebSocket)               ║"
echo "║  Frontend: Port 3007 (Web UI)                        ║"
echo "║  Access:   Network enabled (0.0.0.0)                 ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# Step 1: Kill existing processes on ports
log_info "Cleaning up ports 3007 and 3008..."
npx kill-port 3007 3008 2>/dev/null || true
log_success "Ports cleaned"

# Step 2: Check if node_modules exists
if [ ! -d "node_modules" ]; then
    log_warn "node_modules not found, running npm install..."
    npm install
    log_success "Dependencies installed"
else
    log_info "Dependencies already installed"
fi

# Step 3: Build shared packages
log_info "Building shared packages..."
npm run build:packages
log_success "Packages built"

# Step 4: Get local IP for display
LOCAL_IP=$(hostname -I | awk '{print $1}')
log_info "Local IP detected: ${LOCAL_IP}"

# Step 4.5: Configure CORS for network access
log_info "Configuring CORS for network access..."
export CORS_ORIGIN="http://${LOCAL_IP}:3007 http://localhost:3007 http://127.0.0.1:3007"
log_success "CORS configured for: localhost, 127.0.0.1, ${LOCAL_IP}"

# Step 5: Start backend and frontend concurrently
log_info "Starting backend (port 3008) and frontend (port 3007)..."
echo ""
log_warn "Press Ctrl+C to stop all services"
echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║              Starting Services...                     ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# Run both server and web in parallel
npm run dev:full

# This line only executes if dev:full exits
log_warn "Services stopped"
