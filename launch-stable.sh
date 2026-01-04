#!/bin/bash
# Stable launcher WITHOUT watch mode - for QA Loop testing

set -e

echo "🚀 AutoMakeIt STABLE Launch (No Hot Reload)"
echo "==========================================="
echo ""

# Cleanup
echo "Cleaning processes..."
pkill -f "node.*apps/server/dist" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true  
pkill -f "tsx" 2>/dev/null || true
sleep 2

# Build once
echo "Building packages..."
npm run build:packages > /dev/null 2>&1

echo "Building server..."
npm run build:server > /dev/null 2>&1

# Get local IP
LOCAL_IP=$(hostname -I | awk '{print $1}')
export CORS_ORIGIN="http://${LOCAL_IP}:3007 http://localhost:3007 http://127.0.0.1:3007"

echo ""
echo "✅ Build complete"
echo ""
echo "Starting services..."
echo "  Backend:  http://localhost:3008"
echo "  Frontend: http://localhost:3007"
echo "  Network:  http://${LOCAL_IP}:3007"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start backend WITHOUT watch mode
node apps/server/dist/index.js &
BACKEND_PID=$!

# Wait for backend
sleep 3

# Start frontend
cd apps/ui && npm run dev &
FRONTEND_PID=$!

# Cleanup function
cleanup() {
    echo ""
    echo "Stopping services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup INT TERM

# Wait
wait
