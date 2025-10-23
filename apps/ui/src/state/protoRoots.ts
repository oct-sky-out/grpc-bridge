import { create } from 'zustand';

export interface ProtoRootInfo {
  id: string;
  path: string;
  status: 'indexing' | 'ready' | 'error';
  summary?: { files: number; services: number };
}

export interface ProtoRootsState {
  roots: Record<string, ProtoRootInfo>;
  addRoot: (r: ProtoRootInfo) => void;
  setIndexing: (id: string) => void;
  setIndexed: (id: string, summary: { files: number; services: number }) => void;
}

export const useProtoRootsStore = create<ProtoRootsState>((set): ProtoRootsState => ({
  roots: {},
  addRoot: (r) => set((s) => ({ roots: { ...s.roots, [r.id]: r } })),
  setIndexing: (id) => set((s) => {
    const target = s.roots[id];
    if (!target) return {} as any;
    return { roots: { ...s.roots, [id]: { ...target, status: 'indexing' } } };
  }),
  setIndexed: (id, summary) => set((s) => {
    const target = s.roots[id];
    if (!target) return {} as any;
    return { roots: { ...s.roots, [id]: { ...target, status: 'ready', summary } } };
  })
}));
