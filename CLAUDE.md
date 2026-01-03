# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoMakeIt is an autonomous AI development studio built as an npm workspace monorepo. It provides a Kanban-based workflow where AI agents (powered by Claude Agent SDK) implement features in isolated git worktrees.

## Common Commands

```bash
# Development
npm run dev                 # Interactive launcher (choose web or electron)
npm run dev:web             # Web browser mode (localhost:3007)
npm run dev:electron        # Desktop app mode
npm run dev:electron:debug  # Desktop with DevTools open

# Building
npm run build               # Build web application
npm run build:packages      # Build all shared packages (required before other builds)
npm run build:electron      # Build desktop app for current platform
npm run build:server        # Build server only

# Testing
npm run test                # E2E tests (Playwright, headless)
npm run test:headed         # E2E tests with browser visible
npm run test:server         # Server unit tests (Vitest)
npm run test:packages       # All shared package tests
npm run test:all            # All tests (packages + server)

# Single test file
npm run test:server -- tests/unit/specific.test.ts

# Linting and formatting
npm run lint                # ESLint
npm run format              # Prettier write
npm run format:check        # Prettier check
```

## Architecture

### Monorepo Structure

```
automakeit/
├── apps/
│   ├── ui/           # React + Vite + Electron frontend (port 3007)
│   └── server/       # Express + WebSocket backend (port 3008)
└── libs/             # Shared packages (@automakeit/*)
    ├── types/        # Core TypeScript definitions (no dependencies)
    ├── utils/        # Logging, errors, image processing, context loading
    ├── prompts/      # AI prompt templates
    ├── platform/     # Path management, security, process spawning
    ├── model-resolver/    # Claude model alias resolution
    ├── dependency-resolver/  # Feature dependency ordering
    └── git-utils/    # Git operations & worktree management
```

### Package Dependency Chain

Packages can only depend on packages above them:

```
@automakeit/types (no dependencies)
    ↓
@automakeit/utils, @automakeit/prompts, @automakeit/platform, @automakeit/model-resolver, @automakeit/dependency-resolver
    ↓
@automakeit/git-utils
    ↓
@automakeit/server, @automakeit/ui
```

### Key Technologies

- **Frontend**: React 19, Vite 7, Electron 39, TanStack Router, Zustand 5, Tailwind CSS 4
- **Backend**: Express 5, WebSocket (ws), Claude Agent SDK, node-pty
- **Testing**: Playwright (E2E), Vitest (unit)

### Server Architecture

The server (`apps/server/src/`) follows a modular pattern:

- `routes/` - Express route handlers organized by feature (agent, features, auto-mode, worktree, etc.)
- `services/` - Business logic (AgentService, AutoModeService, FeatureLoader, TerminalService)
- `providers/` - AI provider abstraction (currently Claude via Claude Agent SDK)
- `lib/` - Utilities (events, auth, worktree metadata)

### Frontend Architecture

The UI (`apps/ui/src/`) uses:

- `routes/` - TanStack Router file-based routing
- `components/views/` - Main view components (board, settings, terminal, etc.)
- `store/` - Zustand stores with persistence (app-store.ts, setup-store.ts)
- `hooks/` - Custom React hooks
- `lib/` - Utilities and API client

## Data Storage

### Per-Project Data (`.automakeit/`)

```
.automakeit/
├── features/              # Feature JSON files and images
│   └── {featureId}/
│       ├── feature.json
│       ├── agent-output.md
│       └── images/
├── context/               # Context files for AI agents (CLAUDE.md, etc.)
├── settings.json          # Project-specific settings
├── spec.md               # Project specification
└── analysis.json         # Project structure analysis
```

### Global Data (`DATA_DIR`, default `./data`)

```
data/
├── settings.json          # Global settings, profiles, shortcuts
├── credentials.json       # API keys
├── sessions-metadata.json # Chat session metadata
└── agent-sessions/        # Conversation histories
```

## Import Conventions

Always import from shared packages, never from old paths:

```typescript
// ✅ Correct
import type { Feature, ExecuteOptions } from '@automakeit/types';
import { createLogger, classifyError } from '@automakeit/utils';
import { getEnhancementPrompt } from '@automakeit/prompts';
import { getFeatureDir, ensureAutoMakeItDir } from '@automakeit/platform';
import { resolveModelString } from '@automakeit/model-resolver';
import { resolveDependencies } from '@automakeit/dependency-resolver';
import { getGitRepositoryDiffs } from '@automakeit/git-utils';

// ❌ Never import from old paths
import { Feature } from '../services/feature-loader'; // Wrong
import { createLogger } from '../lib/logger'; // Wrong
```

## Key Patterns

### Event-Driven Architecture

All server operations emit events that stream to the frontend via WebSocket. Events are created using `createEventEmitter()` from `lib/events.ts`.

### Git Worktree Isolation

Each feature executes in an isolated git worktree, created via `@automakeit/git-utils`. This protects the main branch during AI agent execution.

### Context Files

Project-specific rules are stored in `.automakeit/context/` and automatically loaded into agent prompts via `loadContextFiles()` from `@automakeit/utils`.

### Model Resolution

Use `resolveModelString()` from `@automakeit/model-resolver` to convert model aliases:

- `haiku` → `claude-haiku-4-5`
- `sonnet` → `claude-sonnet-4-20250514`
- `opus` → `claude-opus-4-5-20251101`

## Environment Variables

### Required

- `ANTHROPIC_API_KEY` - Anthropic API key (or use Claude Code CLI auth)

### Server Configuration

- `PORT` - Server port (default: 3008)
- `DATA_DIR` - Data storage directory (default: ./data)
- `CORS_ORIGIN` - Allowed CORS origins (default: localhost:3007)
- `ENABLE_REQUEST_LOGGING` - Enable HTTP request logging (default: true)

### Security

- `ALLOWED_ROOT_DIRECTORY` - Restrict file operations to specific directory
- `TERMINAL_MAX_SESSIONS` - Maximum terminal sessions (default: 1000)

### Testing

- `AUTOMAKER_MOCK_AGENT=true` - Enable mock agent mode for CI testing

## Security

AutoMakeIt implements multiple security layers. See [docs/SECURITY.md](docs/SECURITY.md) for details.

### Quick Reference

**Input Sanitization**:

```typescript
import { sanitizeFilename } from '@automakeit/platform';
const safe = sanitizeFilename(userInput); // Prevents path traversal
```

**Path Validation**:

```typescript
import { validatePath, isPathAllowed } from '@automakeit/platform';
validatePath(path); // Throws if outside allowed directories
```

**Image Validation**:

```typescript
import { readImageAsBase64 } from '@automakeit/utils';
const img = await readImageAsBase64(path); // Max 10MB, validates size
```

**Rate Limiting**: Automatically enforced (1000 req/15min general, 50 req/15min AI endpoints)

**Command Execution**: Always validate inputs before shell commands:

```typescript
// ✅ GOOD
spawn('git', ['clone', url, path]);

// ❌ BAD
exec(`git clone ${url} ${path}`);
```
