import { create } from 'zustand';

export interface ProtoFilesState {
  files: string[];                  // relative file paths
  selected: Record<string, boolean>; // file selection
  expanded: Record<string, boolean>; // folder expansion state keyed by folder path ('' root)
  setFiles: (f: string[]) => void;
  toggle: (path: string) => void;
  selectAll: () => void;
  clear: () => void;
  only: (path: string) => void;
  setSelected: (paths: string[], value: boolean) => void;
  toggleFolder: (folder: string) => void; // expand/collapse
  selectFolder: (folder: string, filesUnder: string[]) => void; // bulk toggle: if all selected -> unselect all, else select all
}

export const useProtoFiles = create<ProtoFilesState>((set, get) => ({
  files: [],
  selected: {},
  expanded: { '': true },
  setFiles: (f) => set({ files: f, selected: Object.fromEntries(f.map(p => [p, true])), expanded: { '': true } }),
  toggle: (p) => set(s => ({ selected: { ...s.selected, [p]: !s.selected[p] } })),
  selectAll: () => set(s => ({ selected: Object.fromEntries(s.files.map(p => [p, true])) })),
  clear: () => set({ selected: {} }),
  only: (p) => set({ selected: { [p]: true } }),
  setSelected: (paths, value) => set(s => {
    const sel = { ...s.selected };
    paths.forEach(p => { sel[p] = value; if (!value) delete sel[p]; });
    if (!value) { paths.forEach(p => { if (sel[p] === false) delete sel[p]; }); }
    return { selected: sel };
  }),
  toggleFolder: (folder) => set(s => ({ expanded: { ...s.expanded, [folder]: !s.expanded[folder] } })),
  selectFolder: (folder, filesUnder) => set(s => {
    const allSelected = filesUnder.every(f => s.selected[f]);
    const newSel = { ...s.selected };
    if (allSelected) { filesUnder.forEach(f => { delete newSel[f]; }); }
    else { filesUnder.forEach(f => { newSel[f] = true; }); }
    return { selected: newSel };
  })
}));
