/**
 * Tests for Context Loader
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadContextFiles, getContextFilesSummary } from '../src/context-loader.js';
import type { LoadContextFilesOptions } from '../src/context-loader.js';

describe('Context Loader', () => {
  describe('loadContextFiles', () => {
    it('should return empty result when context directory does not exist', async () => {
      const mockFs = {
        access: vi.fn().mockRejectedValue(new Error('ENOENT')),
        readdir: vi.fn(),
        readFile: vi.fn(),
      };

      const result = await loadContextFiles({
        projectPath: '/fake/project',
        fsModule: mockFs,
      });

      expect(result.files).toEqual([]);
      expect(result.formattedPrompt).toBe('');
    });

    it('should load files from root context directory', async () => {
      const mockFs = {
        access: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn().mockResolvedValue(['CLAUDE.md', 'context-metadata.json']),
        readFile: vi.fn().mockImplementation((filePath: string) => {
          if (filePath.endsWith('context-metadata.json')) {
            return Promise.resolve(
              JSON.stringify({
                files: {
                  'CLAUDE.md': { description: 'Project rules' },
                },
              })
            );
          }
          if (filePath.endsWith('CLAUDE.md')) {
            return Promise.resolve('# Project Rules\n\nUse pnpm.');
          }
          return Promise.reject(new Error('File not found'));
        }),
        stat: vi.fn().mockImplementation((filePath: string) => {
          if (filePath.endsWith('CLAUDE.md')) {
            return Promise.resolve({
              isDirectory: () => false,
              isFile: () => true,
            });
          }
          if (filePath.endsWith('context-metadata.json')) {
            return Promise.resolve({
              isDirectory: () => false,
              isFile: () => true,
            });
          }
          return Promise.reject(new Error('Not found'));
        }),
      };

      const result = await loadContextFiles({
        projectPath: '/fake/project',
        fsModule: mockFs,
      });

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toMatchObject({
        name: 'CLAUDE.md',
        relativePath: 'CLAUDE.md',
        content: '# Project Rules\n\nUse pnpm.',
        description: 'Project rules',
      });
      expect(result.formattedPrompt).toContain('Project Context Files');
      expect(result.formattedPrompt).toContain('CLAUDE.md');
    });

    it('should recursively load files from subdirectories', async () => {
      const fileStructure = new Map([
        ['/fake/project/.automakeit/context', ['docs', 'CLAUDE.md', 'context-metadata.json']],
        ['/fake/project/.automakeit/context/docs', ['api', 'README.md']],
        ['/fake/project/.automakeit/context/docs/api', ['auth.md']],
      ]);

      const fileContents = new Map([
        ['CLAUDE.md', '# Claude Rules'],
        ['docs/README.md', '# Docs'],
        ['docs/api/auth.md', '# Auth API'],
      ]);

      const mockFs = {
        access: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn().mockImplementation((dirPath: string) => {
          const entries = fileStructure.get(dirPath) || [];
          return Promise.resolve(entries);
        }),
        readFile: vi.fn().mockImplementation((filePath: string) => {
          if (filePath.endsWith('context-metadata.json')) {
            return Promise.resolve(
              JSON.stringify({
                files: {
                  'CLAUDE.md': { description: 'Project rules' },
                  'docs/README.md': { description: 'Documentation index' },
                  'docs/api/auth.md': { description: 'Authentication API docs' },
                },
              })
            );
          }

          // Find matching file content
          for (const [relPath, content] of fileContents.entries()) {
            if (filePath.endsWith(relPath.replace(/\//g, require('path').sep))) {
              return Promise.resolve(content);
            }
          }

          return Promise.reject(new Error(`File not found: ${filePath}`));
        }),
        stat: vi.fn().mockImplementation((filePath: string) => {
          // Check if it's a directory
          if (fileStructure.has(filePath)) {
            return Promise.resolve({
              isDirectory: () => true,
              isFile: () => false,
            });
          }

          // Check if it's a file
          const fileName = filePath.split(/[/\\]/).pop() || '';
          if (fileName.endsWith('.md') || fileName === 'context-metadata.json') {
            return Promise.resolve({
              isDirectory: () => false,
              isFile: () => true,
            });
          }

          return Promise.reject(new Error('Not found'));
        }),
      };

      const result = await loadContextFiles({
        projectPath: '/fake/project',
        fsModule: mockFs,
      });

      expect(result.files).toHaveLength(3);

      // Check all files are loaded
      const relativePaths = result.files.map((f) => f.relativePath).sort();
      expect(relativePaths).toEqual(['CLAUDE.md', 'docs/README.md', 'docs/api/auth.md'].sort());

      // Check nested file has correct metadata
      const authFile = result.files.find((f) => f.relativePath.includes('auth.md'));
      expect(authFile).toBeDefined();
      expect(authFile?.description).toBe('Authentication API docs');
      expect(authFile?.content).toBe('# Auth API');
    });

    it('should handle image files correctly', async () => {
      const mockFs = {
        access: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn().mockResolvedValue(['diagram.png', 'context-metadata.json']),
        readFile: vi.fn().mockImplementation((filePath: string) => {
          if (filePath.endsWith('context-metadata.json')) {
            return Promise.resolve(
              JSON.stringify({
                files: {
                  'diagram.png': { description: 'Architecture diagram' },
                },
              })
            );
          }
          if (filePath.endsWith('diagram.png')) {
            return Promise.resolve('data:image/png;base64,fake-base64-content');
          }
          return Promise.reject(new Error('File not found'));
        }),
        stat: vi.fn().mockImplementation((filePath: string) => {
          if (filePath.endsWith('diagram.png') || filePath.endsWith('context-metadata.json')) {
            return Promise.resolve({
              isDirectory: () => false,
              isFile: () => true,
            });
          }
          return Promise.reject(new Error('Not found'));
        }),
      };

      const result = await loadContextFiles({
        projectPath: '/fake/project',
        fsModule: mockFs,
      });

      expect(result.files).toHaveLength(1);
      expect(result.files[0].name).toBe('diagram.png');
      expect(result.formattedPrompt).toContain('[Image file: diagram.png]');
    });

    it('should load files with sync metadata', async () => {
      const mockFs = {
        access: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn().mockResolvedValue(['synced.md', 'context-metadata.json']),
        readFile: vi.fn().mockImplementation((filePath: string) => {
          if (filePath.endsWith('context-metadata.json')) {
            return Promise.resolve(
              JSON.stringify({
                files: {
                  'synced.md': {
                    description: 'Synced file',
                    sourcePath: '/project/docs/synced.md',
                    lastSyncedAt: '2026-01-03T10:00:00.000Z',
                  },
                },
              })
            );
          }
          if (filePath.endsWith('synced.md')) {
            return Promise.resolve('# Synced Content');
          }
          return Promise.reject(new Error('File not found'));
        }),
        stat: vi.fn().mockImplementation((filePath: string) => {
          if (filePath.endsWith('synced.md') || filePath.endsWith('context-metadata.json')) {
            return Promise.resolve({
              isDirectory: () => false,
              isFile: () => true,
            });
          }
          return Promise.reject(new Error('Not found'));
        }),
      };

      const result = await loadContextFiles({
        projectPath: '/fake/project',
        fsModule: mockFs,
      });

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toMatchObject({
        name: 'synced.md',
        sourcePath: '/project/docs/synced.md',
        lastSyncedAt: '2026-01-03T10:00:00.000Z',
        description: 'Synced file',
      });
    });

    it('should skip context-metadata.json file', async () => {
      const mockFs = {
        access: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn().mockResolvedValue(['context-metadata.json']),
        readFile: vi.fn().mockImplementation((filePath: string) => {
          if (filePath.endsWith('context-metadata.json')) {
            return Promise.resolve(JSON.stringify({ files: {} }));
          }
          return Promise.reject(new Error('File not found'));
        }),
        stat: vi.fn().mockImplementation((filePath: string) => {
          if (filePath.endsWith('context-metadata.json')) {
            return Promise.resolve({
              isDirectory: () => false,
              isFile: () => true,
            });
          }
          return Promise.reject(new Error('Not found'));
        }),
      };

      const result = await loadContextFiles({
        projectPath: '/fake/project',
        fsModule: mockFs,
      });

      expect(result.files).toHaveLength(0);
    });
  });

  describe('getContextFilesSummary', () => {
    it('should return summary without loading file contents', async () => {
      const mockFs = {
        access: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn().mockResolvedValue(['CLAUDE.md', 'context-metadata.json']),
        readFile: vi.fn().mockImplementation((filePath: string) => {
          if (filePath.endsWith('context-metadata.json')) {
            return Promise.resolve(
              JSON.stringify({
                files: {
                  'CLAUDE.md': {
                    description: 'Project rules',
                    sourcePath: '/project/CLAUDE.md',
                  },
                },
              })
            );
          }
          // Should NOT be called for actual files
          return Promise.reject(new Error('Should not read file contents'));
        }),
        stat: vi.fn().mockImplementation((filePath: string) => {
          if (filePath.endsWith('CLAUDE.md') || filePath.endsWith('context-metadata.json')) {
            return Promise.resolve({
              isDirectory: () => false,
              isFile: () => true,
            });
          }
          return Promise.reject(new Error('Not found'));
        }),
      };

      const result = await getContextFilesSummary({
        projectPath: '/fake/project',
        fsModule: mockFs,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'CLAUDE.md',
        relativePath: 'CLAUDE.md',
        description: 'Project rules',
        sourcePath: '/project/CLAUDE.md',
      });

      // Verify readFile was only called for metadata
      expect(mockFs.readFile).toHaveBeenCalledTimes(1);
    });
  });
});
