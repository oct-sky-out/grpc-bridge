"use client"

import type React from "react"
import { useMemo, useCallback, useState } from "react"
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { useProtoFiles } from '@/state/protoFiles';

export interface FileSystemItem {
  name: string
  type: "file" | "folder"
  children?: FileSystemItem[]
  size?: string
  modified?: string
  path?: string
}

interface NodeInternal {
  name: string;
  path: string;
  children?: NodeInternal[];
  file?: boolean;
}

interface DirectoryTreeProps {
  height?: number
  className?: string
}

interface TreeItemProps {
  item: FileSystemItem
  level: number
  selected: Record<string, boolean>
  toggle: (path: string) => void
  toggleFolder: (path: string) => void
  selectFolder: (path: string, files: string[]) => void
  expanded: Record<string, boolean>
}

const FileIcon = ({ name }: { name: string }) => {
  const extension = name.split(".").pop()?.toLowerCase()

  const getIconColor = () => {
    switch (extension) {
      case "tsx":
      case "ts":
        return "text-blue-500"
      case "js":
      case "jsx":
        return "text-yellow-500"
      case "css":
        return "text-pink-500"
      case "json":
        return "text-green-500"
      case "md":
        return "text-gray-500"
      case "html":
        return "text-orange-500"
      default:
        return "text-muted-foreground"
    }
  }

  return (
    <svg className={`w-5 h-5 ${getIconColor()}`} fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
        clipRule="evenodd"
      />
    </svg>
  )
}

const FolderIcon = ({ isOpen }: { isOpen: boolean }) => {
  return (
    <svg
      className={`w-5 h-5 ${isOpen ? "text-primary" : "text-muted-foreground"}`}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      {isOpen ? (
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      ) : (
        <path
          fillRule="evenodd"
          d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
          clipRule="evenodd"
        />
      )}
    </svg>
  )
}

const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => {
  return (
    <svg
      className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        fillRule="evenodd"
        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
        clipRule="evenodd"
      />
    </svg>
  )
}

const TreeItem: React.FC<TreeItemProps> = ({ item, level, selected, toggle, toggleFolder, selectFolder, expanded }) => {
  const isOpen = expanded[item.path || item.name] || false;
  const hasChildren = item.children && item.children.length > 0
  const isFolder = item.type === "folder";

  const collectFiles = useCallback((node: FileSystemItem): string[] => {
    if (node.type === "file") return [node.path || node.name];
    return (node.children || []).flatMap(collectFiles);
  }, []);

  const filesUnder = useMemo(() => isFolder ? collectFiles(item) : [], [isFolder, item, collectFiles]);
  const allSelected = isFolder ? filesUnder.every(f => selected[f]) : false;
  const partiallySelected = isFolder && !allSelected && filesUnder.some(f => selected[f]);

  const handleFolderClick = () => {
    if (isFolder) {
      toggleFolder(item.path || item.name);
    }
  };

  const handleCheckboxChange = () => {
    if (isFolder) {
      selectFolder(item.path || item.name, filesUnder);
    } else {
      toggle(item.path || item.name);
    }
  };

  const handleTextClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder) {
      handleFolderClick();
    } else {
      toggle(item.path || item.name);
    }
  };

  return (
    <div>
      <div
        className="flex items-center gap-1.5 text-[14px] py-1"
        style={{ paddingLeft: `${level * 15 + 8}px` }}
      >
        {isFolder && hasChildren && (
          <div onClick={handleFolderClick} className="cursor-pointer">
            <ChevronIcon isOpen={isOpen} />
          </div>
        )}
        {isFolder && !hasChildren && <div className="w-4 h-4" />}
        {!isFolder && <div className="w-4 h-4" />}

        <Checkbox
          className="h-5 w-5"
          checked={
            isFolder
              ? allSelected
                ? true
                : partiallySelected
                  ? ('indeterminate' as any)
                  : false
              : !!selected[item.path || item.name]
          }
          onCheckedChange={handleCheckboxChange}
        />

        <div
          className="cursor-pointer flex items-center gap-1.5"
          onClick={handleTextClick}
        >
          {isFolder ? <FolderIcon isOpen={isOpen} /> : <FileIcon name={item.name} />}
          <span className="font-medium">{item.name || '(root)'}</span>
        </div>
      </div>

      {isFolder && isOpen && hasChildren && (
        <div>
          {item.children!
            .sort((a, b) => {
              if ((a.type === "file") === (b.type === "file"))
                return a.name.localeCompare(b.name);
              return a.type === "file" ? 1 : -1;
            })
            .map((child, index) => (
            <TreeItem
              key={`${child.path || child.name}-${index}`}
              item={child}
              level={level + 1}
              selected={selected}
              toggle={toggle}
              toggleFolder={toggleFolder}
              selectFolder={selectFolder}
              expanded={expanded}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function buildTree(files: string[]): NodeInternal {
  const root: NodeInternal = { name: '', path: '', children: [] };
  for (const file of files) {
    const parts = file.split('/').filter(Boolean);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (!cur.children) cur.children = [];
      let next = cur.children.find(c => c.name === part);
      if (!next) {
        next = {
          name: part,
          path: (cur.path ? cur.path + '/' : '') + part,
          children: isFile ? undefined : [],
          file: isFile,
        };
        cur.children.push(next);
      }
      cur = next;
    }
  }
  return root;
}

function mapNodeToFileSystemItem(node: NodeInternal): FileSystemItem {
  return {
    name: node.name,
    type: node.file ? "file" : "folder",
    path: node.path,
    children: node.children ? node.children.map(mapNodeToFileSystemItem) : undefined
  };
}

function filterTreeItems(items: FileSystemItem[], query: string): FileSystemItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  const walk = (item: FileSystemItem): FileSystemItem | null => {
    const selfMatch = item.name.toLowerCase().includes(q);
    if (item.type === 'file') {
      return selfMatch ? item : null;
    }

    const children = (item.children || [])
      .map(walk)
      .filter((v): v is FileSystemItem => v !== null);

    if (selfMatch) {
      // If a directory itself matches, keep full subtree to make navigation easier.
      return item;
    }
    if (children.length > 0) {
      return { ...item, children };
    }
    return null;
  };

  return items
    .map(walk)
    .filter((v): v is FileSystemItem => v !== null);
}

export const DirectoryTree: React.FC<DirectoryTreeProps> = ({ height = 160, className = "" }) => {
  const files = useProtoFiles(s => s.files);
  const selected = useProtoFiles(s => s.selected);
  const expanded = useProtoFiles(s => s.expanded);
  const toggle = useProtoFiles(s => s.toggle);
  const toggleFolder = useProtoFiles(s => s.toggleFolder);
  const selectFolder = useProtoFiles(s => s.selectFolder);
  const [searchQuery, setSearchQuery] = useState('');

  const tree = useMemo(() => buildTree(files), [files]);

  const data: FileSystemItem[] = useMemo(() => {
    if (!tree.children) return [];
    return tree.children
      .sort((a, b) => {
        if (!!a.file === !!b.file) return a.name.localeCompare(b.name);
        return a.file ? 1 : -1;
      })
      .map(mapNodeToFileSystemItem);
  }, [tree]);

  const filteredData = useMemo(
    () => filterTreeItems(data, searchQuery),
    [data, searchQuery]
  );

  return (
    <div className={`space-y-2 ${className}`}>
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search files or directories"
      />
      <div
        className="border border-border rounded p-1 overflow-auto bg-card"
        style={{ maxHeight: height }}
      >
        {files.length === 0 && (
          <em className="opacity-70 text-[11px]">No proto files (scan root)</em>
        )}
        {files.length > 0 && filteredData.length === 0 && (
          <em className="opacity-70 text-[11px]">No matches</em>
        )}
        <div className="proto-tree text-card-foreground">
          {filteredData.map((item, index) => (
            <TreeItem
              key={`${item.path || item.name}-${index}`}
              item={item}
              level={0}
              selected={selected}
              toggle={toggle}
              toggleFolder={toggleFolder}
              selectFolder={selectFolder}
              expanded={expanded}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
