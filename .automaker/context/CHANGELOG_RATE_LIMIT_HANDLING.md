# Improved Error Handling for Rate Limiting

## Problem

When running multiple features concurrently in auto-mode, the Claude API rate limits were being exceeded, resulting in cryptic error messages:

```
Error: Claude Code process exited with code 1
```

This error provided no actionable information to users about:

- What went wrong (rate limit exceeded)
- How long to wait before retrying
- How to prevent it in the future

## Root Cause

The Claude Agent SDK was terminating with exit code 1 when hitting rate limits (HTTP 429), but the error details were not being properly surfaced to the user. The error handling code only showed the generic exit code message instead of the actual API error.

## Solution

Implemented comprehensive rate limit error handling across the stack:

### 1. Enhanced Error Classification (libs/utils)

Added new error type and detection functions:

- **New error type**: `'rate_limit'` added to `ErrorType` union
- **`isRateLimitError()`**: Detects 429 and rate_limit errors
- **`extractRetryAfter()`**: Extracts retry duration from error messages
- **Updated `classifyError()`**: Includes rate limit classification with retry-after metadata
- **Updated `getUserFriendlyErrorMessage()`**: Provides clear, actionable messages for rate limit errors

### 2. Improved Claude Provider Error Handling (apps/server)

Enhanced `ClaudeProvider.executeQuery()` to:

- Classify all errors using the enhanced error utilities
- Detect rate limit errors specifically
- Provide user-friendly error messages with:
  - Clear explanation of the problem (rate limit exceeded)
  - Retry-after duration when available
  - Actionable tip: reduce `maxConcurrency` in auto-mode
- Preserve original error details for debugging

### 3. Comprehensive Test Coverage

Added 8 new tests covering:

- Rate limit error detection (429, rate_limit keywords)
- Retry-after extraction from various message formats
- Error classification with retry metadata
- User-friendly message generation
- Edge cases (null/undefined, non-rate-limit errors)

**Total test suite**: 162 tests passing ✅

## User-Facing Changes

### Before

```
[AutoMode] Feature touch-gesture-support failed: Error: Claude Code process exited with code 1
```

### After

```
[AutoMode] Feature touch-gesture-support failed: Rate limit exceeded (429). Please wait 60 seconds before retrying.

Tip: If you're running multiple features in auto-mode, consider reducing concurrency (maxConcurrency setting) to avoid hitting rate limits.
```

## Benefits

1. **Clear communication**: Users understand exactly what went wrong
2. **Actionable guidance**: Users know how long to wait and how to prevent future errors
3. **Better debugging**: Original error details preserved for technical investigation
4. **Type safety**: New `isRateLimit` and `retryAfter` fields properly typed in `ErrorInfo`
5. **Comprehensive testing**: All edge cases covered with automated tests

## Technical Details

### Files Modified

- `libs/types/src/error.ts` - Added `'rate_limit'` type and `retryAfter` field
- `libs/utils/src/error-handler.ts` - Added rate limit detection and extraction logic
- `libs/utils/src/index.ts` - Exported new utility functions
- `libs/utils/tests/error-handler.test.ts` - Added 8 new test cases
- `apps/server/src/providers/claude-provider.ts` - Enhanced error handling with user-friendly messages

### API Changes

**ErrorInfo interface** (backwards compatible):

```typescript
interface ErrorInfo {
  type: ErrorType; // Now includes 'rate_limit'
  message: string;
  isAbort: boolean;
  isAuth: boolean;
  isCancellation: boolean;
  isRateLimit: boolean; // NEW
  retryAfter?: number; // NEW (seconds to wait)
  originalError: unknown;
}
```

**New utility functions**:

```typescript
isRateLimitError(error: unknown): boolean
extractRetryAfter(error: unknown): number | undefined
```

## Future Improvements

This PR lays the groundwork for future enhancements:

1. **Automatic retry with exponential backoff**: Use `retryAfter` to implement smart retry logic
2. **Global rate limiter**: Track requests to prevent hitting limits proactively
3. **Concurrency auto-adjustment**: Dynamically reduce concurrency when rate limits are detected
4. **User notifications**: Show toast/banner when rate limits are approaching

## Testing

Run tests with:

```bash
npm run test -w @automaker/utils
```

All 162 tests pass, including 8 new rate limit tests.
