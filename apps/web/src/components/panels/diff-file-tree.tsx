import type { DiffFile as SchemaDiffFile } from '@shipyard/loro-schema';
import { ChevronDown, ChevronRight, FileText, FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const EMPTY_FILES: readonly SchemaDiffFile[] = [];

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

function getOrCreateDir(
  dirMap: Map<string, TreeNode>,
  currentChildren: TreeNode[],
  part: string,
  currentPath: string
): TreeNode {
  let dirNode = dirMap.get(currentPath);
  if (!dirNode) {
    dirNode = { name: part, path: currentPath, isDir: true, children: [] };
    dirMap.set(currentPath, dirNode);
    currentChildren.push(dirNode);
  }
  return dirNode;
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
      const part = parts[i] ?? '';
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
        const dirNode = getOrCreateDir(dirMap, currentChildren, part, currentPath);
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

function collectDirPaths(files: readonly SchemaDiffFile[]): Set<string> {
  const dirs = new Set<string>();
  for (const file of files) {
    const parts = file.path.replace(/\/+$/, '').split('/');
    let p = '';
    for (let i = 0; i < parts.length - 1; i++) {
      p = p ? `${p}/${parts[i] ?? ''}` : (parts[i] ?? '');
      dirs.add(p);
    }
  }
  return dirs;
}

type DiffFileTreeProps = {
  selectedFile: string | null;
  onSelectFile: (path: string | null) => void;
  width: number;
} & (
  | { groupMode: 'flat'; files: readonly SchemaDiffFile[] }
  | {
      groupMode: 'staged-unstaged';
      stagedFiles: readonly SchemaDiffFile[];
      unstagedFiles: readonly SchemaDiffFile[];
    }
);

interface SectionState {
  tree: TreeNode[];
  expandedDirs: Set<string>;
  visibleItems: FlatItem[];
}

function useSectionState(files: readonly SchemaDiffFile[]): SectionState & {
  setExpandedDirs: React.Dispatch<React.SetStateAction<Set<string>>>;
} {
  const tree = useMemo(() => buildTree(files), [files]);

  const pathsKey = useMemo(
    () =>
      files
        .map((f) => f.path)
        .sort()
        .join('\n'),
    [files]
  );

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => collectDirPaths(files));

  const prevPathsKeyRef = useRef(pathsKey);
  useEffect(() => {
    if (prevPathsKeyRef.current !== pathsKey) {
      prevPathsKeyRef.current = pathsKey;
      setExpandedDirs(collectDirPaths(files));
    }
  }, [pathsKey, files]);

  const visibleItems = useMemo(
    () => flattenVisible(tree, expandedDirs, 0, null),
    [tree, expandedDirs]
  );

  return { tree, expandedDirs, setExpandedDirs, visibleItems };
}

const SECTION_HEADER_CLASSES =
  'text-[10px] text-muted font-medium uppercase tracking-wider px-2 py-1';

function DirTreeItem({
  node,
  index,
  paddingLeft,
  isExpanded,
  isFocused,
  itemRefs,
  onToggle,
}: {
  node: TreeNode;
  index: number;
  paddingLeft: number;
  isExpanded: boolean;
  isFocused: boolean;
  itemRefs: React.RefObject<Map<number, HTMLElement>>;
  onToggle: (path: string) => void;
}) {
  const Icon = isExpanded ? ChevronDown : ChevronRight;
  return (
    <div role="treeitem" aria-expanded={isExpanded} tabIndex={-1}>
      <button
        ref={(el) => {
          if (el) itemRefs.current.set(index, el);
          else itemRefs.current.delete(index);
        }}
        type="button"
        className="flex items-center gap-1 w-full py-0.5 text-xs text-muted hover:text-foreground hover:bg-default/50 transition-colors"
        style={{ paddingLeft }}
        tabIndex={isFocused ? 0 : -1}
        onClick={() => onToggle(node.path)}
      >
        <Icon className="w-3 h-3 shrink-0" />
        <FolderOpen className="w-3 h-3 shrink-0 text-muted" />
        <span className="truncate">{node.name}</span>
      </button>
    </div>
  );
}

function FileTreeItem({
  node,
  index,
  paddingLeft,
  isSelected,
  isFocused,
  itemRefs,
  onSelect,
}: {
  node: TreeNode;
  index: number;
  paddingLeft: number;
  isSelected: boolean;
  isFocused: boolean;
  itemRefs: React.RefObject<Map<number, HTMLElement>>;
  onSelect: (path: string) => void;
}) {
  const statusColor = STATUS_COLORS[node.status ?? ''] ?? 'text-muted';
  return (
    <div role="treeitem" aria-selected={isSelected} tabIndex={-1}>
      <button
        ref={(el) => {
          if (el) itemRefs.current.set(index, el);
          else itemRefs.current.delete(index);
        }}
        type="button"
        className={`flex items-center gap-1 w-full py-0.5 text-xs transition-colors ${
          isSelected ? 'bg-accent/15 text-foreground' : 'text-foreground/80 hover:bg-default/50'
        }`}
        style={{ paddingLeft }}
        tabIndex={isFocused ? 0 : -1}
        onClick={() => onSelect(node.path)}
      >
        <FileText className="w-3 h-3 shrink-0 text-muted" />
        <span className="truncate flex-1 text-left">{node.name}</span>
        <span className={`font-mono text-[10px] shrink-0 pr-2 ${statusColor}`}>{node.status}</span>
      </button>
    </div>
  );
}

export function DiffFileTree(props: DiffFileTreeProps) {
  const { selectedFile, onSelectFile, width } = props;

  const stagedFiles = props.groupMode === 'staged-unstaged' ? props.stagedFiles : EMPTY_FILES;
  const unstagedFiles = props.groupMode === 'staged-unstaged' ? props.unstagedFiles : EMPTY_FILES;
  const flatFiles = props.groupMode === 'flat' ? props.files : EMPTY_FILES;

  const {
    visibleItems: stagedItems,
    expandedDirs: stagedExpanded,
    setExpandedDirs: setStagedExpanded,
  } = useSectionState(stagedFiles);
  const {
    visibleItems: unstagedItems,
    expandedDirs: unstagedExpanded,
    setExpandedDirs: setUnstagedExpanded,
  } = useSectionState(unstagedFiles);
  const {
    visibleItems: flatItems,
    expandedDirs: flatExpanded,
    setExpandedDirs: setFlatExpanded,
  } = useSectionState(flatFiles);

  const allVisibleItems = useMemo(() => {
    if (props.groupMode === 'flat') {
      return flatItems;
    }
    return [...stagedItems, ...unstagedItems];
  }, [props.groupMode, flatItems, stagedItems, unstagedItems]);

  const [focusIndex, setFocusIndex] = useState(0);
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map());

  useEffect(() => {
    if (focusIndex >= allVisibleItems.length && allVisibleItems.length > 0) {
      setFocusIndex(allVisibleItems.length - 1);
    }
  }, [allVisibleItems.length, focusIndex]);

  const toggleDir = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Set<string>>>, path: string) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    },
    []
  );

  const handleToggleFlatDir = useCallback(
    (path: string) => toggleDir(setFlatExpanded, path),
    [toggleDir, setFlatExpanded]
  );

  const handleToggleStagedDir = useCallback(
    (path: string) => toggleDir(setStagedExpanded, path),
    [toggleDir, setStagedExpanded]
  );

  const handleToggleUnstagedDir = useCallback(
    (path: string) => toggleDir(setUnstagedExpanded, path),
    [toggleDir, setUnstagedExpanded]
  );

  const handleToggleDir = useCallback(
    (path: string) => {
      if (props.groupMode === 'flat') {
        handleToggleFlatDir(path);
      } else {
        const inStaged = stagedItems.some((vi) => vi.node.path === path);
        if (inStaged) {
          handleToggleStagedDir(path);
        } else {
          handleToggleUnstagedDir(path);
        }
      }
    },
    [
      props.groupMode,
      stagedItems,
      handleToggleFlatDir,
      handleToggleStagedDir,
      handleToggleUnstagedDir,
    ]
  );

  const expandedDirsUnion = useMemo(() => {
    if (props.groupMode === 'flat') {
      return flatExpanded;
    }
    return new Set([...stagedExpanded, ...unstagedExpanded]);
  }, [props.groupMode, flatExpanded, stagedExpanded, unstagedExpanded]);

  const handleSelectFile = useCallback(
    (path: string) => {
      onSelectFile(path);
    },
    [onSelectFile]
  );

  const focusItem = useCallback((index: number) => {
    setFocusIndex(index);
    itemRefs.current.get(index)?.focus();
  }, []);

  const handleArrowRight = useCallback(
    (item: FlatItem) => {
      if (item.node.isDir) {
        if (!expandedDirsUnion.has(item.node.path)) {
          handleToggleDir(item.node.path);
        } else if (focusIndex < allVisibleItems.length - 1) {
          focusItem(focusIndex + 1);
        }
      }
    },
    [expandedDirsUnion, handleToggleDir, focusIndex, allVisibleItems.length, focusItem]
  );

  const handleArrowLeft = useCallback(
    (item: FlatItem) => {
      if (item.node.isDir && expandedDirsUnion.has(item.node.path)) {
        handleToggleDir(item.node.path);
      } else if (item.parentPath) {
        const parentIndex = allVisibleItems.findIndex((vi) => vi.node.path === item.parentPath);
        if (parentIndex >= 0) {
          focusItem(parentIndex);
        }
      }
    },
    [expandedDirsUnion, handleToggleDir, allVisibleItems, focusItem]
  );

  const handleActivateItem = useCallback(
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
      const item = allVisibleItems[focusIndex];
      if (!item) return;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          if (focusIndex < allVisibleItems.length - 1) focusItem(focusIndex + 1);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          if (focusIndex > 0) focusItem(focusIndex - 1);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          handleArrowRight(item);
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          handleArrowLeft(item);
          break;
        }
        case 'Home': {
          e.preventDefault();
          focusItem(0);
          break;
        }
        case 'End': {
          e.preventDefault();
          if (allVisibleItems.length > 0) focusItem(allVisibleItems.length - 1);
          break;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          handleActivateItem(item);
          break;
        }
      }
    },
    [allVisibleItems, focusIndex, focusItem, handleArrowRight, handleArrowLeft, handleActivateItem]
  );

  const totalFiles =
    props.groupMode === 'flat' ? flatFiles.length : stagedFiles.length + unstagedFiles.length;

  if (totalFiles === 0) return null;

  const renderTreeItems = (
    items: FlatItem[],
    indexOffset: number,
    onToggle: (path: string) => void
  ) =>
    items.map((item, localIndex) => {
      const index = indexOffset + localIndex;
      const { node, depth } = item;
      const paddingLeft = 8 + depth * 12;

      if (node.isDir) {
        return (
          <DirTreeItem
            key={node.path}
            node={node}
            index={index}
            paddingLeft={paddingLeft}
            isExpanded={expandedDirsUnion.has(node.path)}
            isFocused={focusIndex === index}
            itemRefs={itemRefs}
            onToggle={onToggle}
          />
        );
      }

      return (
        <FileTreeItem
          key={node.path}
          node={node}
          index={index}
          paddingLeft={paddingLeft}
          isSelected={selectedFile === node.path}
          isFocused={focusIndex === index}
          itemRefs={itemRefs}
          onSelect={handleSelectFile}
        />
      );
    });

  return (
    <div
      className="shrink-0 border-r border-separator/50 flex flex-col h-full overflow-hidden"
      style={{ width }}
    >
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden py-1"
        role="tree"
        aria-label="Changed files"
        onKeyDown={handleTreeKeyDown}
      >
        {props.groupMode === 'flat' ? (
          <div
            role="group"
            aria-label={`${flatFiles.length} file${flatFiles.length !== 1 ? 's' : ''}`}
          >
            <div role="presentation" className={SECTION_HEADER_CLASSES}>
              {flatFiles.length} file{flatFiles.length !== 1 ? 's' : ''}
            </div>
            {renderTreeItems(flatItems, 0, handleToggleFlatDir)}
          </div>
        ) : (
          <>
            {stagedFiles.length > 0 && (
              <div role="group" aria-label={`Staged (${stagedFiles.length})`}>
                <div role="presentation" className={SECTION_HEADER_CLASSES}>
                  Staged ({stagedFiles.length})
                </div>
                {renderTreeItems(stagedItems, 0, handleToggleStagedDir)}
              </div>
            )}
            {unstagedFiles.length > 0 && (
              <div role="group" aria-label={`Unstaged (${unstagedFiles.length})`}>
                <div role="presentation" className={SECTION_HEADER_CLASSES}>
                  Unstaged ({unstagedFiles.length})
                </div>
                {renderTreeItems(unstagedItems, stagedItems.length, handleToggleUnstagedDir)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
