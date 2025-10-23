import { create } from 'zustand';

export interface CallRecord {
  id: string;
  at: number;
  target: string;
  service: string;
  method: string;
  payload: string;
  headers: { key: string; value: string }[];
  ok?: boolean;
  tookMs?: number;
}

interface HistoryState {
  calls: CallRecord[];
  push: (rec: Omit<CallRecord, 'id'|'at'|'ok'|'tookMs'>) => void;
  updatePending: (ok: boolean, tookMs?: number) => void;
  clearAll: () => void;
  remove: (id: string) => void;
  exportAll: () => string;
}

const load = (): CallRecord[] => {
  try { return JSON.parse(localStorage.getItem('grpc_history')||'[]'); } catch { return []; }
};
const save = (calls: CallRecord[]) => { try { localStorage.setItem('grpc_history', JSON.stringify(calls.slice(0,200))); } catch {} };

export const useHistoryStore = create<HistoryState>((set,get) => ({
  calls: load(),
  push: (r) => {
    const rec: CallRecord = { id: crypto.randomUUID(), at: Date.now(), ...r, ok: undefined, tookMs: undefined };
    const calls = [rec, ...get().calls].slice(0,200);
    save(calls);
    set({ calls });
  },
  updatePending: (ok, tookMs) => {
    const calls = get().calls.slice();
    if (calls.length > 0 && calls[0].ok === undefined) {
      calls[0] = { ...calls[0], ok, tookMs };
      save(calls);
      set({ calls });
    }
  },
  clearAll: () => { save([]); set({ calls: [] }); },
  remove: (id) => { const calls = get().calls.filter(c => c.id !== id); save(calls); set({ calls }); },
  exportAll: () => JSON.stringify(get().calls, null, 2)
}));
