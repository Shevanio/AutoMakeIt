import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Card } from '@/components/ui/card';
import {
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Trash2,
  Save,
  Upload,
  File,
  BookOpen,
  Eye,
  Pencil,
  FilePlus,
  FileUp,
  Loader2,
  MoreVertical,
  Link2,
  AlertCircle,
  Info,
} from 'lucide-react';
import {
  useKeyboardShortcuts,
  useKeyboardShortcutsConfig,
  KeyboardShortcut,
} from '@/hooks/use-keyboard-shortcuts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { FilePickerDialog } from '@/components/dialogs/file-picker-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { sanitizeFilename } from '@/lib/image-utils';
import { Markdown } from '../ui/markdown';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { FileTree, buildFileTree, type FileTreeNode } from '@/components/ui/file-tree';

interface ContextFile {
  name: string;
  type: 'text' | 'image';
  content?: string;
  path: string;
  /** Relative path from context directory (e.g., 'docs/api/auth.md') */
  relativePath: string;
  description?: string;
  /** Original source path if imported/synced from elsewhere */
  sourcePath?: string;
  /** Timestamp of last sync (ISO 8601) */
  lastSyncedAt?: string;
}

interface ContextFileMetadata {
  description: string;
  sourcePath?: string;
  lastSyncedAt?: string;
}

interface ContextMetadata {
  files: Record<string, ContextFileMetadata>;
}

export function ContextView() {
  const { currentProject } = useAppStore();
  const shortcuts = useKeyboardShortcutsConfig();
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ContextFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameFileName, setRenameFileName] = useState('');
  const [isDropHovering, setIsDropHovering] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncChanges, setSyncChanges] = useState<{
    updated: string[];
    deleted: string[];
    unchanged: number;
  } | null>(null);
  const [isSyncPreviewOpen, setIsSyncPreviewOpen] = useState(false);
  const [syncPreviewData, setSyncPreviewData] = useState<{
    toUpdate: Array<{ relativePath: string; reason: string }>;
    toDelete: Array<{ relativePath: string; reason: string }>;
    conflicts: Array<{ relativePath: string; reason: string }>;
    unchanged: number;
    notSynced: number; // Files created manually (no sourcePath)
  } | null>(null);
  const [conflictResolutions, setConflictResolutions] = useState<
    Map<string, 'keep-local' | 'use-source' | 'skip'>
  >(new Map());

  // Create Markdown modal state
  const [isCreateMarkdownOpen, setIsCreateMarkdownOpen] = useState(false);
  const [newMarkdownName, setNewMarkdownName] = useState('');
  const [newMarkdownDescription, setNewMarkdownDescription] = useState('');
  const [newMarkdownContent, setNewMarkdownContent] = useState('');

  // Track files with generating descriptions (async)
  const [generatingDescriptions, setGeneratingDescriptions] = useState<Set<string>>(new Set());

  // Build tree structure from flat file list
  const fileTree = useMemo(() => buildFileTree(contextFiles), [contextFiles]);

  // Edit description modal state
  const [isEditDescriptionOpen, setIsEditDescriptionOpen] = useState(false);
  const [editDescriptionValue, setEditDescriptionValue] = useState('');
  const [editDescriptionFileName, setEditDescriptionFileName] = useState('');

  // Link to source modal state
  const [isLinkToSourceOpen, setIsLinkToSourceOpen] = useState(false);
  const [fileToLink, setFileToLink] = useState<ContextFile | null>(null);

  // Bulk link state
  const [isBulkLinkOpen, setIsBulkLinkOpen] = useState(false);

  // File picker modal state (server-side file browser)
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);

  // Get images directory path
  const getImagesPath = useCallback(() => {
    if (!currentProject) return null;
    return `${currentProject.path}/.automaker/images`;
  }, [currentProject]);

  // Keyboard shortcuts for this view
  const contextShortcuts: KeyboardShortcut[] = useMemo(
    () => [
      {
        key: shortcuts.addContextFile,
        action: () => setIsCreateMarkdownOpen(true),
        description: 'Create new markdown file',
      },
    ],
    [shortcuts]
  );
  useKeyboardShortcuts(contextShortcuts);

  // Get context directory path for user-added context files
  const getContextPath = useCallback(() => {
    if (!currentProject) return null;
    return `${currentProject.path}/.automaker/context`;
  }, [currentProject]);

  const isMarkdownFile = (filename: string): boolean => {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return ext === '.md' || ext === '.markdown';
  };

  // Determine if a file is an image based on extension
  const isImageFile = (filename: string): boolean => {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return imageExtensions.includes(ext);
  };

  // Load context metadata
  const loadMetadata = useCallback(async (): Promise<ContextMetadata> => {
    const contextPath = getContextPath();
    if (!contextPath) return { files: {} };

    try {
      const api = getElectronAPI();
      const metadataPath = `${contextPath}/context-metadata.json`;
      const result = await api.readFile(metadataPath);
      if (result.success && result.content) {
        return JSON.parse(result.content);
      }
    } catch {
      // Metadata file doesn't exist yet
    }
    return { files: {} };
  }, [getContextPath]);

  // Save context metadata
  const saveMetadata = useCallback(
    async (metadata: ContextMetadata) => {
      const contextPath = getContextPath();
      if (!contextPath) return;

      try {
        const api = getElectronAPI();
        const metadataPath = `${contextPath}/context-metadata.json`;
        await api.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      } catch (error) {
        console.error('Failed to save metadata:', error);
      }
    },
    [getContextPath]
  );

  // Recursively scan context directory for files
  const scanContextDirectory = async (
    dirPath: string,
    basePath: string,
    api: ReturnType<typeof getElectronAPI>,
    metadata: ContextMetadata
  ): Promise<ContextFile[]> => {
    const files: ContextFile[] = [];

    try {
      const result = await api.readdir(dirPath);
      if (!result.success || !result.entries) {
        return files;
      }

      for (const entry of result.entries) {
        // Skip metadata file
        if (entry.name === 'context-metadata.json') {
          continue;
        }

        const fullPath = `${dirPath}/${entry.name}`;
        const relativePath = fullPath.replace(`${basePath}/`, '');

        if (entry.isDirectory) {
          // Recursively scan subdirectory
          const subFiles = await scanContextDirectory(fullPath, basePath, api, metadata);
          files.push(...subFiles);
        } else if (entry.isFile) {
          const fileMetadata = metadata.files[relativePath];
          files.push({
            name: entry.name,
            type: isImageFile(entry.name) ? 'image' : 'text',
            path: fullPath,
            relativePath,
            description: fileMetadata?.description,
            sourcePath: fileMetadata?.sourcePath,
            lastSyncedAt: fileMetadata?.lastSyncedAt,
          });
        }
      }
    } catch (error) {
      console.error(`Failed to scan directory ${dirPath}:`, error);
    }

    return files;
  };

  // Load context files
  const loadContextFiles = useCallback(async () => {
    const contextPath = getContextPath();
    if (!contextPath) return;

    setIsLoading(true);
    try {
      const api = getElectronAPI();

      // Ensure context directory exists
      await api.mkdir(contextPath);

      // Ensure metadata file exists (create empty one if not)
      const metadataPath = `${contextPath}/context-metadata.json`;
      const metadataExists = await api.exists(metadataPath);
      if (!metadataExists) {
        await api.writeFile(metadataPath, JSON.stringify({ files: {} }, null, 2));
      }

      // Load metadata for descriptions
      const metadata = await loadMetadata();

      // Recursively scan for all context files
      const files = await scanContextDirectory(contextPath, contextPath, api, metadata);
      setContextFiles(files);
    } catch (error) {
      console.error('Failed to load context files:', error);
    } finally {
      setIsLoading(false);
    }
  }, [getContextPath, loadMetadata]);

  useEffect(() => {
    loadContextFiles();
  }, [loadContextFiles]);

  // Load selected file content
  const loadFileContent = useCallback(async (file: ContextFile) => {
    try {
      const api = getElectronAPI();
      const result = await api.readFile(file.path);
      if (result.success && result.content !== undefined) {
        setEditedContent(result.content);
        setSelectedFile({
          ...file,
          content: result.content,
        });
        setHasChanges(false);
      }
    } catch (error) {
      console.error('Failed to load file content:', error);
    }
  }, []);

  // Select a file
  const handleSelectFile = (file: ContextFile) => {
    if (hasChanges) {
      // Could add a confirmation dialog here
    }
    loadFileContent(file);
    setIsPreviewMode(isMarkdownFile(file.name));
  };

  // Save current file
  const saveFile = async () => {
    if (!selectedFile) return;

    setIsSaving(true);
    try {
      const api = getElectronAPI();
      await api.writeFile(selectedFile.path, editedContent);
      setSelectedFile({ ...selectedFile, content: editedContent });
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save file:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle content change
  const handleContentChange = (value: string) => {
    setEditedContent(value);
    setHasChanges(true);
  };

  // Generate description for a file
  const generateDescription = async (
    filePath: string,
    fileName: string,
    isImage: boolean
  ): Promise<string | undefined> => {
    try {
      const httpClient = getHttpApiClient();
      const result = isImage
        ? await httpClient.context.describeImage(filePath)
        : await httpClient.context.describeFile(filePath);

      if (result.success && result.description) {
        return result.description;
      }

      const message =
        result.error || `Automaker couldn't generate a description for “${fileName}”.`;
      toast.error('Failed to generate description', { description: message });
    } catch (error) {
      console.error('Failed to generate description:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while generating the description.';
      toast.error('Failed to generate description', { description: message });
    }
    return undefined;
  };

  // Generate description in background and update metadata
  const generateDescriptionAsync = useCallback(
    async (filePath: string, fileName: string, relativePath: string, isImage: boolean) => {
      // Add to generating set
      setGeneratingDescriptions((prev) => new Set(prev).add(fileName));

      try {
        const description = await generateDescription(filePath, fileName, isImage);

        if (description) {
          const metadata = await loadMetadata();
          const existingMetadata = metadata.files[relativePath] || {};
          metadata.files[relativePath] = {
            ...existingMetadata,
            description,
          };
          await saveMetadata(metadata);

          // Reload files to update UI with new description
          await loadContextFiles();

          // Also update selectedFile if it's the one that just got described
          setSelectedFile((current) => {
            if (current?.name === fileName) {
              return { ...current, description };
            }
            return current;
          });
        }
      } catch (error) {
        console.error('Failed to generate description:', error);
      } finally {
        // Remove from generating set
        setGeneratingDescriptions((prev) => {
          const next = new Set(prev);
          next.delete(fileName);
          return next;
        });
      }
    },
    [loadMetadata, saveMetadata, loadContextFiles]
  );

  // Upload a file and generate description asynchronously
  const uploadFile = async (file: globalThis.File) => {
    const contextPath = getContextPath();
    if (!contextPath) return;

    setIsUploading(true);
    setUploadingFileName(file.name);

    try {
      const api = getElectronAPI();
      const isImage = isImageFile(file.name);

      let filePath: string;
      let fileName: string;
      let imagePathForDescription: string | undefined;

      if (isImage) {
        // For images: sanitize filename, store in .automaker/images
        fileName = sanitizeFilename(file.name);

        // Read file as base64
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.readAsDataURL(file);
        });

        // Extract base64 data without the data URL prefix
        const base64Data = dataUrl.split(',')[1] || dataUrl;

        // Determine mime type from original file
        const mimeType = file.type || 'image/png';

        // Use saveImageToTemp to properly save as binary file in .automaker/images
        const saveResult = await api.saveImageToTemp?.(
          base64Data,
          fileName,
          mimeType,
          currentProject!.path
        );

        if (!saveResult?.success || !saveResult.path) {
          throw new Error(saveResult?.error || 'Failed to save image');
        }

        // The saved image path is used for description
        imagePathForDescription = saveResult.path;

        // Also save to context directory for display in the UI
        // (as a data URL for inline display)
        filePath = `${contextPath}/${fileName}`;
        await api.writeFile(filePath, dataUrl);
      } else {
        // For non-images: keep original behavior
        fileName = file.name;
        filePath = `${contextPath}/${fileName}`;

        const content = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.readAsText(file);
        });

        await api.writeFile(filePath, content);
      }

      // Reload files immediately (file appears in list without description)
      await loadContextFiles();

      // Start description generation in background (don't await)
      // For images, use the path in the images directory
      // relativePath for root-level files is just the filename
      generateDescriptionAsync(imagePathForDescription || filePath, fileName, fileName, isImage);
    } catch (error) {
      console.error('Failed to upload file:', error);
      toast.error('Failed to upload file', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsUploading(false);
      setUploadingFileName(null);
    }
  };

  // Handle file drop
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropHovering(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Process files sequentially
    for (const file of files) {
      await uploadFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropHovering(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropHovering(false);
  };

  // Handle file import via button (opens server-side file picker)
  const handleImportClick = () => {
    setIsFilePickerOpen(true);
  };

  // Recursively get all files from a directory
  const getAllFilesFromDirectory = async (
    dirPath: string,
    api: ReturnType<typeof getElectronAPI>
  ): Promise<string[]> => {
    const files: string[] = [];

    try {
      const result = await api.readdir(dirPath);
      if (!result.success || !result.entries) return files;

      for (const entry of result.entries) {
        const fullPath = `${dirPath}/${entry.name}`;

        if (entry.isDirectory) {
          // Recursively get files from subdirectory
          const subFiles = await getAllFilesFromDirectory(fullPath, api);
          files.push(...subFiles);
        } else if (entry.isFile) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Failed to read directory ${dirPath}:`, error);
    }

    return files;
  };

  // Handle file selection from server
  const handleFilePickerSelect = async (filePaths: string[]) => {
    if (!currentProject) return;

    setIsUploading(true);

    try {
      const api = getElectronAPI();
      const contextPath = getContextPath();
      if (!contextPath) return;

      // Expand directories to files
      const allFilePaths: string[] = [];
      for (const selectedPath of filePaths) {
        const statResult = await api.stat(selectedPath);
        if (statResult.success && statResult.stats) {
          if (statResult.stats.isDirectory) {
            // It's a directory, get all files recursively
            const filesInDir = await getAllFilesFromDirectory(selectedPath, api);
            allFilePaths.push(...filesInDir);
          } else {
            // It's a file
            allFilePaths.push(selectedPath);
          }
        }
      }

      toast.info(`Importing ${allFilePaths.length} file(s)...`);

      // Copy each file to the context directory
      for (const sourceFilePath of allFilePaths) {
        try {
          // Read file from server
          const result = await api.readFile(sourceFilePath);
          if (!result.success || result.content === undefined) {
            console.error(`Failed to read ${sourceFilePath}:`, result.error);
            continue;
          }

          // Calculate relative path from project root
          let relativePath: string;
          const normalizedSourcePath = sourceFilePath.replace(/\\/g, '/');
          const normalizedProjectPath = currentProject.path.replace(/\\/g, '/');

          if (normalizedSourcePath.startsWith(normalizedProjectPath + '/')) {
            // File is within project, preserve relative structure
            relativePath = normalizedSourcePath.substring(normalizedProjectPath.length + 1);
          } else {
            // File is outside project, just use filename
            relativePath = sourceFilePath.split(/[/\\]/).pop() || 'unnamed';
          }

          const fileName = relativePath.split('/').pop() || 'unnamed';
          setUploadingFileName(fileName);

          // Create destination path preserving folder structure
          const destPath: string = `${contextPath}/${relativePath}`;

          // Create parent directories if needed
          const lastSlashIndex = destPath.lastIndexOf('/');
          if (lastSlashIndex > contextPath.length) {
            const dirname: string = destPath.substring(0, lastSlashIndex);
            await api.mkdir(dirname);
          }

          // Write to context directory
          await api.writeFile(destPath, result.content);

          // Save metadata with source path and sync timestamp
          const metadata = await loadMetadata();
          metadata.files[relativePath] = {
            description: metadata.files[relativePath]?.description || '',
            sourcePath: sourceFilePath,
            lastSyncedAt: new Date().toISOString(),
          };
          await saveMetadata(metadata);

          // Reload files immediately
          await loadContextFiles();

          // Generate description in background
          const isImage = isImageFile(fileName);
          generateDescriptionAsync(destPath, fileName, relativePath, isImage);
        } catch (error) {
          console.error(`Failed to copy file ${sourceFilePath}:`, error);
          toast.error(`Failed to import ${sourceFilePath.split(/[/\\]/).pop()}`);
        }
      }

      toast.success(`Imported ${filePaths.length} file(s) successfully`);
    } catch (error) {
      console.error('Failed to import files:', error);
      toast.error('Failed to import files');
    } finally {
      setIsUploading(false);
      setUploadingFileName(null);
    }
  };

  // Handle create markdown
  const handleCreateMarkdown = async () => {
    const contextPath = getContextPath();
    if (!contextPath || !newMarkdownName.trim()) return;

    try {
      const api = getElectronAPI();
      let filepath = newMarkdownName.trim();

      // Add .md extension if not provided and no other extension exists
      if (!filepath.includes('.')) {
        filepath += '.md';
      }

      // Normalize path separators
      filepath = filepath.replace(/\\/g, '/');

      const fullPath = `${contextPath}/${filepath}`;

      // Create parent directories if needed
      const dirname = fullPath.substring(0, fullPath.lastIndexOf('/'));
      if (dirname !== contextPath) {
        await api.mkdir(dirname);
      }

      // Write markdown file
      await api.writeFile(fullPath, newMarkdownContent);

      // Save description if provided
      if (newMarkdownDescription.trim()) {
        const metadata = await loadMetadata();
        // Use the full relative path as key
        metadata.files[filepath] = {
          description: newMarkdownDescription.trim(),
        };
        await saveMetadata(metadata);
      }

      // Reload files
      await loadContextFiles();

      // Reset and close modal
      setIsCreateMarkdownOpen(false);
      setNewMarkdownName('');
      setNewMarkdownDescription('');
      setNewMarkdownContent('');

      toast.success(`Created ${filepath}`);
    } catch (error) {
      console.error('Failed to create markdown:', error);
      toast.error('Failed to create file', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // Delete selected file
  const handleDeleteFile = async () => {
    if (!selectedFile) return;

    try {
      const api = getElectronAPI();
      await api.deleteFile(selectedFile.path);

      // Remove from metadata using relativePath
      const metadata = await loadMetadata();
      delete metadata.files[selectedFile.relativePath];
      await saveMetadata(metadata);

      setIsDeleteDialogOpen(false);
      setSelectedFile(null);
      setEditedContent('');
      setHasChanges(false);
      await loadContextFiles();
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  // Rename selected file
  const handleRenameFile = async () => {
    const contextPath = getContextPath();
    if (!selectedFile || !contextPath || !renameFileName.trim()) return;

    const newName = renameFileName.trim();
    if (newName === selectedFile.name) {
      setIsRenameDialogOpen(false);
      return;
    }

    try {
      const api = getElectronAPI();
      const newPath = `${contextPath}/${newName}`;

      // Check if file with new name already exists
      const exists = await api.exists(newPath);
      if (exists) {
        console.error('A file with this name already exists');
        return;
      }

      // Read current file content
      const result = await api.readFile(selectedFile.path);
      if (!result.success || result.content === undefined) {
        console.error('Failed to read file for rename');
        return;
      }

      // Write to new path
      await api.writeFile(newPath, result.content);

      // Delete old file
      await api.deleteFile(selectedFile.path);

      // Update metadata using relativePath
      const metadata = await loadMetadata();
      if (metadata.files[selectedFile.relativePath]) {
        metadata.files[newName] = metadata.files[selectedFile.relativePath];
        delete metadata.files[selectedFile.relativePath];
        await saveMetadata(metadata);
      }

      setIsRenameDialogOpen(false);
      setRenameFileName('');

      // Reload files and select the renamed file
      await loadContextFiles();

      // Update selected file with new name and path
      const renamedFile: ContextFile = {
        name: newName,
        type: isImageFile(newName) ? 'image' : 'text',
        path: newPath,
        relativePath: newName, // For files in root, relativePath is just the filename
        content: result.content,
        description: metadata.files[newName]?.description,
        sourcePath: metadata.files[newName]?.sourcePath,
        lastSyncedAt: metadata.files[newName]?.lastSyncedAt,
      };
      setSelectedFile(renamedFile);
    } catch (error) {
      console.error('Failed to rename file:', error);
    }
  };

  // Save edited description
  const handleSaveDescription = async () => {
    if (!editDescriptionFileName) return;

    try {
      const metadata = await loadMetadata();
      const fileToUpdate = contextFiles.find((f) => f.name === editDescriptionFileName);
      const key = fileToUpdate?.relativePath || editDescriptionFileName;

      // Preserve existing metadata
      const existingMetadata = metadata.files[key] || {};
      metadata.files[key] = {
        ...existingMetadata,
        description: editDescriptionValue.trim(),
      };
      await saveMetadata(metadata);

      // Update selected file if it's the one being edited
      if (selectedFile?.name === editDescriptionFileName) {
        setSelectedFile({ ...selectedFile, description: editDescriptionValue.trim() });
      }

      // Reload files to update list
      await loadContextFiles();

      setIsEditDescriptionOpen(false);
      setEditDescriptionValue('');
      setEditDescriptionFileName('');
    } catch (error) {
      console.error('Failed to save description:', error);
    }
  };

  // Open edit description dialog
  const handleEditDescription = (file: ContextFile) => {
    setEditDescriptionFileName(file.name);
    setEditDescriptionValue(file.description || '');
    setIsEditDescriptionOpen(true);
  };

  // Check for sync changes (preview mode)
  const checkSyncChanges = async () => {
    if (!currentProject) return;

    setIsSyncing(true);
    const toUpdate: Array<{ relativePath: string; reason: string }> = [];
    const toDelete: Array<{ relativePath: string; reason: string }> = [];
    const conflicts: Array<{ relativePath: string; reason: string }> = [];
    let unchanged = 0;
    let notSynced = 0;

    try {
      const api = getElectronAPI();
      const contextPath = getContextPath();
      if (!contextPath) return;

      const metadata = await loadMetadata();

      for (const [relativePath, fileMetadata] of Object.entries(metadata.files)) {
        if (!fileMetadata.sourcePath) {
          // File created manually, not imported from source
          notSynced++;
          continue;
        }

        const sourcePath = fileMetadata.sourcePath;
        const destPath = `${contextPath}/${relativePath}`;

        try {
          const sourceExists = await api.exists(sourcePath);

          if (!sourceExists) {
            toDelete.push({
              relativePath,
              reason: 'Source file no longer exists',
            });
            continue;
          }

          const sourceResult = await api.stat(sourcePath);
          if (!sourceResult.success || !sourceResult.stats) {
            unchanged++;
            continue;
          }

          const sourceMtime = new Date(sourceResult.stats.mtime).getTime();
          const lastSyncTime = fileMetadata.lastSyncedAt
            ? new Date(fileMetadata.lastSyncedAt).getTime()
            : 0;

          if (sourceMtime > lastSyncTime) {
            // Check if local file has been modified
            const destResult = await api.stat(destPath);
            if (destResult.success && destResult.stats) {
              const destMtime = new Date(destResult.stats.mtime).getTime();
              const syncTime = lastSyncTime;

              // If both source and dest were modified after last sync → conflict
              if (destMtime > syncTime && sourceMtime > syncTime) {
                conflicts.push({
                  relativePath,
                  reason: 'Both source and local file modified',
                });
                continue;
              }
            }

            toUpdate.push({
              relativePath,
              reason: `Modified ${new Date(sourceMtime).toLocaleString()}`,
            });
          } else {
            unchanged++;
          }
        } catch (error) {
          console.error(`Failed to check ${relativePath}:`, error);
          unchanged++;
        }
      }

      setSyncPreviewData({ toUpdate, toDelete, conflicts, unchanged, notSynced });
      setIsSyncPreviewOpen(true);
    } catch (error) {
      console.error('Failed to check sync changes:', error);
      toast.error('Failed to check changes', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Apply sync changes (only update and delete files from preview)
  const applySyncChanges = async () => {
    if (!currentProject || !syncPreviewData) return;

    setIsSyncing(true);
    setIsSyncPreviewOpen(false);

    try {
      const api = getElectronAPI();
      const contextPath = getContextPath();
      if (!contextPath) return;

      const metadata = await loadMetadata();
      let updatedCount = 0;
      let deletedCount = 0;

      // Delete files
      for (const item of syncPreviewData.toDelete) {
        const destPath = `${contextPath}/${item.relativePath}`;
        await api.deleteFile(destPath);
        delete metadata.files[item.relativePath];
        deletedCount++;
      }

      // Update files
      for (const item of syncPreviewData.toUpdate) {
        const fileMetadata = metadata.files[item.relativePath];
        if (!fileMetadata?.sourcePath) continue;

        const sourcePath = fileMetadata.sourcePath;
        const destPath = `${contextPath}/${item.relativePath}`;

        const readResult = await api.readFile(sourcePath);
        if (readResult.success && readResult.content !== undefined) {
          // Create parent directories if needed
          const lastSlashIndex = destPath.lastIndexOf('/');
          if (lastSlashIndex > contextPath.length) {
            const dirname: string = destPath.substring(0, lastSlashIndex);
            await api.mkdir(dirname);
          }

          await api.writeFile(destPath, readResult.content);
          metadata.files[item.relativePath].lastSyncedAt = new Date().toISOString();
          updatedCount++;
        }
      }

      // Handle conflicts based on user's resolution
      for (const item of syncPreviewData.conflicts) {
        const resolution = conflictResolutions.get(item.relativePath);
        if (!resolution || resolution === 'skip') continue;

        const fileMetadata = metadata.files[item.relativePath];
        if (!fileMetadata?.sourcePath) continue;

        if (resolution === 'use-source') {
          const sourcePath = fileMetadata.sourcePath;
          const destPath = `${contextPath}/${item.relativePath}`;

          const readResult = await api.readFile(sourcePath);
          if (readResult.success && readResult.content !== undefined) {
            await api.writeFile(destPath, readResult.content);
            metadata.files[item.relativePath].lastSyncedAt = new Date().toISOString();
            updatedCount++;
          }
        }
        // If 'keep-local', we just update the lastSyncedAt timestamp to avoid future conflicts
        else if (resolution === 'keep-local') {
          metadata.files[item.relativePath].lastSyncedAt = new Date().toISOString();
        }
      }

      // Save updated metadata
      await saveMetadata(metadata);

      // Reload files
      await loadContextFiles();

      toast.success('Sync completed', {
        description: `Updated: ${updatedCount}, Deleted: ${deletedCount}`,
      });

      setSyncPreviewData(null);
      setConflictResolutions(new Map());
    } catch (error) {
      console.error('Failed to sync files:', error);
      toast.error('Sync failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Link file to source
  const handleLinkToSource = async (sourcePaths: string[]) => {
    if (!fileToLink || sourcePaths.length === 0) return;

    try {
      const sourcePath = sourcePaths[0]; // Only one file for linking
      const metadata = await loadMetadata();

      // Update metadata with source path and current timestamp
      const existingMetadata = metadata.files[fileToLink.relativePath] || {};
      metadata.files[fileToLink.relativePath] = {
        ...existingMetadata,
        sourcePath,
        lastSyncedAt: new Date().toISOString(),
      };

      await saveMetadata(metadata);

      // Reload files to update UI
      await loadContextFiles();

      toast.success(`Linked "${fileToLink.name}" to source`, {
        description: sourcePath,
      });

      setIsLinkToSourceOpen(false);
      setFileToLink(null);
    } catch (error) {
      console.error('Failed to link file to source:', error);
      toast.error('Failed to link file', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // Bulk link files by matching paths
  const handleBulkLink = async (basePath: string) => {
    if (!currentProject) return;

    try {
      const api = getElectronAPI();
      const metadata = await loadMetadata();
      let linkedCount = 0;
      let notFoundCount = 0;

      // Get all files without sourcePath
      const unlinkedFiles = contextFiles.filter((f) => !f.sourcePath);

      for (const file of unlinkedFiles) {
        // Try to find matching file in project
        const potentialSourcePath = `${basePath}/${file.relativePath}`;
        const exists = await api.exists(potentialSourcePath);

        if (exists) {
          // Link this file
          const existingMetadata = metadata.files[file.relativePath] || {};
          metadata.files[file.relativePath] = {
            ...existingMetadata,
            sourcePath: potentialSourcePath,
            lastSyncedAt: new Date().toISOString(),
          };
          linkedCount++;
        } else {
          notFoundCount++;
        }
      }

      await saveMetadata(metadata);
      await loadContextFiles();

      toast.success('Bulk link completed', {
        description: `Linked: ${linkedCount}, Not found: ${notFoundCount}`,
      });

      setIsBulkLinkOpen(false);
    } catch (error) {
      console.error('Failed to bulk link:', error);
      toast.error('Bulk link failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // Delete file from list (used by dropdown)
  const handleDeleteFromList = async (file: ContextFile) => {
    try {
      const api = getElectronAPI();
      await api.deleteFile(file.path);

      // Remove from metadata using relativePath
      const metadata = await loadMetadata();
      delete metadata.files[file.relativePath];
      await saveMetadata(metadata);

      // Clear selection if this was the selected file
      if (selectedFile?.path === file.path) {
        setSelectedFile(null);
        setEditedContent('');
        setHasChanges(false);
      }

      await loadContextFiles();
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  if (!currentProject) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        data-testid="context-view-no-project"
      >
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="context-view-loading">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden content-bg" data-testid="context-view">
      {/* Server-side file picker dialog */}
      <FilePickerDialog
        open={isFilePickerOpen}
        onOpenChange={setIsFilePickerOpen}
        onSelect={handleFilePickerSelect}
        title="Import Context Files from Server"
        description="Select files from the server file system to import"
        initialPath={currentProject?.path}
        allowMultiple={true}
      />

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">Context Files</h1>
            <p className="text-sm text-muted-foreground">
              Add context files to include in AI prompts
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={checkSyncChanges}
            disabled={isSyncing || isUploading}
            data-testid="sync-files-button"
            title="Check for changes and sync files"
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', isSyncing && 'animate-spin')} />
            Sync
          </Button>
          {contextFiles.some((f) => !f.sourcePath) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBulkLinkOpen(true)}
              disabled={isSyncing || isUploading}
              data-testid="bulk-link-button"
              title="Link manual files to project sources by matching folder structure"
            >
              <Link2 className="w-4 h-4 mr-2" />
              Import Folder
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportClick}
            disabled={isUploading || isSyncing}
            data-testid="import-file-button"
          >
            <FileUp className="w-4 h-4 mr-2" />
            Import File
          </Button>
          <HotkeyButton
            size="sm"
            onClick={() => setIsCreateMarkdownOpen(true)}
            hotkey={shortcuts.addContextFile}
            hotkeyActive={false}
            disabled={isUploading || isSyncing}
            data-testid="create-markdown-button"
          >
            <FilePlus className="w-4 h-4 mr-2" />
            Create Markdown
          </HotkeyButton>
        </div>
      </div>

      {/* Main content area with file list and editor */}
      <div
        className={cn(
          'flex-1 flex overflow-hidden relative',
          isDropHovering && 'ring-2 ring-primary ring-inset'
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        data-testid="context-drop-zone"
      >
        {/* Drop overlay */}
        {isDropHovering && (
          <div className="absolute inset-0 bg-primary/10 z-50 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center text-primary">
              <Upload className="w-12 h-12 mb-2" />
              <span className="text-lg font-medium">Drop files to upload</span>
              <span className="text-sm text-muted-foreground">
                Files will be analyzed automatically
              </span>
            </div>
          </div>
        )}

        {/* Uploading overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-background/80 z-50 flex items-center justify-center">
            <div className="flex flex-col items-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
              <span className="text-sm font-medium">Uploading {uploadingFileName}...</span>
            </div>
          </div>
        )}

        {/* Left Panel - File List */}
        <div className="w-64 border-r border-border flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Context Files ({contextFiles.length})
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2" data-testid="context-file-list">
            {contextFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No context files yet.
                  <br />
                  Drop files here or use the buttons above.
                </p>
              </div>
            ) : (
              <FileTree
                nodes={fileTree}
                selectedPath={selectedFile?.relativePath}
                onSelectFile={(node) => {
                  const file = contextFiles.find((f) => f.relativePath === node.path);
                  if (file) {
                    handleSelectFile(file);
                  }
                }}
                renderFileIcon={(node) => {
                  const file = node.metadata as ContextFile;
                  const isGenerating = generatingDescriptions.has(file.name);

                  return (
                    <div className="relative flex-shrink-0">
                      {file.type === 'image' ? (
                        <ImageIcon className="w-4 h-4" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                      {file.sourcePath && (
                        <div title="Synced from source" className="absolute -bottom-0.5 -right-0.5">
                          <Link2 className="w-2.5 h-2.5 text-blue-500" />
                        </div>
                      )}
                    </div>
                  );
                }}
                renderFileLabel={(node) => {
                  const file = node.metadata as ContextFile;
                  const isGenerating = generatingDescriptions.has(file.name);

                  return (
                    <div className="min-w-0 flex-1 flex items-center justify-between gap-2 group">
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-sm block">{file.name}</span>
                        {file.sourcePath && (
                          <span className="truncate text-xs text-blue-500 block">
                            ↔ {file.sourcePath.split('/').slice(-2).join('/')}
                          </span>
                        )}
                        {isGenerating ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Generating description...
                          </span>
                        ) : file.description ? (
                          <span className="truncate text-xs text-muted-foreground block">
                            {file.description}
                          </span>
                        ) : null}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded transition-opacity flex-shrink-0"
                            data-testid={`context-file-menu-${file.name}`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!file.sourcePath && (
                            <DropdownMenuItem
                              onClick={() => {
                                setFileToLink(file);
                                setIsLinkToSourceOpen(true);
                              }}
                              data-testid={`link-context-file-${file.name}`}
                            >
                              <Link2 className="w-4 h-4 mr-2" />
                              Link to Source
                            </DropdownMenuItem>
                          )}
                          {file.sourcePath && (
                            <DropdownMenuItem
                              onClick={async () => {
                                const metadata = await loadMetadata();
                                const fileMetadata = metadata.files[file.relativePath];
                                if (fileMetadata) {
                                  delete fileMetadata.sourcePath;
                                  delete fileMetadata.lastSyncedAt;
                                  await saveMetadata(metadata);
                                  await loadContextFiles();
                                  toast.success('Unlinked from source');
                                }
                              }}
                              data-testid={`unlink-context-file-${file.name}`}
                            >
                              <Link2 className="w-4 h-4 mr-2" />
                              Unlink from Source
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              setRenameFileName(file.name);
                              setSelectedFile(file);
                              setIsRenameDialogOpen(true);
                            }}
                            data-testid={`rename-context-file-${file.name}`}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteFromList(file)}
                            className="text-red-500 focus:text-red-500"
                            data-testid={`delete-context-file-${file.name}`}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                }}
                testId="context-file-tree"
              />
            )}
          </div>
        </div>

        {/* Right Panel - Editor/Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedFile ? (
            <>
              {/* File toolbar */}
              <div className="flex items-center justify-between p-3 border-b border-border bg-card">
                <div className="flex items-center gap-2 min-w-0">
                  {selectedFile.type === 'image' ? (
                    <ImageIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium truncate block">
                      {selectedFile.relativePath}
                    </span>
                    {selectedFile.sourcePath && (
                      <span className="text-xs text-blue-500 truncate block">
                        Synced from: {selectedFile.sourcePath}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedFile.type === 'text' && isMarkdownFile(selectedFile.name) && (
                    <Button
                      variant={'outline'}
                      size="sm"
                      onClick={() => setIsPreviewMode(!isPreviewMode)}
                      data-testid="toggle-preview-mode"
                    >
                      {isPreviewMode ? (
                        <>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </>
                      )}
                    </Button>
                  )}
                  {selectedFile.type === 'text' && (
                    <Button
                      size="sm"
                      onClick={saveFile}
                      disabled={!hasChanges || isSaving}
                      data-testid="save-context-file"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {isSaving ? 'Saving...' : hasChanges ? 'Save' : 'Saved'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="text-red-500 hover:text-red-400 hover:border-red-500/50"
                    data-testid="delete-context-file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Description section */}
              <div className="px-4 pt-4 pb-2">
                <div className="bg-muted/50 rounded-lg p-3 border border-border">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Description
                      </span>
                      {generatingDescriptions.has(selectedFile.name) ? (
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Generating description with AI...</span>
                        </div>
                      ) : selectedFile.description ? (
                        <p className="text-sm mt-1">{selectedFile.description}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-1 italic">
                          No description. Click edit to add one.
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditDescription(selectedFile)}
                      className="flex-shrink-0"
                      data-testid="edit-description-button"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Content area */}
              <div className="flex-1 overflow-hidden px-4 pb-4">
                {selectedFile.type === 'image' ? (
                  <div
                    className="h-full flex items-center justify-center bg-card rounded-lg"
                    data-testid="image-preview"
                  >
                    <img
                      src={editedContent}
                      alt={selectedFile.name}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                ) : isPreviewMode ? (
                  <Card className="h-full overflow-auto p-4" data-testid="markdown-preview">
                    <Markdown>{editedContent}</Markdown>
                  </Card>
                ) : (
                  <Card className="h-full overflow-hidden">
                    <textarea
                      className="w-full h-full p-4 font-mono text-sm bg-transparent resize-none focus:outline-none"
                      value={editedContent}
                      onChange={(e) => handleContentChange(e.target.value)}
                      placeholder="Enter context content here..."
                      spellCheck={false}
                      data-testid="context-editor"
                    />
                  </Card>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <File className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-foreground-secondary">Select a file to view or edit</p>
                <p className="text-muted-foreground text-sm mt-1">Or drop files here to add them</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Markdown Dialog */}
      <Dialog open={isCreateMarkdownOpen} onOpenChange={setIsCreateMarkdownOpen}>
        <DialogContent
          data-testid="create-markdown-dialog"
          className="w-[60vw] max-w-[60vw] max-h-[80vh] flex flex-col"
        >
          <DialogHeader>
            <DialogTitle>Create Markdown Context</DialogTitle>
            <DialogDescription>
              Create a new markdown file to add context for AI prompts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 flex-1 overflow-auto">
            <div className="space-y-2">
              <Label htmlFor="markdown-filename">File Path</Label>
              <Input
                id="markdown-filename"
                value={newMarkdownName}
                onChange={(e) => setNewMarkdownName(e.target.value)}
                placeholder="docs/api/auth.md (or just filename.md)"
                data-testid="new-markdown-name"
              />
              <p className="text-xs text-muted-foreground">
                You can use folder paths like <code>docs/api/auth.md</code> to organize files
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="markdown-description">
                Description (for AI to understand the context)
              </Label>
              <Input
                id="markdown-description"
                value={newMarkdownDescription}
                onChange={(e) => setNewMarkdownDescription(e.target.value)}
                placeholder="e.g., Coding style guidelines for this project"
                data-testid="new-markdown-description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="markdown-content">Content</Label>
              <textarea
                id="markdown-content"
                value={newMarkdownContent}
                onChange={(e) => setNewMarkdownContent(e.target.value)}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  // Try files first, then items for better compatibility
                  let files = Array.from(e.dataTransfer.files);
                  if (files.length === 0 && e.dataTransfer.items) {
                    const items = Array.from(e.dataTransfer.items);
                    files = items
                      .filter((item) => item.kind === 'file')
                      .map((item) => item.getAsFile())
                      .filter((f): f is globalThis.File => f !== null);
                  }

                  const mdFile = files.find((f) => isMarkdownFile(f.name));
                  if (mdFile) {
                    const content = await mdFile.text();
                    setNewMarkdownContent(content);
                    if (!newMarkdownName.trim()) {
                      setNewMarkdownName(mdFile.name);
                    }
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                placeholder="Enter your markdown content here..."
                className="w-full h-60 p-3 font-mono text-sm bg-background border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                spellCheck={false}
                data-testid="new-markdown-content"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateMarkdownOpen(false);
                setNewMarkdownName('');
                setNewMarkdownDescription('');
                setNewMarkdownContent('');
              }}
            >
              Cancel
            </Button>
            <HotkeyButton
              onClick={handleCreateMarkdown}
              disabled={!newMarkdownName.trim()}
              hotkey={{ key: 'Enter', cmdCtrl: true }}
              hotkeyActive={isCreateMarkdownOpen}
              data-testid="confirm-create-markdown"
            >
              Create
            </HotkeyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent data-testid="delete-context-dialog">
          <DialogHeader>
            <DialogTitle>Delete Context File</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedFile?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteFile}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-file"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent data-testid="rename-context-dialog">
          <DialogHeader>
            <DialogTitle>Rename Context File</DialogTitle>
            <DialogDescription>Enter a new name for "{selectedFile?.name}".</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-filename">File Name</Label>
              <Input
                id="rename-filename"
                value={renameFileName}
                onChange={(e) => setRenameFileName(e.target.value)}
                placeholder="Enter new filename"
                data-testid="rename-file-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renameFileName.trim()) {
                    handleRenameFile();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsRenameDialogOpen(false);
                setRenameFileName('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRenameFile}
              disabled={!renameFileName.trim() || renameFileName === selectedFile?.name}
              data-testid="confirm-rename-file"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Description Dialog */}
      <Dialog open={isEditDescriptionOpen} onOpenChange={setIsEditDescriptionOpen}>
        <DialogContent data-testid="edit-description-dialog">
          <DialogHeader>
            <DialogTitle>Edit Description</DialogTitle>
            <DialogDescription>
              Update the description for "{editDescriptionFileName}". This helps AI understand the
              context.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescriptionValue}
                onChange={(e) => setEditDescriptionValue(e.target.value)}
                placeholder="e.g., API documentation for authentication endpoints..."
                className="min-h-[100px]"
                data-testid="edit-description-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDescriptionOpen(false);
                setEditDescriptionValue('');
                setEditDescriptionFileName('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveDescription} data-testid="confirm-save-description">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sync Preview Dialog */}
      <Dialog open={isSyncPreviewOpen} onOpenChange={setIsSyncPreviewOpen}>
        <DialogContent
          className="max-w-2xl max-h-[80vh] flex flex-col"
          data-testid="sync-preview-dialog"
        >
          <DialogHeader>
            <DialogTitle>Sync Preview</DialogTitle>
            <DialogDescription>
              Review changes before syncing context files with their sources.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            {syncPreviewData && (
              <>
                {/* Info message if no synced files */}
                {syncPreviewData.notSynced > 0 &&
                  syncPreviewData.toUpdate.length === 0 &&
                  syncPreviewData.toDelete.length === 0 &&
                  syncPreviewData.conflicts.length === 0 &&
                  syncPreviewData.unchanged === 0 && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
                      <div className="flex items-start gap-3">
                        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                            No synced files found
                          </h4>
                          <p className="text-sm text-blue-700 dark:text-blue-300">
                            You have {syncPreviewData.notSynced} context file(s), but none of them
                            are synced with external sources. Sync only works with files imported
                            using "Import File" button.
                          </p>
                          <p className="text-sm text-blue-700 dark:text-blue-300 mt-2">
                            To sync a file, import it from the server instead of creating it
                            manually.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                {/* Conflicts */}
                {syncPreviewData.conflicts.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-yellow-600">
                      <AlertCircle className="w-4 h-4" />
                      <h3 className="font-semibold">
                        Conflicts ({syncPreviewData.conflicts.length})
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      These files have been modified both locally and at source. Choose how to
                      resolve each conflict.
                    </p>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {syncPreviewData.conflicts.map((item) => {
                        const resolution = conflictResolutions.get(item.relativePath) || 'skip';
                        return (
                          <div
                            key={item.relativePath}
                            className="p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded border border-yellow-200 dark:border-yellow-900"
                          >
                            <div className="flex items-start gap-2 mb-2">
                              <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium truncate">
                                  {item.relativePath}
                                </div>
                                <div className="text-xs text-muted-foreground">{item.reason}</div>
                              </div>
                            </div>
                            <div className="flex gap-2 ml-6">
                              <button
                                onClick={() => {
                                  const newResolutions = new Map(conflictResolutions);
                                  newResolutions.set(item.relativePath, 'use-source');
                                  setConflictResolutions(newResolutions);
                                }}
                                className={cn(
                                  'flex-1 px-2 py-1 text-xs rounded border transition-colors',
                                  resolution === 'use-source'
                                    ? 'bg-blue-500 text-white border-blue-600'
                                    : 'bg-background border-border hover:bg-accent'
                                )}
                              >
                                Use Source
                              </button>
                              <button
                                onClick={() => {
                                  const newResolutions = new Map(conflictResolutions);
                                  newResolutions.set(item.relativePath, 'keep-local');
                                  setConflictResolutions(newResolutions);
                                }}
                                className={cn(
                                  'flex-1 px-2 py-1 text-xs rounded border transition-colors',
                                  resolution === 'keep-local'
                                    ? 'bg-green-500 text-white border-green-600'
                                    : 'bg-background border-border hover:bg-accent'
                                )}
                              >
                                Keep Local
                              </button>
                              <button
                                onClick={() => {
                                  const newResolutions = new Map(conflictResolutions);
                                  newResolutions.set(item.relativePath, 'skip');
                                  setConflictResolutions(newResolutions);
                                }}
                                className={cn(
                                  'flex-1 px-2 py-1 text-xs rounded border transition-colors',
                                  resolution === 'skip'
                                    ? 'bg-gray-500 text-white border-gray-600'
                                    : 'bg-background border-border hover:bg-accent'
                                )}
                              >
                                Skip
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Files to Update */}
                {syncPreviewData.toUpdate.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-blue-600">
                      <RefreshCw className="w-4 h-4" />
                      <h3 className="font-semibold">
                        To Update ({syncPreviewData.toUpdate.length})
                      </h3>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {syncPreviewData.toUpdate.map((item) => (
                        <div
                          key={item.relativePath}
                          className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-900"
                        >
                          <RefreshCw className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{item.relativePath}</div>
                            <div className="text-xs text-muted-foreground">{item.reason}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Files to Delete */}
                {syncPreviewData.toDelete.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-red-600">
                      <Trash2 className="w-4 h-4" />
                      <h3 className="font-semibold">
                        To Delete ({syncPreviewData.toDelete.length})
                      </h3>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {syncPreviewData.toDelete.map((item) => (
                        <div
                          key={item.relativePath}
                          className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-900"
                        >
                          <Trash2 className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{item.relativePath}</div>
                            <div className="text-xs text-muted-foreground">{item.reason}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Summary */}
                <div className="pt-4 border-t border-border space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">To update:</span>{' '}
                      <span className="font-semibold text-blue-600">
                        {syncPreviewData.toUpdate.length}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">To delete:</span>{' '}
                      <span className="font-semibold text-red-600">
                        {syncPreviewData.toDelete.length}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Conflicts:</span>{' '}
                      <span className="font-semibold text-yellow-600">
                        {syncPreviewData.conflicts.length}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Up to date:</span>{' '}
                      <span className="font-semibold text-green-600">
                        {syncPreviewData.unchanged}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg border border-border">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Manual files (not synced):</span>
                      <span className="font-semibold">{syncPreviewData.notSynced}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      These files were created manually and don't have a source to sync with.
                    </p>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-blue-700 dark:text-blue-300 font-medium">
                        Total context files:
                      </span>
                      <span className="font-bold text-blue-700 dark:text-blue-300">
                        {syncPreviewData.toUpdate.length +
                          syncPreviewData.toDelete.length +
                          syncPreviewData.conflicts.length +
                          syncPreviewData.unchanged +
                          syncPreviewData.notSynced}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsSyncPreviewOpen(false);
                setSyncPreviewData(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={applySyncChanges}
              disabled={
                !syncPreviewData ||
                (syncPreviewData.toUpdate.length === 0 && syncPreviewData.toDelete.length === 0)
              }
              data-testid="confirm-sync"
            >
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link to Source Dialog */}
      <Dialog open={isLinkToSourceOpen} onOpenChange={setIsLinkToSourceOpen}>
        <DialogContent data-testid="link-to-source-dialog">
          <DialogHeader>
            <DialogTitle>Link to Source File</DialogTitle>
            <DialogDescription>
              Select a file from your project to sync "{fileToLink?.name}" with. This will enable
              automatic synchronization.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <FilePickerDialog
              open={isLinkToSourceOpen}
              onOpenChange={(open) => {
                setIsLinkToSourceOpen(open);
                if (!open) setFileToLink(null);
              }}
              onSelect={handleLinkToSource}
              title="Select Source File"
              description={`Choose the file to link with "${fileToLink?.name}"`}
              initialPath={currentProject?.path}
              allowMultiple={false}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Link Dialog */}
      <Dialog open={isBulkLinkOpen} onOpenChange={setIsBulkLinkOpen}>
        <DialogContent className="max-w-xl" data-testid="bulk-link-dialog">
          <DialogHeader>
            <DialogTitle>Bulk Link Files to Sources</DialogTitle>
            <DialogDescription>
              Automatically link all manual files to matching files in your project by matching
              their relative paths.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">How it works</h4>
              <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-2 list-decimal list-inside">
                <li>
                  Select a base directory in your project (e.g., <code>/proyecto</code>)
                </li>
                <li>
                  System will look for files matching the same relative path
                  <br />
                  <span className="text-xs ml-5">
                    Example: <code>.automaker/context/docs/README.md</code> →{' '}
                    <code>/proyecto/docs/README.md</code>
                  </span>
                </li>
                <li>Files that match will be automatically linked</li>
                <li>Files without matches will be left as manual files</li>
              </ol>
            </div>

            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Files without source:</span>
                  <span className="font-semibold">
                    {contextFiles.filter((f) => !f.sourcePath).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Already linked:</span>
                  <span className="font-semibold">
                    {contextFiles.filter((f) => f.sourcePath).length}
                  </span>
                </div>
              </div>
            </div>

            <FilePickerDialog
              open={isBulkLinkOpen}
              onOpenChange={setIsBulkLinkOpen}
              onSelect={(paths) => {
                if (paths.length > 0) {
                  handleBulkLink(paths[0]);
                }
              }}
              title="Select Base Directory"
              description="Choose the root directory to match files against. You can select a folder."
              initialPath={currentProject?.path}
              allowMultiple={false}
              allowDirectories={true}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
