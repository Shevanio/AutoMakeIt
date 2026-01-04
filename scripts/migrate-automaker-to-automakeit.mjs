#!/usr/bin/env node

/**
 * Migration Script: AutoMaker → AutoMakeIt
 *
 * This script migrates project data from the legacy .automaker directory
 * to the new .automakeit directory structure.
 *
 * Usage:
 *   node scripts/migrate-automaker-to-automakeit.mjs [project-path]
 *
 * If no project path is provided, migrates the current directory.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

/**
 * Check if a directory exists and is a valid .automaker directory
 */
function isValidAutoMakerDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return false;
  }

  const stats = fs.statSync(dirPath);
  if (!stats.isDirectory()) {
    return false;
  }

  // Check for expected subdirectories or files
  const expectedPaths = ['features', 'context', 'worktrees', 'settings.json', 'app_spec.txt'];
  const hasExpectedContent = expectedPaths.some((p) => fs.existsSync(path.join(dirPath, p)));

  return hasExpectedContent;
}

/**
 * Recursively copy directory contents
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Create a backup of the .automaker directory
 */
function createBackup(automakerPath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = `${automakerPath}.backup-${timestamp}`;

  logInfo(`Creating backup: ${path.basename(backupPath)}`);
  copyDir(automakerPath, backupPath);
  logSuccess(`Backup created at: ${backupPath}`);

  return backupPath;
}

/**
 * Migrate a single project from .automaker to .automakeit
 */
function migrateProject(projectPath) {
  const automakerPath = path.join(projectPath, '.automaker');
  const automakeitPath = path.join(projectPath, '.automakeit');

  log('\n' + '='.repeat(70), 'bright');
  log(`📦 Migrating project: ${projectPath}`, 'bright');
  log('='.repeat(70) + '\n', 'bright');

  // Check if .automaker exists
  if (!fs.existsSync(automakerPath)) {
    logWarning(`No .automaker directory found in ${projectPath}`);
    logInfo('This project may already be migrated or never used AutoMaker.');
    return { success: false, reason: 'no-source' };
  }

  // Validate .automaker directory
  if (!isValidAutoMakerDir(automakerPath)) {
    logWarning(`.automaker directory exists but appears empty or invalid`);
    logInfo('Skipping migration. Manual inspection recommended.');
    return { success: false, reason: 'invalid-source' };
  }

  // Check if .automakeit already exists
  if (fs.existsSync(automakeitPath)) {
    logError(`.automakeit directory already exists!`);
    logInfo('Migration cannot proceed. Please resolve manually:');
    logInfo('  1. Backup .automakeit if needed');
    logInfo('  2. Delete or rename .automakeit');
    logInfo('  3. Run migration again');
    return { success: false, reason: 'destination-exists' };
  }

  // Create backup
  const backupPath = createBackup(automakerPath);

  // Perform migration
  try {
    logInfo('Copying .automaker → .automakeit');
    copyDir(automakerPath, automakeitPath);
    logSuccess('Directory copied successfully');

    // Verify migration
    const sourceFiles = countFiles(automakerPath);
    const destFiles = countFiles(automakeitPath);

    if (sourceFiles !== destFiles) {
      logWarning(`File count mismatch: ${sourceFiles} → ${destFiles}`);
      logInfo('Some files may not have been copied. Check backup.');
    } else {
      logSuccess(`All ${sourceFiles} files migrated successfully`);
    }

    // Offer to delete original
    log('\n');
    logInfo('Migration complete! The .automaker directory is still present.');
    logInfo('You can safely delete it after verifying everything works:');
    log(`  rm -rf "${automakerPath}"`, 'cyan');
    log('\n');
    logSuccess(`Migration successful! ✨`);

    return { success: true, backupPath, fileCount: destFiles };
  } catch (error) {
    logError(`Migration failed: ${error.message}`);
    logInfo(`Backup preserved at: ${backupPath}`);
    return { success: false, reason: 'copy-error', error };
  }
}

/**
 * Count files recursively in a directory
 */
function countFiles(dirPath) {
  let count = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dirPath, entry.name));
    } else {
      count++;
    }
  }

  return count;
}

/**
 * Print usage help
 */
function printHelp() {
  log('\n📖 AutoMaker → AutoMakeIt Migration Script\n', 'bright');
  log('Usage:');
  log('  node scripts/migrate-automaker-to-automakeit.mjs [project-path]\n');
  log('Arguments:');
  log('  project-path    Path to project directory (default: current directory)\n');
  log('Examples:');
  log('  node scripts/migrate-automaker-to-automakeit.mjs');
  log('  node scripts/migrate-automaker-to-automakeit.mjs /path/to/my-project\n');
  log('What this script does:');
  log('  1. ✅ Creates a timestamped backup of .automaker');
  log('  2. ✅ Copies all contents to new .automakeit directory');
  log('  3. ✅ Verifies file counts match');
  log('  4. ℹ️  Leaves original .automaker intact (you delete manually)\n');
}

/**
 * Main migration logic
 */
function main() {
  const args = process.argv.slice(2);

  // Handle --help flag
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  // Get project path from args or use current directory
  const projectPath = args[0] ? path.resolve(args[0]) : process.cwd();

  if (!fs.existsSync(projectPath)) {
    logError(`Project path does not exist: ${projectPath}`);
    process.exit(1);
  }

  const stats = fs.statSync(projectPath);
  if (!stats.isDirectory()) {
    logError(`Project path is not a directory: ${projectPath}`);
    process.exit(1);
  }

  // Run migration
  const result = migrateProject(projectPath);

  // Exit with appropriate code
  process.exit(result.success ? 0 : 1);
}

// Run the script
main();
