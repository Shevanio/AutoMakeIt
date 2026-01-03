/**
 * File Tree Component
 *
 * Displays a collapsible tree structure of files and folders
 */

import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
  metadata?: any;
}

interface FileTreeProps {
  nodes: FileTreeNode[];
  selectedPath?: string;
  onSelectFile?: (node: FileTreeNode) => void;
  renderFileIcon?: (node: FileTreeNode) => React.ReactNode;
  renderFileLabel?: (node: FileTreeNode) => React.ReactNode;
  testId?: string;
}

interface TreeNodeProps {
  node: FileTreeNode;
  level: number;
  selectedPath?: string;
  onSelectFile?: (node: FileTreeNode) => void;
  renderFileIcon?: (node: FileTreeNode) => React.ReactNode;
  renderFileLabel?: (node: FileTreeNode) => React.ReactNode;
}

function TreeNode({
  node,
  level,
  selectedPath,
  onSelectFile,
  renderFileIcon,
  renderFileLabel,
}: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isSelected = selectedPath === node.path;
  const hasChildren = node.children && node.children.length > 0;

  const handleClick = () => {
    if (node.type === 'folder') {
      setIsExpanded(!isExpanded);
    } else {
      onSelectFile?.(node);
    }
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-colors',
          'hover:bg-accent',
          isSelected && 'bg-primary/20 text-foreground border border-primary/30',
          !isSelected && 'text-muted-foreground hover:text-foreground'
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
        data-testid={`tree-node-${node.path}`}
      >
        {node.type === 'folder' ? (
          <>
            <button
              className="flex-shrink-0 p-0 hover:bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 flex-shrink-0 text-blue-500" />
            ) : (
              <Folder className="w-4 h-4 flex-shrink-0 text-blue-500" />
            )}
          </>
        ) : (
          <div className="w-4 flex-shrink-0" />
        )}

        {node.type === 'file' && renderFileIcon && (
          <div className="flex-shrink-0">{renderFileIcon(node)}</div>
        )}

        <div className="min-w-0 flex-1">
          {renderFileLabel ? (
            renderFileLabel(node)
          ) : (
            <span className="text-sm truncate block">{node.name}</span>
          )}
        </div>
      </div>

      {node.type === 'folder' && isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              renderFileIcon={renderFileIcon}
              renderFileLabel={renderFileLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({
  nodes,
  selectedPath,
  onSelectFile,
  renderFileIcon,
  renderFileLabel,
  testId,
}: FileTreeProps) {
  return (
    <div className="space-y-0.5" data-testid={testId}>
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          level={0}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          renderFileIcon={renderFileIcon}
          renderFileLabel={renderFileLabel}
        />
      ))}
    </div>
  );
}

/**
 * Build a tree structure from a flat list of files
 */
export function buildFileTree<T extends { relativePath: string; name: string }>(
  files: T[]
): FileTreeNode[] {
  const root: Map<string, FileTreeNode> = new Map();

  // Sort files by path for consistent ordering
  const sortedFiles = [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  for (const file of sortedFiles) {
    const parts = file.relativePath.split('/');
    let currentMap = root;
    let currentPath = '';

    // Create folder nodes for each part except the last (which is the file)
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!currentMap.has(part)) {
        const folderNode: FileTreeNode = {
          name: part,
          path: currentPath,
          type: 'folder',
          children: [],
        };
        currentMap.set(part, folderNode);
      }

      const node = currentMap.get(part)!;
      if (!node.children) {
        node.children = [];
      }

      // Move to next level
      const childMap = new Map<string, FileTreeNode>();
      for (const child of node.children) {
        childMap.set(child.name, child);
      }
      currentMap = childMap;
    }

    // Add the file node
    const fileName = parts[parts.length - 1];
    const fileNode: FileTreeNode = {
      name: fileName,
      path: file.relativePath,
      type: 'file',
      metadata: file,
    };

    currentMap.set(fileName, fileNode);
  }

  // Convert root map to array and build children arrays
  function mapToArray(map: Map<string, FileTreeNode>): FileTreeNode[] {
    return Array.from(map.values()).map((node) => {
      if (node.type === 'folder' && node.children) {
        const childMap = new Map<string, FileTreeNode>();
        for (const child of node.children) {
          childMap.set(child.name, child);
        }
        node.children = mapToArray(childMap);
      }
      return node;
    });
  }

  const tree = mapToArray(root);

  // Sort: folders first, then files, both alphabetically
  function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
    return nodes
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      })
      .map((node) => {
        if (node.children) {
          node.children = sortTree(node.children);
        }
        return node;
      });
  }

  return sortTree(tree);
}
