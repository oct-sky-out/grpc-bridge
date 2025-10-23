import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  PlatformAdapter,
  ProtoManager,
  GRPCManager,
  EventManager,
  ProtoRoot,
  RunGRPCParams,
  EventCallback,
} from './types';
import type { ServiceMeta } from '@/state/services';

// ============================================================================
// Desktop Event Manager
// ============================================================================

class DesktopEventManager implements EventManager {
  private listeners: Map<string, UnlistenFn[]> = new Map();

  on<T = any>(event: string, callback: EventCallback<T>): () => void {
    const unlistenPromise = listen(event, (e: any) => {
      callback(e.payload);
    });

    // Store the promise to unlisten later
    unlistenPromise.then((unlisten) => {
      const existing = this.listeners.get(event) || [];
      this.listeners.set(event, [...existing, unlisten]);
    });

    // Return unsubscribe function
    return () => {
      unlistenPromise.then((unlisten) => {
        unlisten();
        const existing = this.listeners.get(event) || [];
        this.listeners.set(
          event,
          existing.filter((fn) => fn !== unlisten)
        );
      });
    };
  }

  emit<T = any>(_event: string, _payload: T): void {
    // Desktop doesn't emit events from frontend
    // Events are emitted from Rust backend
    console.warn('Desktop adapter does not emit events from frontend');
  }

  off(event: string): void {
    const listeners = this.listeners.get(event) || [];
    listeners.forEach((unlisten) => unlisten());
    this.listeners.delete(event);
  }

  cleanup(): void {
    // Unlisten all events
    this.listeners.forEach((listeners) => {
      listeners.forEach((unlisten) => unlisten());
    });
    this.listeners.clear();
  }
}

// ============================================================================
// Desktop Proto Manager
// ============================================================================

class DesktopProtoManager implements ProtoManager {
  async selectDirectory(): Promise<{ path?: string; files?: File[] }> {
    // Open native directory picker
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Proto Directory',
    });

    if (!selected) {
      throw new Error('Directory selection cancelled');
    }

    return { path: selected as string };
  }

  async registerProtoRoot(path: string): Promise<string> {
    return invoke<string>('register_proto_root', { path });
  }

  async listProtoRoots(): Promise<ProtoRoot[]> {
    return invoke<ProtoRoot[]>('list_proto_roots');
  }

  async scanProtoRoot(rootId: string): Promise<void> {
    await invoke('scan_proto_root', { rootId });
  }

  async listProtoFiles(rootId: string): Promise<string[]> {
    return invoke<string[]>('list_proto_files', { rootId });
  }

  async removeProtoRoot(rootId: string): Promise<void> {
    await invoke('remove_proto_root', { rootId });
  }
}

// ============================================================================
// Desktop gRPC Manager
// ============================================================================

class DesktopGRPCManager implements GRPCManager {
  async listServices(rootId?: string): Promise<ServiceMeta[]> {
    return invoke<ServiceMeta[]>('list_services', {
      rootId: rootId || undefined,
    });
  }

  async getMethodSkeleton(fqService: string, method: string): Promise<string> {
    return invoke<string>('get_method_skeleton', {
      fqService,
      method,
    });
  }

  async runGRPCCall(params: RunGRPCParams): Promise<void> {
    await invoke('run_grpc_call', {
      params: {
        target: params.target,
        service: params.service,
        method: params.method,
        payload: params.payload,
        proto_files: params.proto_files,
        rootId: params.root_id,
        headers: params.headers,
      },
    });
  }
}

// ============================================================================
// Desktop Platform Adapter
// ============================================================================

export class DesktopAdapter implements PlatformAdapter {
  type: 'desktop' = 'desktop';
  proto: ProtoManager;
  grpc: GRPCManager;
  events: EventManager;

  constructor() {
    this.proto = new DesktopProtoManager();
    this.grpc = new DesktopGRPCManager();
    this.events = new DesktopEventManager();
  }

  async initialize(): Promise<void> {
    console.log('[DesktopAdapter] Initialized');
  }

  cleanup(): void {
    this.events.off('proto://index_start');
    this.events.off('proto://index_done');
    this.events.off('grpc://response');
    this.events.off('grpc://error');
    console.log('[DesktopAdapter] Cleaned up');
  }
}
