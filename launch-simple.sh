#!/bin/bash

# Automaker Simple Launch Script (Sin concurrently)
# Levanta backend y frontend en procesos separados

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[⚠]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

# Trap Ctrl+C to kill all background processes
cleanup() {
    log_warn "Stopping services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    log_success "Services stopped"
    exit 0
}
trap cleanup SIGINT SIGTERM

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║          Automaker Network Launch Script             ║"
echo "╠═══════════════════════════════════════════════════════╣"
echo "║  Backend:  Port 3008 (API + WebSocket)               ║"
echo "║  Frontend: Port 3007 (Web UI)                        ║"
echo "║  Access:   Network enabled (0.0.0.0)                 ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# Kill existing processes
log_info "Cleaning up ports 3007 and 3008..."
npx kill-port 3007 3008 2>/dev/null || true
log_success "Ports cleaned"

# Check dependencies
if [ ! -d "node_modules" ]; then
    log_warn "node_modules not found, running npm install..."
    npm install
    log_success "Dependencies installed"
fi

# Build packages
log_info "Building shared packages..."
npm run build:packages
log_success "Packages built"

# Get local IP
LOCAL_IP=$(hostname -I | awk '{print $1}')
log_info "Local IP: ${LOCAL_IP}"

# Configure CORS for network access
log_info "Configuring CORS for network access..."
export CORS_ORIGIN="http://${LOCAL_IP}:3007 http://localhost:3007 http://127.0.0.1:3007"
log_success "CORS configured for: localhost, 127.0.0.1, ${LOCAL_IP}"

echo ""
log_info "Starting Backend (port 3008)..."
npm run _dev:server > backend.log 2>&1 &
BACKEND_PID=$!
log_success "Backend started (PID: ${BACKEND_PID})"

# Wait for backend to be ready
log_info "Waiting for backend to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:3008/api/health > /dev/null 2>&1; then
        log_success "Backend is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        log_error "Backend failed to start. Check backend.log for errors."
        cat backend.log
        kill $BACKEND_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

log_info "Starting Frontend (port 3007)..."
npm run _dev:web > frontend.log 2>&1 &
FRONTEND_PID=$!
log_success "Frontend started (PID: ${FRONTEND_PID})"

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║                Services Running                       ║"
echo "╠═══════════════════════════════════════════════════════╣"
echo "║  Backend PID:   ${BACKEND_PID}                                    ║"
echo "║  Frontend PID:  ${FRONTEND_PID}                                    ║"
echo "║                                                       ║"
echo "║  Local Access:   http://localhost:3007               ║"
echo "║  Network Access: http://${LOCAL_IP}:3007        ║"
echo "║                                                       ║"
echo "║  Logs:                                                ║"
echo "║    Backend:  tail -f backend.log                     ║"
echo "║    Frontend: tail -f frontend.log                    ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""
log_warn "Press Ctrl+C to stop all services"
echo ""

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
