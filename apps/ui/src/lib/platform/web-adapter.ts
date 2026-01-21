/**
 * Web Platform Adapter (HTTP API + WebSocket)
 * Communicates with Go backend for proto management and gRPC calls
 */
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
// Configuration
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';

// ---------------------------------------------------------------------------
// Helper utilities (local to web adapter)
// ---------------------------------------------------------------------------
function safeJsonParse(txt: string): unknown {
  try {
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

interface HeaderKV { id: string; key: string; value: string; }
function headersArrayToMap(headers?: HeaderKV[]): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string> = {};
  headers.filter(h => h.key.trim() !== '').forEach(h => { out[h.key] = h.value; });
  return out;
}

// ============================================================================
// Web Event Manager (EventEmitter-like)
// ============================================================================

class WebEventManager implements EventManager {
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor() {
    this.connect();
  }

  private connect(): void {
    try {
      const sessionId = this.getSessionId();
      this.ws = new WebSocket(`${WS_BASE_URL}/api/ws?sessionId=${sessionId}`);

      this.ws.onopen = () => {
        console.log('[WebEventManager] WebSocket connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const { event: eventName, payload } = message;
          console.log('[WebEventManager] Received event:', eventName, payload);
          this.emit(eventName, payload);
        } catch (error) {
          console.error('[WebEventManager] Failed to parse message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('[WebEventManager] WebSocket closed');
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WebEventManager] WebSocket error:', error);
      };
    } catch (error) {
      console.error('[WebEventManager] Failed to connect:', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebEventManager] Max reconnect attempts reached');
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`[WebEventManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private getSessionId(): string {
    let sessionId = localStorage.getItem('grpc-bridge-session-id');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem('grpc-bridge-session-id', sessionId);
    }
    return sessionId;
  }

  on<T>(event: string, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        callbacks.delete(callback as EventCallback);
        if (callbacks.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  emit<T>(event: string, payload: T): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(payload);
        } catch (error) {
          console.error(`[WebEventManager] Error in callback for ${event}:`, error);
        }
      });
    }
  }

  off(event: string): void {
    this.listeners.delete(event);
  }

  cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.listeners.clear();
  }
}

// ============================================================================
// HTTP Client Helper
// ============================================================================

class HTTPClient {
  private baseURL: string;
  private sessionId: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.sessionId = this.getOrCreateSessionId();
  }

  private getOrCreateSessionId(): string {
    let sessionId = localStorage.getItem('grpc-bridge-session-id');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem('grpc-bridge-session-id', sessionId);
    }
    return sessionId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      // Server expects X-Session-ID (uppercase D). Use that; keep legacy key only if ever needed.
      'X-Session-ID': this.sessionId,
      ...options.headers,
    };

    try {
          const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      return response.json();
    } catch (error) {
          console.error(`[HTTPClient] Request failed: ${endpoint}`, error);
          throw error;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

// ============================================================================
// Web Proto Manager
// ============================================================================

class WebProtoManager implements ProtoManager {
  private client: HTTPClient;
  private roots: Map<string, ProtoRoot> = new Map();

  constructor(client: HTTPClient) {
    this.client = client;
  }

  async selectDirectory(): Promise<{ path?: string; files?: File[] }> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.multiple = true;

      input.onchange = event => {
        const target = event.target as HTMLInputElement;
        const files = Array.from(target.files || []);

        if (files.length === 0) {
          reject(new Error('No files selected'));
          return;
        }

        // Filter only .proto files
        const protoFiles = files.filter(f => f.name.endsWith('.proto'));

        if (protoFiles.length === 0) {
          reject(new Error('No .proto files found in selected directory'));
          return;
        }

        // Get directory name from first file's path
        const firstFile = protoFiles[0];
        const relativePath = firstFile.webkitRelativePath || firstFile.name;
        const dirName = relativePath.split('/')[0] || 'Proto Files';

        resolve({ path: dirName, files: protoFiles });
      };

      input.onerror = () => {
        reject(new Error('Directory selection failed'));
      };

      input.click();
    });
  }

  async registerProtoRoot(name: string): Promise<string> {
    // For web, registerProtoRoot uses the existing session ID
    // This ensures all proto uploads go to the same session
    const sessionId = this.client.getSessionId();
    
    // Check if session already exists on server
    try {
      await this.client.get(`/api/sessions/${sessionId}`);
      console.log(`[WebProtoManager] Reusing existing session: ${sessionId}`);
    } catch (error) {
      // Session doesn't exist, create it
      console.log(`[WebProtoManager] Creating new session: ${sessionId}`);
      await this.client.post('/api/sessions', { name });
    }

    const root: ProtoRoot = {
      id: sessionId,
      path: name, // Display name
      last_scan: Date.now(),
    };
    this.roots.set(sessionId, root);
    return sessionId;
  }

  async listProtoRoots(): Promise<ProtoRoot[]> {
    return Array.from(this.roots.values());
  }

  async scanProtoRoot(rootId: string): Promise<void> {
    // For web, scanning means analyzing the uploaded proto files
    // This triggers proto://index_start and proto://index_done events
    await this.client.get(`/api/sessions/${rootId}/analyze`);
  }

  async listProtoFiles(rootId: string): Promise<string[]> {
    const response = await this.client.get<{
      files: Array<{ relative_path: string }>;
    }>(`/api/sessions/${rootId}/files`);
    return response.files.map(f => f.relative_path);
  }

  async removeProtoRoot(rootId: string): Promise<void> {
    // Delete session on server
    await this.client.delete(`/api/sessions/${rootId}`);
    this.roots.delete(rootId);
  }

  /**
   * Upload proto files using webkitdirectory (preserves directory structure)
   */
  async uploadProtoStructure(sessionId: string, files: File[], opts?: { stripRoot?: string }): Promise<void> {
    const formData = new FormData();

    const stripRoot = opts?.stripRoot;
    files.forEach(file => {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      let effective = rel;
      if (stripRoot && rel.startsWith(stripRoot + '/')) {
        const candidate = rel.substring(stripRoot.length + 1);
        // Only adopt stripped path if it isn't empty and preserves folder depth semantics
        effective = candidate.length > 0 ? candidate : rel;
      }
      formData.append('files', file, effective);
    });
    formData.append('sessionId', sessionId);

    const response = await fetch(`${API_BASE_URL}/api/proto/upload-structure`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Upload failed: ${error}`);
    }

    // Update last scan time
    const root = this.roots.get(sessionId);
    if (root) {
      root.last_scan = Date.now();
    }
  }
}

// ============================================================================
// Web gRPC Manager
// ============================================================================

class WebGRPCManager implements GRPCManager {
  private client: HTTPClient;

  constructor(client: HTTPClient) {
    this.client = client;
  }

  async listServices(rootId?: string, target?: string): Promise<ServiceMeta[]> {
    const response = await this.client.post<{ services: ServiceMeta[]; source?: string }>(
      '/api/grpc/services',
      {
        sessionId: this.client.getSessionId(),
        rootId,
        target: target || '', // If empty, server will read from proto files
        plaintext: true, // Default to plaintext for development
      }
    );
    
    console.log(`[WebGRPCManager] listServices source: ${response.source || 'unknown'}, count: ${response.services.length}`);
    return response.services;
  }

  async getMethodSkeleton(fqService: string, method: string): Promise<string> {
    const response = await this.client.post<{ skeleton: string }>(
      '/api/grpc/describe',
      {
        sessionId: this.client.getSessionId(),
        service: fqService,
        method,
      }
    );
    return response.skeleton;
  }

  async runGRPCCall(params: RunGRPCParams): Promise<void> {
    // Send request to backend, response will come via WebSocket
    await this.client.post('/api/grpc/call', {
      sessionId: this.client.getSessionId(),
      target: params.target,
      service: params.service,
      method: params.method,
      data: params.payload ? safeJsonParse(params.payload) : {},
      // params.headers may already be key/value pairs from UI; if it's a string[] fallback skip mapping
      metadata: Array.isArray(params.headers) && (params.headers as unknown as HeaderKV[])[0]?.key !== undefined
        ? headersArrayToMap(params.headers as unknown as HeaderKV[])
        : undefined,
      plaintext: true,
    });
  }
}

// ============================================================================
// Web Platform Adapter
// ============================================================================

export class WebAdapter implements PlatformAdapter {
  readonly type = 'web' as const;
  proto: ProtoManager;
  grpc: GRPCManager;
  events: EventManager;
  private client: HTTPClient;

  constructor() {
    this.client = new HTTPClient(API_BASE_URL);
    this.proto = new WebProtoManager(this.client);
    this.grpc = new WebGRPCManager(this.client);
    this.events = new WebEventManager();
  }

  async initialize(): Promise<void> {
    console.log('[WebAdapter] Initialized');

    // Ensure session exists
    try {
      const sessionId = this.client.getSessionId();
      console.log(`[WebAdapter] Using session ID: ${sessionId}`);
      
      // Try to get existing session
      try {
        const session = await this.client.get<{ session: { id: string } }>(`/api/sessions/${sessionId}`);
        // If server somehow returned different ID (should not) sync.
        if (session.session.id && session.session.id !== sessionId) {
          localStorage.setItem('grpc-bridge-session-id', session.session.id);
          (this.client as unknown as { sessionId: string }).sessionId = session.session.id;
          console.log(`[WebAdapter] Session ID updated from server: ${session.session.id}`);
        } else {
          console.log(`[WebAdapter] Existing session found:`, session);
        }
  } catch {
        // Session doesn't exist, create it
        console.log(`[WebAdapter] Session not found, creating new session: ${sessionId}`);
        const created = await this.client.post<{ session: { id: string } }>('/api/sessions', { 
          sessionId,
          name: 'Web Session'
        });
        if (created.session.id !== sessionId) {
          localStorage.setItem('grpc-bridge-session-id', created.session.id);
          (this.client as unknown as { sessionId: string }).sessionId = created.session.id;
          console.log(`[WebAdapter] Server chose different session ID: ${created.session.id}`);
        } else {
          console.log(`[WebAdapter] Session created:`, created);
        }
      }
    } catch (e) {
      console.error('[WebAdapter] Failed to initialize session:', e);
      throw e;
    }
  }

  cleanup(): void {
    this.events.off('proto://index_start');
    this.events.off('proto://index_done');
    this.events.off('grpc://response');
    this.events.off('grpc://error');
    (this.events as WebEventManager).cleanup();
    console.log('[WebAdapter] Cleaned up');
  }
}
