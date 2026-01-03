# @automakeit/utils

Shared utility functions for AutoMaker.

## Overview

This package provides common utility functions used across AutoMaker's server and UI. It includes error handling, logging, conversation utilities, image handling, and prompt building.

## Installation

```bash
npm install @automakeit/utils
```

## Exports

### Logger

Structured logging with context.

```typescript
import { createLogger, LogLevel } from '@automakeit/utils';

const logger = createLogger('MyComponent');
logger.info('Processing request');
logger.error('Failed to process:', error);
logger.debug('Debug information', { data });
```

### Error Handler

Error classification and user-friendly messages.

```typescript
import {
  isAbortError,
  isCancellationError,
  isAuthenticationError,
  classifyError,
  getUserFriendlyErrorMessage,
} from '@automakeit/utils';

try {
  await operation();
} catch (error) {
  if (isAbortError(error)) {
    console.log('Operation was aborted');
  }

  const errorInfo = classifyError(error);
  const message = getUserFriendlyErrorMessage(error);
}
```

### Conversation Utils

Message formatting and conversion.

```typescript
import {
  extractTextFromContent,
  normalizeContentBlocks,
  formatHistoryAsText,
  convertHistoryToMessages,
} from '@automakeit/utils';

const text = extractTextFromContent(contentBlocks);
const normalized = normalizeContentBlocks(content);
const formatted = formatHistoryAsText(messages);
const converted = convertHistoryToMessages(history);
```

### Image Handler

Image processing for Claude prompts.

```typescript
import {
  getMimeTypeForImage,
  readImageAsBase64,
  convertImagesToContentBlocks,
  formatImagePathsForPrompt,
} from '@automakeit/utils';

const mimeType = getMimeTypeForImage('screenshot.png');
const base64 = await readImageAsBase64('/path/to/image.jpg');
const blocks = await convertImagesToContentBlocks(imagePaths, basePath);
const formatted = formatImagePathsForPrompt(imagePaths);
```

### Prompt Builder

Build prompts with images for Claude.

```typescript
import { buildPromptWithImages } from '@automakeit/utils';

const result = await buildPromptWithImages({
  basePrompt: 'Analyze this screenshot',
  imagePaths: ['/path/to/screenshot.png'],
  basePath: '/project/path',
});

console.log(result.prompt); // Prompt with image references
console.log(result.images); // Image data for Claude
```

### File System Utils

Common file system operations.

```typescript
import { ensureDir, fileExists, readJsonFile, writeJsonFile } from '@automakeit/utils';

await ensureDir('/path/to/dir');
const exists = await fileExists('/path/to/file');
const data = await readJsonFile('/config.json');
await writeJsonFile('/config.json', data);
```

## Usage Example

```typescript
import { createLogger, classifyError, buildPromptWithImages } from '@automakeit/utils';

const logger = createLogger('FeatureExecutor');

async function executeWithImages(prompt: string, images: string[]) {
  try {
    logger.info('Building prompt with images');

    const result = await buildPromptWithImages({
      basePrompt: prompt,
      imagePaths: images,
      basePath: process.cwd(),
    });

    logger.debug('Prompt built successfully', { imageCount: result.images.length });
    return result;
  } catch (error) {
    const errorInfo = classifyError(error);
    logger.error('Failed to build prompt:', errorInfo.message);
    throw error;
  }
}
```

## Dependencies

- `@automakeit/types` - Type definitions

## Used By

- `@automakeit/server`
- `@automakeit/ui`
