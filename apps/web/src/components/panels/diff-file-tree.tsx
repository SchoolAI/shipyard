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

function addFileToTree(
  file: SchemaDiffFile,
  root: TreeNode[],
  dirMap: Map<string, TreeNode>
): void {
  const normalized = file.path.replace(/\/+$/, '');
  if (!normalized) return;
  const parts = normalized.split('/');
  let currentChildren = root;
  let currentPath = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
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
        dirNode = { name: part, path: currentPath, isDir: true, children: [] };
        dirMap.set(currentPath, dirNode);
        currentChildren.push(dirNode);
      }
      currentChildren = dirNode.children;
    }
  }
}

function buildTree(files: readonly SchemaDiffFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();
  for (const file of files) {
    addFileToTree(file, root, dirMap);
  }
  return collapseAndSort(root);
}

function collapseAndSort(nodes: TreeNode[]): TreeNode[] {
  return sortNodes(
    nodes.map((node) => {
      if (!node.isDir) return node;
      let collapsed = node;
      while (collapsed.isDir && collapsed.children.length === 1 && collapsed.children[0]?.isDir) {
        const child = collapsed.children[0];
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
        const segment = parts[i];
        if (!segment) continue;
        p = p ? `${p}/${segment}` : segment;
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

  const handleArrowDown = useCallback(() => {
    if (focusIndex < visibleItems.length - 1) {
      focusItem(focusIndex + 1);
    }
  }, [focusIndex, visibleItems.length, focusItem]);

  const handleArrowUp = useCallback(() => {
    if (focusIndex > 0) {
      focusItem(focusIndex - 1);
    }
  }, [focusIndex, focusItem]);

  const handleArrowRight = useCallback(
    (item: FlatItem) => {
      if (!item.node.isDir) return;
      if (!expandedDirs.has(item.node.path)) {
        handleToggleDir(item.node.path);
      } else if (focusIndex < visibleItems.length - 1) {
        focusItem(focusIndex + 1);
      }
    },
    [expandedDirs, handleToggleDir, focusIndex, visibleItems.length, focusItem]
  );

  const handleArrowLeft = useCallback(
    (item: FlatItem) => {
      if (item.node.isDir && expandedDirs.has(item.node.path)) {
        handleToggleDir(item.node.path);
        return;
      }
      if (!item.parentPath) return;
      const parentIndex = visibleItems.findIndex((vi) => vi.node.path === item.parentPath);
      if (parentIndex >= 0) {
        focusItem(parentIndex);
      }
    },
    [expandedDirs, handleToggleDir, visibleItems, focusItem]
  );

  const handleActivate = useCallback(
    (item: FlatItem) => {
      if (item.node.isDir) {
        handleToggleDir(item.node.path);
      } else {
        handleSelectFile(item.node.path);
      }
    },
    [handleToggleDir, handleSelectFile]
  );

  const handleTreeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const item = visibleItems[focusIndex];
      if (!item) return;

      const handlers: Record<string, () => void> = {
        ArrowDown: () => handleArrowDown(),
        ArrowUp: () => handleArrowUp(),
        ArrowRight: () => handleArrowRight(item),
        ArrowLeft: () => handleArrowLeft(item),
        Home: () => focusItem(0),
        End: () => focusItem(visibleItems.length - 1),
        Enter: () => handleActivate(item),
        ' ': () => handleActivate(item),
      };

      const handler = handlers[e.key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    },
    [
      visibleItems,
      focusIndex,
      handleArrowDown,
      handleArrowUp,
      handleArrowRight,
      handleArrowLeft,
      handleActivate,
      focusItem,
    ]
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
