# Migration Guide: v2.0 → v2.1 (AutoMaker → AutoMakeIt)

## Overview

AutoMakeIt v2.1.0 introduces unified branding and naming conventions to eliminate confusion between "AutoMaker" and "AutoMakeIt". This guide helps you migrate existing projects and configurations.

## What Changed

### 1. Directory Structure

- **Old**: `.automaker/`
- **New**: `.automakeit/`

### 2. Environment Variables

All environment variables have been renamed for consistency:

| Old (Deprecated)              | New (Recommended)              | Description               |
| ----------------------------- | ------------------------------ | ------------------------- |
| `AUTOMAKER_API_KEY`           | `AUTOMAKEIT_API_KEY`           | API authentication key    |
| `AUTOMAKER_HIDE_API_KEY`      | `AUTOMAKEIT_HIDE_API_KEY`      | Hide API key banner       |
| `AUTOMAKER_MOCK_AGENT`        | `AUTOMAKEIT_MOCK_AGENT`        | Enable mock agent mode    |
| `AUTOMAKER_MODEL_SPEC`        | `AUTOMAKEIT_MODEL_SPEC`        | Model for spec generation |
| `AUTOMAKER_MODEL_FEATURES`    | `AUTOMAKEIT_MODEL_FEATURES`    | Model for features        |
| `AUTOMAKER_MODEL_SUGGESTIONS` | `AUTOMAKEIT_MODEL_SUGGESTIONS` | Model for suggestions     |
| `AUTOMAKER_MODEL_CHAT`        | `AUTOMAKEIT_MODEL_CHAT`        | Model for chat            |
| `AUTOMAKER_MODEL_AUTO`        | `AUTOMAKEIT_MODEL_AUTO`        | Model for auto mode       |
| `AUTOMAKER_MODEL_DEFAULT`     | `AUTOMAKEIT_MODEL_DEFAULT`     | Default fallback model    |

### 3. Package Metadata

- Repository URLs updated to `https://github.com/Shevanio/AutoMakeIt`
- Author field changed from "AutoMaker Team" to "Shevanio"

---

## Migration Steps

### Option 1: Automatic Migration (Recommended)

Use the provided migration script to automatically migrate your projects:

```bash
# Migrate current directory
npm run migrate

# Migrate specific project
npm run migrate /path/to/your/project
```

**What the script does:**

1. ✅ Creates a timestamped backup of `.automaker/` directory
2. ✅ Copies all contents to new `.automakeit/` directory
3. ✅ Verifies file counts match
4. ℹ️ Leaves original `.automaker/` intact (delete manually after verification)

**Example output:**

```
======================================================================
📦 Migrating project: /home/user/my-project
======================================================================

ℹ️  Creating backup: .automaker.backup-2026-01-04T12-30-00
✅ Backup created at: /home/user/my-project/.automaker.backup-2026-01-04T12-30-00
ℹ️  Copying .automaker → .automakeit
✅ Directory copied successfully
✅ All 47 files migrated successfully

ℹ️  Migration complete! The .automaker directory is still present.
ℹ️  You can safely delete it after verifying everything works:
  rm -rf "/home/user/my-project/.automaker"

✅ Migration successful! ✨
```

### Option 2: Manual Migration

If you prefer manual migration:

```bash
# 1. Create backup
cp -r .automaker .automaker.backup

# 2. Rename directory
mv .automaker .automakeit

# 3. Verify contents
ls -la .automakeit/
```

---

## Environment Variable Migration

### For Development (.env files)

Update your `.env` files:

```bash
# Old (still works but deprecated)
AUTOMAKER_API_KEY=your-key-here
AUTOMAKER_MOCK_AGENT=true

# New (recommended)
AUTOMAKEIT_API_KEY=your-key-here
AUTOMAKEIT_MOCK_AGENT=true
```

### For CI/CD (GitHub Actions, etc.)

Update your workflow files:

```yaml
# .github/workflows/test.yml
env:
  # Old
  AUTOMAKER_MOCK_AGENT: 'true'
  AUTOMAKER_API_KEY: ${{ secrets.AUTOMAKER_API_KEY }}

  # New
  AUTOMAKEIT_MOCK_AGENT: 'true'
  AUTOMAKEIT_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### For Docker Deployments

Update `docker-compose.yml` or docker run commands:

```yaml
# docker-compose.yml
services:
  automakeit:
    environment:
      # Old (still works)
      - AUTOMAKER_API_KEY=${AUTOMAKER_API_KEY}

      # New (recommended)
      - AUTOMAKEIT_API_KEY=${AUTOMAKEIT_API_KEY}
```

---

## Backward Compatibility

**Good news**: All old environment variables still work! The application includes automatic fallback logic:

```typescript
// The app checks AUTOMAKEIT_* first, then falls back to AUTOMAKER_*
const apiKey = process.env.AUTOMAKEIT_API_KEY || process.env.AUTOMAKER_API_KEY;
```

**Deprecation warnings**: If you use old variables, you'll see console warnings:

```
[DEPRECATED] AUTOMAKER_API_KEY is deprecated. Use AUTOMAKEIT_API_KEY instead.
```

---

## Timeline

| Version    | Status        | Notes                                                 |
| ---------- | ------------- | ----------------------------------------------------- |
| **v2.0.x** | ✅ Old naming | Uses `.automaker/` and `AUTOMAKER_*` variables        |
| **v2.1.x** | 🟡 Transition | Supports both old and new (with deprecation warnings) |
| **v2.2.x** | 🟡 Transition | Continued support, stronger warnings                  |
| **v3.0.0** | ❌ Breaking   | **Removes all legacy support** - migration required   |

**Action required before v3.0.0**: Migrate all projects and update environment variables.

---

## Verification Checklist

After migration, verify everything works:

- [ ] Application starts without errors
- [ ] `.automakeit/` directory contains expected files (features, context, etc.)
- [ ] Features load correctly in the board view
- [ ] Agent sessions work properly
- [ ] No deprecation warnings in console (after updating env vars)
- [ ] Tests pass (`npm run test`)

---

## Troubleshooting

### Problem: Migration script fails with "destination-exists"

**Solution**: You already have a `.automakeit/` directory. Check if it's from a previous migration:

```bash
# Compare directories
ls -la .automaker/
ls -la .automakeit/

# If .automakeit looks correct, delete .automaker
rm -rf .automaker

# If unsure, backup both
mv .automaker .automaker.old
mv .automakeit .automakeit.old
# Then run migration again
```

### Problem: "No .automaker directory found"

**Solution**: Your project may already be using the new structure or never had AutoMakeIt data. Check:

```bash
# Does .automakeit exist?
ls -la .automakeit/

# If yes, you're already migrated!
# If no, initialize a new project through the UI
```

### Problem: Deprecation warnings after migration

**Solution**: Update your environment variables from `AUTOMAKER_*` to `AUTOMAKEIT_*`:

```bash
# Check your .env file
grep "AUTOMAKER" .env

# Update any found variables
sed -i 's/AUTOMAKER_/AUTOMAKEIT_/g' .env
```

### Problem: Docker container won't start

**Solution**: Update docker-compose.yml or docker run command with new variable names.

---

## Rollback Instructions

If you need to rollback to the old naming:

```bash
# 1. Stop the application
npm run dev:stop  # or kill the process

# 2. Restore from backup
rm -rf .automakeit
mv .automaker.backup-* .automaker

# 3. Downgrade to v2.0.x
npm install automakeit@2.0.0

# 4. Restart
npm run dev
```

---

## Need Help?

- 📖 **Documentation**: [README.md](./README.md)
- 🐛 **Report Issues**: [GitHub Issues](https://github.com/Shevanio/AutoMakeIt/issues)
- 💬 **Community Support**: Open a discussion on GitHub

---

## Summary

✅ **What you need to do**:

1. Run `npm run migrate` on each project
2. Update `.env` files: `AUTOMAKER_*` → `AUTOMAKEIT_*`
3. Update CI/CD configs if applicable
4. Verify everything works
5. Delete `.automaker/` backups after verification

⏱️ **Estimated time**: 5-10 minutes per project

🎯 **Deadline**: Before upgrading to v3.0.0 (planned for ~3 months from v2.1.0 release)

---

_Last updated: January 2026_
