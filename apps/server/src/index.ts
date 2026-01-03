/**
 * Automaker Backend Server
 *
 * Provides HTTP/WebSocket API for both web and Electron modes.
 * In Electron mode, this server runs locally.
 * In web mode, this server runs on a remote host.
 */

// Ensure node is in PATH for Claude Agent SDK subprocess spawning
// This fixes "spawn node ENOENT" error when SDK tries to spawn child processes
if (process.env.PATH && !process.env.PATH.includes('/home/linuxbrew/.linuxbrew/bin')) {
  process.env.PATH = `/home/linuxbrew/.linuxbrew/bin:${process.env.PATH}`;
}

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import cookie from 'cookie';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';
import os from 'os';
import { createLogger } from '@automakeit/utils';

const logger = createLogger('Server');

import { createEventEmitter, type EventEmitter } from './lib/events.js';
import { initAllowedPaths } from '@automakeit/platform';
import { authMiddleware, validateWsConnectionToken, checkRawAuthentication } from './lib/auth.js';
import { requireJsonContentType } from './middleware/require-json-content-type.js';
import { createAuthRoutes } from './routes/auth/index.js';
import { createFsRoutes } from './routes/fs/index.js';
import { createHealthRoutes, createDetailedHandler } from './routes/health/index.js';
import { createAgentRoutes } from './routes/agent/index.js';
import { createSessionsRoutes } from './routes/sessions/index.js';
import { createFeaturesRoutes } from './routes/features/index.js';
import { createAutoModeRoutes } from './routes/auto-mode/index.js';
import { createEnhancePromptRoutes } from './routes/enhance-prompt/index.js';
import { createWorktreeRoutes } from './routes/worktree/index.js';
import { createGitRoutes } from './routes/git/index.js';
import { createSetupRoutes } from './routes/setup/index.js';
import { createSuggestionsRoutes } from './routes/suggestions/index.js';
import { createModelsRoutes } from './routes/models/index.js';
import { createRunningAgentsRoutes } from './routes/running-agents/index.js';
import { createWorkspaceRoutes } from './routes/workspace/index.js';
import { createTemplatesRoutes } from './routes/templates/index.js';
import {
  createTerminalRoutes,
  validateTerminalToken,
  isTerminalEnabled,
  isTerminalPasswordRequired,
} from './routes/terminal/index.js';
import { createSettingsRoutes } from './routes/settings/index.js';
import { AgentService } from './services/agent-service.js';
import { FeatureLoader } from './services/feature-loader.js';
import { AutoModeService } from './services/auto-mode-service.js';
import { getTerminalService } from './services/terminal-service.js';
import { SettingsService } from './services/settings-service.js';
import { createSpecRegenerationRoutes } from './routes/app-spec/index.js';
import { createClaudeRoutes } from './routes/claude/index.js';
import { ClaudeUsageService } from './services/claude-usage-service.js';
import { createGitHubRoutes } from './routes/github/index.js';
import { createContextRoutes } from './routes/context/index.js';
import { createBacklogPlanRoutes } from './routes/backlog-plan/index.js';
import { cleanupStaleValidations } from './routes/github/routes/validation-common.js';
import { createMCPRoutes } from './routes/mcp/index.js';
import { MCPTestService } from './services/mcp-test-service.js';
import { createPipelineRoutes } from './routes/pipeline/index.js';
import { pipelineService } from './services/pipeline-service.js';
import { getServerConfig } from './config/env.js';
import { createMultiAgentSpecRoutes } from './routes/spec/multi-agent.js';

// Load environment variables
dotenv.config();

// Load centralized configuration
const config = getServerConfig();

const PORT = config.port;
const DATA_DIR = config.dataDir;
const ENABLE_REQUEST_LOGGING = config.enableRequestLogging;

// Check for required environment variables
const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;

if (!hasAnthropicKey) {
  logger.warn(`
╔═══════════════════════════════════════════════════════════════════════╗
║  ⚠️  WARNING: No Claude authentication configured                      ║
║                                                                       ║
║  The Claude Agent SDK requires authentication to function.            ║
║                                                                       ║
║  Set your Anthropic API key:                                          ║
║    export ANTHROPIC_API_KEY="sk-ant-..."                              ║
║                                                                       ║
║  Or use the setup wizard in Settings to configure authentication.     ║
╚═══════════════════════════════════════════════════════════════════════╝
`);
} else {
  logger.info('[Server] ✓ ANTHROPIC_API_KEY detected (API key auth)');
}

// Initialize security
initAllowedPaths();

// Create Express app
const app = express();

// Middleware
// Custom colored logger showing only endpoint and status code (configurable via ENABLE_REQUEST_LOGGING env var)
if (ENABLE_REQUEST_LOGGING) {
  morgan.token('status-colored', (_req, res) => {
    const status = res.statusCode;
    if (status >= 500) return `\x1b[31m${status}\x1b[0m`; // Red for server errors
    if (status >= 400) return `\x1b[33m${status}\x1b[0m`; // Yellow for client errors
    if (status >= 300) return `\x1b[36m${status}\x1b[0m`; // Cyan for redirects
    return `\x1b[32m${status}\x1b[0m`; // Green for success
  });

  app.use(
    morgan(':method :url :status-colored', {
      skip: (req) => req.url === '/api/health', // Skip health check logs
    })
  );
}
// SECURITY: Restrict CORS to localhost UI origins to prevent drive-by attacks
// from malicious websites. MCP server endpoints can execute arbitrary commands,
// so allowing any origin would enable RCE from any website visited while Automaker runs.
const DEFAULT_CORS_ORIGINS = ['http://localhost:3007', 'http://127.0.0.1:3007'];

// SECURITY: Validate CORS_ORIGIN against whitelist
// Allow localhost and private network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
function validateCorsOrigin(origin: string | string[] | undefined): string | string[] {
  if (!origin) {
    return DEFAULT_CORS_ORIGINS;
  }

  // Normalize to array - split by comma or space if string
  const origins = Array.isArray(origin) ? origin : origin.split(/[,\s]+/).filter(Boolean);

  // Whitelist: allow localhost and private network IPs
  const ALLOWED_PATTERNS = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
    /^https?:\/\/\[::1\](:\d+)?$/, // IPv6 localhost
    /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/, // Private network 192.168.x.x
    /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/, // Private network 10.x.x.x
    /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}(:\d+)?$/, // Private network 172.16-31.x.x
    /^https?:\/\/0\.0\.0\.0(:\d+)?$/, // Allow 0.0.0.0 for network binding
  ];

  const validOrigins = origins.filter((o) => {
    const matches = ALLOWED_PATTERNS.some((pattern) => pattern.test(o));
    if (!matches) {
      logger.warn(`[Security] Rejecting invalid CORS origin: ${o}`);
    }
    return matches;
  });

  if (validOrigins.length === 0) {
    logger.warn('[Security] No valid CORS origins found in CORS_ORIGIN env var, using defaults');
    return DEFAULT_CORS_ORIGINS;
  }

  return validOrigins.length === 1 ? validOrigins[0] : validOrigins;
}

const corsOrigin = validateCorsOrigin(process.env.CORS_ORIGIN);
logger.info('[Security] CORS origins configured:', corsOrigin);

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// SECURITY: Rate limiting to prevent abuse
// General rate limit for all API endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Skip rate limiting for essential read operations that the UI needs
  skip: (req) => {
    const exemptPaths = [
      '/api/features/list',
      '/api/features/get',
      '/api/worktree/list',
      '/api/health',
    ];
    return exemptPaths.some((path) => req.path === path);
  },
});

// Stricter rate limit for agent/AI endpoints (expensive operations)
const agentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 agent requests per 15 minutes
  message: 'Too many AI agent requests. Please wait before starting new conversations.',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for read-only operations
  skip: (req) => {
    // Allow status checks and context queries without strict limiting
    const isReadOnly =
      req.path.includes('/status') || req.path.includes('/context-exists') || req.method === 'GET';
    return isReadOnly;
  },
});

// Apply general rate limiter to all routes
app.use('/api/', generalLimiter);

// Create shared event emitter for streaming
const events: EventEmitter = createEventEmitter();

// Create services
// Note: settingsService is created first so it can be injected into other services
const settingsService = new SettingsService(DATA_DIR);
const agentService = new AgentService(DATA_DIR, events, settingsService);
const featureLoader = new FeatureLoader();
const autoModeService = new AutoModeService(events, settingsService);
const claudeUsageService = new ClaudeUsageService();
const mcpTestService = new MCPTestService(settingsService);

// Initialize services
(async () => {
  await agentService.initialize();
  logger.info('[Server] Agent service initialized');
})();

// Run stale validation cleanup every hour to prevent memory leaks from crashed validations
const VALIDATION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
setInterval(() => {
  const cleaned = cleanupStaleValidations();
  if (cleaned > 0) {
    logger.info(`[Server] Cleaned up ${cleaned} stale validation entries`);
  }
}, VALIDATION_CLEANUP_INTERVAL_MS);

// Require Content-Type: application/json for all API POST/PUT/PATCH requests
// This helps prevent CSRF and content-type confusion attacks
app.use('/api', requireJsonContentType);

// Mount API routes - health and auth are unauthenticated
app.use('/api/health', createHealthRoutes());
app.use('/api/auth', createAuthRoutes());

// Apply authentication to all other routes
app.use('/api', authMiddleware);

// Protected health endpoint with detailed info
app.get('/api/health/detailed', createDetailedHandler());

app.use('/api/fs', createFsRoutes(events));
// Apply stricter rate limiting to AI agent endpoints
app.use('/api/agent', agentLimiter, createAgentRoutes(agentService, events));
app.use('/api/sessions', createSessionsRoutes(agentService));
app.use('/api/features', createFeaturesRoutes(featureLoader));
// Apply stricter rate limiting to auto-mode (uses AI agent internally)
app.use('/api/auto-mode', agentLimiter, createAutoModeRoutes(autoModeService));
// Apply stricter rate limiting to AI-powered endpoints
app.use('/api/enhance-prompt', agentLimiter, createEnhancePromptRoutes(settingsService));
app.use('/api/worktree', createWorktreeRoutes());
app.use('/api/git', createGitRoutes());
app.use('/api/setup', createSetupRoutes());
app.use('/api/suggestions', agentLimiter, createSuggestionsRoutes(events, settingsService));
app.use('/api/models', createModelsRoutes());
app.use(
  '/api/spec-regeneration',
  agentLimiter,
  createSpecRegenerationRoutes(events, settingsService)
);
app.use('/api/running-agents', createRunningAgentsRoutes(autoModeService));
app.use('/api/workspace', createWorkspaceRoutes());
app.use('/api/templates', createTemplatesRoutes());
app.use('/api/terminal', createTerminalRoutes());
app.use('/api/settings', createSettingsRoutes(settingsService));
app.use('/api/claude', createClaudeRoutes(claudeUsageService));
app.use('/api/github', createGitHubRoutes(events, settingsService));
app.use('/api/context', createContextRoutes(settingsService));
// Apply stricter rate limiting to AI-powered backlog planning
app.use('/api/backlog-plan', agentLimiter, createBacklogPlanRoutes(events, settingsService));
app.use('/api/mcp', createMCPRoutes(mcpTestService));
app.use('/api/pipeline', createPipelineRoutes(pipelineService));
// Multi-Agent Spec Generation (AI-powered, apply agent rate limiting)
app.use('/api/spec', agentLimiter, createMultiAgentSpecRoutes(events));

// Create HTTP server
const server = createServer(app);

// WebSocket servers using noServer mode for proper multi-path support
const wss = new WebSocketServer({ noServer: true });
const terminalWss = new WebSocketServer({ noServer: true });
const terminalService = getTerminalService();

/**
 * Authenticate WebSocket upgrade requests
 * Checks for API key in header/query, session token in header/query, OR valid session cookie
 */
function authenticateWebSocket(request: import('http').IncomingMessage): boolean {
  const url = new URL(request.url || '', `http://${request.headers.host}`);

  // Convert URL search params to query object
  const query: Record<string, string | undefined> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  // Parse cookies from header
  const cookieHeader = request.headers.cookie;
  const cookies = cookieHeader ? cookie.parse(cookieHeader) : {};

  // Use shared authentication logic for standard auth methods
  if (
    checkRawAuthentication(
      request.headers as Record<string, string | string[] | undefined>,
      query,
      cookies
    )
  ) {
    return true;
  }

  // Additionally check for short-lived WebSocket connection token (WebSocket-specific)
  const wsToken = url.searchParams.get('wsToken');
  if (wsToken && validateWsConnectionToken(wsToken)) {
    return true;
  }

  return false;
}

// Handle HTTP upgrade requests manually to route to correct WebSocket server
server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);

  // Authenticate all WebSocket connections
  if (!authenticateWebSocket(request)) {
    console.log('[WebSocket] Authentication failed, rejecting connection');
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  if (pathname === '/api/events') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (pathname === '/api/terminal/ws') {
    terminalWss.handleUpgrade(request, socket, head, (ws) => {
      terminalWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Events WebSocket connection handler
wss.on('connection', (ws: WebSocket) => {
  logger.info('[WebSocket] Client connected, ready state:', ws.readyState);

  // Track if already unsubscribed to prevent double-cleanup
  let hasUnsubscribed = false;
  const safeUnsubscribe = () => {
    if (!hasUnsubscribed) {
      hasUnsubscribed = true;
      unsubscribe();
    }
  };

  // Event batching configuration
  const BATCH_INTERVAL_MS = 50; // 50ms batching window
  const URGENT_EVENT_TYPES = new Set(['auto-mode:error', 'feature:error', 'agent:error']);
  let eventBatch: Array<{ type: string; payload: unknown }> = [];
  let batchTimer: NodeJS.Timeout | null = null;

  // Flush batched events to client
  const flushBatch = () => {
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }

    if (eventBatch.length === 0 || ws.readyState !== WebSocket.OPEN) {
      eventBatch = [];
      return;
    }

    try {
      // Send batched events as array
      const message = JSON.stringify({
        type: 'batch',
        events: eventBatch,
        count: eventBatch.length,
      });

      logger.info('[WebSocket] Sending batched events to client:', {
        batchSize: eventBatch.length,
        messageLength: message.length,
      });

      ws.send(message);
      eventBatch = [];
    } catch (error) {
      logger.error('[WebSocket] ERROR sending batched message:', error);
      eventBatch = [];
      safeUnsubscribe();
      ws.close();
    }
  };

  // Subscribe to all events and forward to this client
  const unsubscribe = events.subscribe((type, payload) => {
    logger.info('[WebSocket] Event received:', {
      type,
      hasPayload: !!payload,
      payloadKeys: payload ? Object.keys(payload) : [],
      wsReadyState: ws.readyState,
      wsOpen: ws.readyState === WebSocket.OPEN,
    });

    if (ws.readyState !== WebSocket.OPEN) {
      logger.info(
        '[WebSocket] WARNING: Cannot send event, WebSocket not open. ReadyState:',
        ws.readyState
      );
      safeUnsubscribe();
      return;
    }

    // Check if this is an urgent event that should bypass batching
    const isUrgent = URGENT_EVENT_TYPES.has(type);

    if (isUrgent) {
      // Flush pending batch first
      flushBatch();

      // Send urgent event immediately
      try {
        const message = JSON.stringify({ type, payload });
        logger.info('[WebSocket] Sending urgent event immediately:', {
          type,
          messageLength: message.length,
        });
        ws.send(message);
      } catch (error) {
        logger.error('[WebSocket] ERROR sending urgent message:', error);
        safeUnsubscribe();
        ws.close();
      }
    } else {
      // Add to batch
      eventBatch.push({ type, payload });

      // Schedule batch flush if not already scheduled
      if (!batchTimer) {
        batchTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS);
      }

      // Also flush if batch gets too large (safety limit)
      if (eventBatch.length >= 100) {
        flushBatch();
      }
    }
  });

  ws.on('close', () => {
    logger.info('[WebSocket] Client disconnected');
    safeUnsubscribe();
  });

  ws.on('error', (error) => {
    logger.error('[WebSocket] ERROR:', error);
    safeUnsubscribe();
  });
});

// Track WebSocket connections per session
const terminalConnections: Map<string, Set<WebSocket>> = new Map();
// Track last resize dimensions per session to deduplicate resize messages
const lastResizeDimensions: Map<string, { cols: number; rows: number }> = new Map();
// Track last resize timestamp to rate-limit resize operations (prevents resize storm)
const lastResizeTime: Map<string, number> = new Map();
const RESIZE_MIN_INTERVAL_MS = 100; // Minimum 100ms between resize operations

// Clean up resize tracking when sessions actually exit (not just when connections close)
terminalService.onExit((sessionId) => {
  lastResizeDimensions.delete(sessionId);
  lastResizeTime.delete(sessionId);
  terminalConnections.delete(sessionId);
});

// Terminal WebSocket connection handler
terminalWss.on('connection', (ws: WebSocket, req: import('http').IncomingMessage) => {
  // Parse URL to get session ID and token
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');
  const token = url.searchParams.get('token');

  logger.info(`[Terminal WS] Connection attempt for session: ${sessionId}`);

  // Check if terminal is enabled
  if (!isTerminalEnabled()) {
    logger.info('[Terminal WS] Terminal is disabled');
    ws.close(4003, 'Terminal access is disabled');
    return;
  }

  // Validate token if password is required
  if (isTerminalPasswordRequired() && !validateTerminalToken(token || undefined)) {
    logger.info('[Terminal WS] Invalid or missing token');
    ws.close(4001, 'Authentication required');
    return;
  }

  if (!sessionId) {
    logger.info('[Terminal WS] No session ID provided');
    ws.close(4002, 'Session ID required');
    return;
  }

  // Check if session exists
  const session = terminalService.getSession(sessionId);
  if (!session) {
    logger.info(`[Terminal WS] Session ${sessionId} not found`);
    ws.close(4004, 'Session not found');
    return;
  }

  logger.info(`[Terminal WS] Client connected to session ${sessionId}`);

  // Track this connection
  if (!terminalConnections.has(sessionId)) {
    terminalConnections.set(sessionId, new Set());
  }
  terminalConnections.get(sessionId)!.add(ws);

  // Send initial connection success FIRST
  ws.send(
    JSON.stringify({
      type: 'connected',
      sessionId,
      shell: session.shell,
      cwd: session.cwd,
    })
  );

  // Send scrollback buffer BEFORE subscribing to prevent race condition
  // Also clear pending output buffer to prevent duplicates from throttled flush
  const scrollback = terminalService.getScrollbackAndClearPending(sessionId);
  if (scrollback && scrollback.length > 0) {
    ws.send(
      JSON.stringify({
        type: 'scrollback',
        data: scrollback,
      })
    );
  }

  // NOW subscribe to terminal data (after scrollback is sent)
  const unsubscribeData = terminalService.onData((sid, data) => {
    if (sid === sessionId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'data', data }));
    }
  });

  // Subscribe to terminal exit
  const unsubscribeExit = terminalService.onExit((sid, exitCode) => {
    if (sid === sessionId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode }));
      ws.close(1000, 'Session ended');
    }
  });

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());

      switch (msg.type) {
        case 'input':
          // Validate input data type and length
          if (typeof msg.data !== 'string') {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid input type' }));
            break;
          }
          // Limit input size to 1MB to prevent memory issues
          if (msg.data.length > 1024 * 1024) {
            ws.send(JSON.stringify({ type: 'error', message: 'Input too large' }));
            break;
          }
          // Write user input to terminal
          terminalService.write(sessionId, msg.data);
          break;

        case 'resize':
          // Validate resize dimensions are positive integers within reasonable bounds
          if (
            typeof msg.cols !== 'number' ||
            typeof msg.rows !== 'number' ||
            !Number.isInteger(msg.cols) ||
            !Number.isInteger(msg.rows) ||
            msg.cols < 1 ||
            msg.cols > 1000 ||
            msg.rows < 1 ||
            msg.rows > 500
          ) {
            break; // Silently ignore invalid resize requests
          }
          // Resize terminal with deduplication and rate limiting
          if (msg.cols && msg.rows) {
            const now = Date.now();
            const lastTime = lastResizeTime.get(sessionId) || 0;
            const lastDimensions = lastResizeDimensions.get(sessionId);

            // Skip if resized too recently (prevents resize storm during splits)
            if (now - lastTime < RESIZE_MIN_INTERVAL_MS) {
              break;
            }

            // Check if dimensions are different from last resize
            if (
              !lastDimensions ||
              lastDimensions.cols !== msg.cols ||
              lastDimensions.rows !== msg.rows
            ) {
              // Only suppress output on subsequent resizes, not the first one
              // The first resize happens on terminal open and we don't want to drop the initial prompt
              const isFirstResize = !lastDimensions;
              terminalService.resize(sessionId, msg.cols, msg.rows, !isFirstResize);
              lastResizeDimensions.set(sessionId, {
                cols: msg.cols,
                rows: msg.rows,
              });
              lastResizeTime.set(sessionId, now);
            }
          }
          break;

        case 'ping':
          // Respond to ping
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          logger.warn(`[Terminal WS] Unknown message type: ${msg.type}`);
      }
    } catch (error) {
      logger.error('[Terminal WS] Error processing message:', error);
    }
  });

  ws.on('close', () => {
    logger.info(`[Terminal WS] Client disconnected from session ${sessionId}`);
    unsubscribeData();
    unsubscribeExit();

    // Remove from connections tracking
    const connections = terminalConnections.get(sessionId);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        terminalConnections.delete(sessionId);
        // DON'T delete lastResizeDimensions/lastResizeTime here!
        // The session still exists, and reconnecting clients need to know
        // this isn't the "first resize" to prevent duplicate prompts.
        // These get cleaned up when the session actually exits.
      }
    }
  });

  ws.on('error', (error) => {
    logger.error(`[Terminal WS] Error on session ${sessionId}:`, error);
    unsubscribeData();
    unsubscribeExit();
  });
});

// Start server with error handling for port conflicts
const startServer = (port: number) => {
  server.listen(port, '0.0.0.0', () => {
    const terminalStatus = isTerminalEnabled()
      ? isTerminalPasswordRequired()
        ? 'enabled (password protected)'
        : 'enabled'
      : 'disabled';
    const portStr = port.toString().padEnd(4);

    // Get local IP for network access info
    const interfaces = os.networkInterfaces();
    let localIP = 'localhost';

    for (const name of Object.keys(interfaces)) {
      const ifaceList = interfaces[name];
      if (!ifaceList) continue;
      for (const iface of ifaceList) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localIP = iface.address;
          break;
        }
      }
      if (localIP !== 'localhost') break;
    }

    logger.info(`
╔═══════════════════════════════════════════════════════╗
║           Automaker Backend Server                    ║
╠═══════════════════════════════════════════════════════╣
║  Local:       http://localhost:${portStr}                 ║
║  Network:     http://${localIP}:${portStr}           ║
║  WebSocket:   ws://${localIP}:${portStr}/api/events       ║
║  Terminal:    ws://${localIP}:${portStr}/api/terminal/ws  ║
║  Health:      http://${localIP}:${portStr}/api/health     ║
║  Terminal:    ${terminalStatus.padEnd(37)}║
╚═══════════════════════════════════════════════════════╝
`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`
╔═══════════════════════════════════════════════════════╗
║  ❌ ERROR: Port ${port} is already in use              ║
╠═══════════════════════════════════════════════════════╣
║  Another process is using this port.                  ║
║                                                       ║
║  To fix this, try one of:                             ║
║                                                       ║
║  1. Kill the process using the port:                  ║
║     lsof -ti:${port} | xargs kill -9                   ║
║                                                       ║
║  2. Use a different port:                             ║
║     PORT=${port + 1} npm run dev:server                ║
║                                                       ║
║  3. Use the init.sh script which handles this:        ║
║     ./init.sh                                         ║
╚═══════════════════════════════════════════════════════╝
`);
      process.exit(1);
    } else {
      logger.error('[Server] Error starting server:', error);
      process.exit(1);
    }
  });
};

startServer(PORT);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  terminalService.cleanup();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down...');
  terminalService.cleanup();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
