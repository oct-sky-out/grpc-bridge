import { create } from 'zustand';

export interface MethodMeta { name: string; input_type: string; output_type: string; streaming: boolean; }
export interface ServiceMeta { fq_service: string; file: string; methods: MethodMeta[]; }

interface ServicesState {
  services: ServiceMeta[];
  byService: Record<string, ServiceMeta>;
  setServices: (list: ServiceMeta[]) => void;
  reset: () => void;
}

export const useServicesStore = create<ServicesState>((set) => ({
  services: [],
  byService: {},
  setServices: (list) => set({ services: list, byService: Object.fromEntries(list.map(s => [s.fq_service, s])) }),
  reset: () => set({ services: [], byService: {} })
}));
