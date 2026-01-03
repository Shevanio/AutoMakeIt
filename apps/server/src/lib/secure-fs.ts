/**
 * Re-export secure file system utilities from @automakeit/platform
 * This file exists for backward compatibility with existing imports
 */

import { secureFs } from '@automakeit/platform';

export const {
  access,
  readFile,
  writeFile,
  mkdir,
  readdir,
  stat,
  rm,
  unlink,
  copyFile,
  appendFile,
  rename,
  lstat,
  joinPath,
  resolvePath,
  // Throttling configuration and monitoring
  configureThrottling,
  getThrottlingConfig,
  getPendingOperations,
  getActiveOperations,
} = secureFs;
