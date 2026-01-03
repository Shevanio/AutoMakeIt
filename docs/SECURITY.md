# Security Guidelines

This document outlines the security measures implemented in AutoMakeIt and best practices for maintaining security.

## Table of Contents

- [Overview](#overview)
- [Security Layers](#security-layers)
- [Input Validation](#input-validation)
- [Rate Limiting](#rate-limiting)
- [Command Execution Safety](#command-execution-safety)
- [File Operations Security](#file-operations-security)
- [Environment Variables](#environment-variables)
- [Best Practices](#best-practices)

---

## Overview

AutoMakeIt implements defense-in-depth security with multiple layers of protection against common web application vulnerabilities including:

- Path traversal attacks
- Command injection
- Cross-Site Request Forgery (CSRF/CORS bypass)
- Denial of Service (DoS) via resource exhaustion
- Prompt injection
- File upload attacks

---

## Security Layers

### 1. CORS Protection (`apps/server/src/index.ts`)

**What it prevents**: CORS bypass attacks, drive-by attacks from malicious websites

```typescript
// Only allow localhost origins
const ALLOWED_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/\[::1\](:\d+)?$/, // IPv6 localhost
];
```

**Configuration**:

```bash
# Optionally override via environment variable
CORS_ORIGIN=http://localhost:3007
```

### 2. Rate Limiting (`apps/server/src/index.ts`)

**What it prevents**: API abuse, brute force attacks, DoS

```typescript
// General endpoints: 1000 requests per 15 minutes
// AI endpoints: 50 requests per 15 minutes
```

**Protected endpoints**:

- `/api/agent` - Chat with AI agent
- `/api/auto-mode` - Autonomous feature implementation
- `/api/enhance-prompt` - Prompt enhancement
- `/api/suggestions` - Code suggestions
- `/api/spec-regeneration` - Spec generation
- `/api/backlog-plan` - Backlog planning

**Configuration**:

```bash
# Future: Make configurable
RATE_LIMIT_GENERAL=1000
RATE_LIMIT_AI=50
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
```

### 3. Input Sanitization (`apps/server/src/services/auto-mode-service.ts`)

**What it prevents**: Prompt injection attacks

```typescript
function sanitizeUserInput(input: string): string {
  // Remove potential injection patterns
  const dangerous = [
    /system:/gi,
    /\[INST\]/gi,
    /<\|im_start\|>/gi,
    // ... more patterns
  ];

  let sanitized = input;
  dangerous.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, '');
  });

  return sanitized;
}
```

**Usage**:

```typescript
// Always sanitize user input before sending to AI
const sanitizedMessage = sanitizeUserInput(userMessage);
```

### 4. Path Validation (`@automakeit/platform/security.ts`)

**What it prevents**: Path traversal attacks, unauthorized file access

```typescript
import { validatePath, isPathAllowed } from '@automakeit/platform';

// Throws PathNotAllowedError if path is outside allowed directories
const safePath = validatePath(userProvidedPath);

// Check without throwing
if (isPathAllowed(somePath)) {
  // Safe to proceed
}
```

**Configuration**:

```bash
# Restrict file operations to specific directory
ALLOWED_ROOT_DIRECTORY=/home/user/projects

# Data directory is always allowed (for settings/credentials)
DATA_DIR=./data
```

### 5. Filename Sanitization (`@automakeit/platform/security.ts`)

**What it prevents**: Path traversal via filenames, directory escape

```typescript
import { sanitizeFilename } from '@automakeit/platform';

// Remove dangerous characters and path components
const safeFilename = sanitizeFilename(userFilename);
// Input:  "../../../etc/passwd"
// Output: "passwd"

// Input:  "C:\\Windows\\System32\\cmd.exe"
// Output: "cmd.exe"
```

**Protection against**:

- Parent directory references (`../`, `..\\`)
- Absolute paths (`/etc/passwd`, `C:\\Windows\\`)
- Null byte injection (`file.txt\0.php`)
- Hidden file creation (`.htaccess`, `.ssh/`)

**Usage**:

```typescript
// Always sanitize filenames before file operations
const safeFilename = sanitizeFilename(path.basename(uploadedFile.name));
const safePath = path.join(uploadDir, safeFilename);
await fs.writeFile(safePath, data);
```

### 6. Image Size Validation (`@automakeit/utils/image-handler.ts`)

**What it prevents**: DoS via large file uploads, memory exhaustion

```typescript
// Maximum 10MB per image
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

// Validation happens before base64 conversion
if (imageBuffer.length > MAX_IMAGE_SIZE_BYTES) {
  throw new Error(`Image too large (${sizeMB}MB). Max: 10MB`);
}
```

**Usage**:

```typescript
import { readImageAsBase64 } from '@automakeit/utils';

try {
  const imageData = await readImageAsBase64(imagePath);
  // Safe to use imageData.base64
} catch (error) {
  // Handle oversized image error
}
```

### 7. Command Injection Prevention (`apps/server/src/services/dev-server-service.ts`)

**What it prevents**: Shell command injection

```typescript
// ALWAYS validate inputs before shell commands
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  return; // Invalid port
}

// Validate PID is numeric only
if (!/^\d+$/.test(pid)) {
  return; // Invalid PID format
}

// Now safe to use in shell command
execSync(`taskkill /F /PID ${pid}`);
```

**Best practices**:

1. **Prefer spawn() with argument arrays over exec()**

   ```typescript
   // ✅ GOOD: Arguments separated
   spawn('git', ['clone', repoUrl, projectPath]);

   // ❌ BAD: String interpolation
   exec(`git clone ${repoUrl} ${projectPath}`);
   ```

2. **Always validate numeric inputs**

   ```typescript
   if (!Number.isInteger(port) || port < 1 || port > 65535) {
     throw new Error('Invalid port');
   }
   ```

3. **Use regex to validate string patterns**
   ```typescript
   if (!/^[a-zA-Z0-9_-]+$/.test(branchName)) {
     throw new Error('Invalid branch name');
   }
   ```

---

## Input Validation

### General Principles

1. **Validate Early**: Check inputs at the entry point (route handlers)
2. **Whitelist > Blacklist**: Define what IS allowed, not what isn't
3. **Type Safety**: Use TypeScript types to enforce valid inputs
4. **Sanitize Before Use**: Clean inputs before passing to dangerous operations

### Example: Route Handler Validation

```typescript
export function createHandler(service: Service) {
  return async (req: Request, res: Response) => {
    const { sessionId, message, imagePaths } = req.body;

    // 1. Check required fields
    if (!sessionId || !message) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and message are required',
      });
    }

    // 2. Validate types
    if (typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'message must be a string',
      });
    }

    // 3. Sanitize inputs
    const sanitizedMessage = sanitizeUserInput(message);

    // 4. Validate paths if provided
    if (imagePaths) {
      for (const path of imagePaths) {
        if (!isPathAllowed(path)) {
          return res.status(403).json({
            success: false,
            error: 'Image path not allowed',
          });
        }
      }
    }

    // Now safe to use
    await service.process(sessionId, sanitizedMessage, imagePaths);
  };
}
```

---

## Rate Limiting

### Configuration

Rate limits are enforced per IP address:

| Endpoint Type | Limit | Window | Status Code |
| ------------- | ----- | ------ | ----------- |
| General API   | 1000  | 15 min | 429         |
| AI Endpoints  | 50    | 15 min | 429         |

### Monitoring

```typescript
// Future: Add metrics collection
app.use('/api', (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode === 429) {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        endpoint: req.path,
      });
    }
  });
  next();
});
```

---

## File Operations Security

### Checklist for File Operations

- [ ] Use `secureFs` from `@automakeit/platform` (validates paths automatically)
- [ ] Sanitize filenames with `sanitizeFilename()`
- [ ] Validate file extensions with whitelist
- [ ] Check file sizes before reading
- [ ] Validate paths with `validatePath()` or `isPathAllowed()`

### Example: Secure File Upload

```typescript
import { sanitizeFilename, validatePath } from '@automakeit/platform';
import { secureFs } from '@automakeit/platform';

async function handleUpload(filename: string, content: Buffer, uploadDir: string) {
  // 1. Validate upload directory
  validatePath(uploadDir);

  // 2. Sanitize filename
  const safeFilename = sanitizeFilename(filename);

  // 3. Validate extension (whitelist)
  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
  const ext = path.extname(safeFilename).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new Error(`File type not allowed: ${ext}`);
  }

  // 4. Check size
  if (content.length > 10 * 1024 * 1024) {
    throw new Error('File too large (max 10MB)');
  }

  // 5. Construct safe path
  const safePath = path.join(uploadDir, safeFilename);

  // 6. Write file (secureFs validates path again)
  await secureFs.writeFile(safePath, content);

  return safePath;
}
```

---

## Environment Variables

### Required Variables

```bash
# Authentication (optional - uses Claude CLI auth if not set)
ANTHROPIC_API_KEY=sk-ant-...

# Server configuration
PORT=3008
DATA_DIR=./data

# Security (optional)
ALLOWED_ROOT_DIRECTORY=/home/user/projects
CORS_ORIGIN=http://localhost:3007

# Terminal (optional)
TERMINAL_MAX_SESSIONS=1000
```

### Sensitive Variables

⚠️ **Never commit these to git**:

- `ANTHROPIC_API_KEY`
- Any API keys or tokens
- Database credentials

✅ **Use `.env` files** (already in `.gitignore`):

```bash
cp .env.example .env
# Edit .env with your values
```

---

## Best Practices

### 1. Defense in Depth

Don't rely on a single security measure. Layer multiple protections:

```typescript
// Example: Image upload has 5 layers
async function saveImage(path, content) {
  validatePath(path);           // Layer 1: Path validation
  sanitizeFilename(filename);   // Layer 2: Filename sanitization
  checkExtension(filename);     // Layer 3: Extension whitelist
  validateSize(content);        // Layer 4: Size limit
  await secureFs.write(...);    // Layer 5: Secure write (validates again)
}
```

### 2. Fail Securely

When validation fails, fail closed (deny access):

```typescript
// ✅ GOOD: Deny by default
if (!isPathAllowed(path)) {
  throw new PathNotAllowedError(path);
}
// Continue only if validated

// ❌ BAD: Allow by default
if (isSuspiciousPath(path)) {
  throw new Error('Suspicious path');
}
// Continues even if validation is bypassed
```

### 3. Log Security Events

```typescript
logger.warn('Security: Invalid path access attempt', {
  path: attemptedPath,
  ip: req.ip,
  user: req.user?.id,
});
```

### 4. Keep Dependencies Updated

```bash
# Regular security audits
npm audit

# Fix vulnerabilities
npm audit fix

# Update dependencies
npm update
```

### 5. Review Code for Security

Before merging, check:

- [ ] All user inputs are validated
- [ ] No string concatenation in shell commands
- [ ] File paths are sanitized
- [ ] Sensitive data is not logged
- [ ] Error messages don't leak system information

---

## Reporting Security Issues

If you discover a security vulnerability:

1. **DO NOT** open a public GitHub issue
2. Email security@automakeit.dev with details
3. Include steps to reproduce
4. Wait for response before public disclosure

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
