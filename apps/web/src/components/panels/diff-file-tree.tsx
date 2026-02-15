import type { DiffFile as SchemaDiffFile } from '@shipyard/loro-schema';
import { ChevronDown, ChevronRight, FileText, FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STATUS_COLORS: Record<string, string> = {
  M: 'text-warning',
  A: 'text-success',
  D: 'text-danger',
  R: 'text-secondary',
  C: 'text-secondary',
  MM: 'text-warning',
  AM: 'text-success',
  AD: 'text-danger',
  UU: 'text-danger',
  '??': 'text-muted',
};

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  status?: string;
  children: TreeNode[];
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function buildTree(files: readonly SchemaDiffFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();

  for (const file of files) {
    const normalized = file.path.replace(/\/+$/, '');
    if (!normalized) continue;
    const parts = normalized.split('/');
    let currentChildren = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = i === parts.length - 1;

      if (isLast) {
        currentChildren.push({
          name: part,
          path: file.path,
          isDir: false,
          status: file.status,
          children: [],
        });
      } else {
        let dirNode = dirMap.get(currentPath);
        if (!dirNode) {
          dirNode = {
            name: part,
            path: currentPath,
            isDir: true,
            children: [],
          };
          dirMap.set(currentPath, dirNode);
          currentChildren.push(dirNode);
        }
        currentChildren = dirNode.children;
      }
    }
  }

  return collapseAndSort(root);
}

function collapseAndSort(nodes: TreeNode[]): TreeNode[] {
  return sortNodes(
    nodes.map((node) => {
      if (!node.isDir) return node;
      let collapsed = node;
      while (collapsed.isDir && collapsed.children.length === 1 && collapsed.children[0]!.isDir) {
        const child = collapsed.children[0]!;
        collapsed = {
          ...child,
          name: `${collapsed.name}/${child.name}`,
        };
      }
      return { ...collapsed, children: collapseAndSort(collapsed.children) };
    })
  );
}

interface FlatItem {
  node: TreeNode;
  depth: number;
  parentPath: string | null;
}

function flattenVisible(
  nodes: TreeNode[],
  expandedDirs: Set<string>,
  depth: number,
  parentPath: string | null
): FlatItem[] {
  const result: FlatItem[] = [];
  for (const node of nodes) {
    result.push({ node, depth, parentPath });
    if (node.isDir && expandedDirs.has(node.path)) {
      result.push(...flattenVisible(node.children, expandedDirs, depth + 1, node.path));
    }
  }
  return result;
}

interface DiffFileTreeProps {
  files: readonly SchemaDiffFile[];
  selectedFile: string | null;
  onSelectFile: (path: string | null) => void;
  width: number;
}

export function DiffFileTree({ files, selectedFile, onSelectFile, width }: DiffFileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);

  const allDirPaths = useMemo(() => {
    const dirs = new Set<string>();
    for (const file of files) {
      const parts = file.path.replace(/\/+$/, '').split('/');
      let p = '';
      for (let i = 0; i < parts.length - 1; i++) {
        p = p ? `${p}/${parts[i]}` : parts[i]!;
        dirs.add(p);
      }
    }
    return dirs;
  }, [files]);

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(allDirPaths);
  const [focusIndex, setFocusIndex] = useState(0);
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map());

  useEffect(() => {
    setExpandedDirs(allDirPaths);
  }, [allDirPaths]);

  const visibleItems = useMemo(
    () => flattenVisible(tree, expandedDirs, 0, null),
    [tree, expandedDirs]
  );

  useEffect(() => {
    if (focusIndex >= visibleItems.length && visibleItems.length > 0) {
      setFocusIndex(visibleItems.length - 1);
    }
  }, [visibleItems.length, focusIndex]);

  const handleToggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleSelectFile = useCallback(
    (path: string) => {
      onSelectFile(selectedFile === path ? null : path);
    },
    [selectedFile, onSelectFile]
  );

  const focusItem = useCallback((index: number) => {
    setFocusIndex(index);
    itemRefs.current.get(index)?.focus();
  }, []);

  const handleTreeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const item = visibleItems[focusIndex];
      if (!item) return;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          if (focusIndex < visibleItems.length - 1) {
            focusItem(focusIndex + 1);
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          if (focusIndex > 0) {
            focusItem(focusIndex - 1);
          }
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          if (item.node.isDir) {
            if (!expandedDirs.has(item.node.path)) {
              handleToggleDir(item.node.path);
            } else if (focusIndex < visibleItems.length - 1) {
              focusItem(focusIndex + 1);
            }
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          if (item.node.isDir && expandedDirs.has(item.node.path)) {
            handleToggleDir(item.node.path);
          } else if (item.parentPath) {
            const parentIndex = visibleItems.findIndex((vi) => vi.node.path === item.parentPath);
            if (parentIndex >= 0) {
              focusItem(parentIndex);
            }
          }
          break;
        }
        case 'Home': {
          e.preventDefault();
          focusItem(0);
          break;
        }
        case 'End': {
          e.preventDefault();
          if (visibleItems.length > 0) {
            focusItem(visibleItems.length - 1);
          }
          break;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          if (item.node.isDir) {
            handleToggleDir(item.node.path);
          } else {
            handleSelectFile(item.node.path);
          }
          break;
        }
      }
    },
    [visibleItems, focusIndex, expandedDirs, handleToggleDir, handleSelectFile, focusItem]
  );

  if (files.length === 0) return null;

  return (
    <div
      className="shrink-0 border-r border-separator/50 flex flex-col h-full overflow-hidden"
      style={{ width }}
    >
      <div className="flex items-center px-2 py-1.5 border-b border-separator/50">
        <span className="text-[10px] text-muted font-medium uppercase tracking-wider">
          {files.length} file{files.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden py-1"
        role="tree"
        aria-label="Changed files"
        onKeyDown={handleTreeKeyDown}
      >
        {visibleItems.map((item, index) => {
          const { node, depth } = item;
          const paddingLeft = 8 + depth * 12;

          if (node.isDir) {
            const isExpanded = expandedDirs.has(node.path);
            const Icon = isExpanded ? ChevronDown : ChevronRight;
            return (
              <div key={node.path} role="treeitem" aria-expanded={isExpanded} tabIndex={-1}>
                <button
                  ref={(el) => {
                    if (el) itemRefs.current.set(index, el);
                    else itemRefs.current.delete(index);
                  }}
                  type="button"
                  className="flex items-center gap-1 w-full py-0.5 text-xs text-muted hover:text-foreground hover:bg-default/50 transition-colors"
                  style={{ paddingLeft }}
                  tabIndex={focusIndex === index ? 0 : -1}
                  onClick={() => handleToggleDir(node.path)}
                >
                  <Icon className="w-3 h-3 shrink-0" />
                  <FolderOpen className="w-3 h-3 shrink-0 text-muted" />
                  <span className="truncate">{node.name}</span>
                </button>
              </div>
            );
          }

          const isSelected = selectedFile === node.path;
          const statusColor = STATUS_COLORS[node.status ?? ''] ?? 'text-muted';
          return (
            <div key={node.path} role="treeitem" aria-selected={isSelected} tabIndex={-1}>
              <button
                ref={(el) => {
                  if (el) itemRefs.current.set(index, el);
                  else itemRefs.current.delete(index);
                }}
                type="button"
                className={`flex items-center gap-1 w-full py-0.5 text-xs transition-colors ${
                  isSelected
                    ? 'bg-accent/15 text-foreground'
                    : 'text-foreground/80 hover:bg-default/50'
                }`}
                style={{ paddingLeft }}
                tabIndex={focusIndex === index ? 0 : -1}
                onClick={() => handleSelectFile(node.path)}
              >
                <FileText className="w-3 h-3 shrink-0 text-muted" />
                <span className="truncate flex-1 text-left">{node.name}</span>
                <span className={`font-mono text-[10px] shrink-0 pr-2 ${statusColor}`}>
                  {node.status}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
