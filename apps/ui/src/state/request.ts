import { create } from 'zustand';

export interface LastResponse { ok: boolean; data: unknown; at: number; }

export interface HeaderKV { id: string; key: string; value: string; }

export interface RequestState {
  busy: boolean;
  indexing: boolean;
  rootPath: string;          // user selected proto root path
  rootId?: string;           // registered backend id
  knownRoots: { id: string; path: string }[];
  protoFilesInput: string;   // newline separated proto files
  target: string;
  service: string;
  method: string;
  payload: string;
  lastSentPayload?: string;
  showDiff: boolean;         // show diff between current and last sent payload
  headers: HeaderKV[];
  authToken: string;
  autoAuth: boolean;
  lastResponse?: LastResponse;
  setBusy: (b: boolean) => void;
  setIndexing: (b: boolean) => void;
  setRootPath: (v: string) => void;
  setRootId: (v?: string) => void;
  addKnownRoot: (r: { id: string; path: string }) => void;
  removeKnownRoot: (id: string) => void;
  setKnownRoots: (r: { id: string; path: string }[]) => void;
  setProtoFilesInput: (v: string) => void;
  setTarget: (v: string) => void;
  setService: (v: string) => void;
  setMethod: (v: string) => void;
  setPayload: (v: string) => void;
  setAuthToken: (v: string) => void;
  setAutoAuth: (v: boolean) => void;
  setLastSentPayload: (v: string) => void;
  setShowDiff: (v: boolean | ((prev: boolean) => boolean)) => void;
  addHeader: () => void;
  updateHeader: (id: string, key: 'key' | 'value', value: string) => void;
  removeHeader: (id: string) => void;
  setLastResponse: (r: LastResponse) => void;
  resetResponse: () => void;
}

export const useRequestStore = create<RequestState>((set): RequestState => ({
  busy: false,
  indexing: false,
  rootPath: '',
  knownRoots: [],
  protoFilesInput: '',
  target: 'localhost:50051',
  service: '',
  method: '',
  payload: '',
  lastSentPayload: undefined,
  showDiff: false,
  headers: [],
  authToken: '',
  autoAuth: true,
  setBusy: (b) => set({ busy: b }),
  setIndexing: (b) => set({ indexing: b }),
  setRootPath: (v) => set({ rootPath: v }),
  setRootId: (v) => set({ rootId: v }),
  addKnownRoot: (r) => set(s => ({ knownRoots: [r, ...s.knownRoots.filter(k => k.id !== r.id)] })),
  removeKnownRoot: (id) => set(s => ({ knownRoots: s.knownRoots.filter(k => k.id !== id) })),
  setKnownRoots: (r) => set({ knownRoots: r }),
  setProtoFilesInput: (v) => set({ protoFilesInput: v }),
  setTarget: (v) => set({ target: v }),
  setService: (v) => set({ service: v }),
  setMethod: (v) => set({ method: v }),
  setPayload: (v) => set({ payload: v }),
  setAuthToken: (v) => set({ authToken: v }),
  setAutoAuth: (v) => set({ autoAuth: v }),
  setLastSentPayload: (v) => set({ lastSentPayload: v }),
  setShowDiff: (v) => set((s) => ({ showDiff: typeof v === 'function' ? v(s.showDiff) : v })),
  addHeader: () => set(s => ({ headers: [...s.headers, { id: crypto.randomUUID(), key: '', value: '' }] })),
  updateHeader: (id, keyField, value) => set(s => ({ headers: s.headers.map(h => h.id === id ? { ...h, [keyField]: value } : h) })),
  removeHeader: (id) => set(s => ({ headers: s.headers.filter(h => h.id !== id) })),
  setLastResponse: (r) => set({ lastResponse: r }),
  resetResponse: () => set({ lastResponse: undefined })
}));
