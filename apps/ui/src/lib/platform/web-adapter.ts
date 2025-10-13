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

  on<T = any>(event: string, callback: EventCallback<T>): () => void {
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

  emit<T = any>(event: string, payload: T): void {
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
      'X-Session-Id': this.sessionId,
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

  async post<T>(endpoint: string, body?: any): Promise<T> {
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
      // @ts-expect-error webkitdirectory is not in TypeScript types
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
        // @ts-expect-error webkitRelativePath exists
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
    // For web, registerProtoRoot means creating a new session
    // The session ID becomes the root ID
    const response = await this.client.post<{ session: { id: string } }>(
      '/api/sessions',
      { name }
    );

    const rootId = response.session.id;
    const root: ProtoRoot = {
      id: rootId,
      path: name, // Display name
      last_scan: Date.now(),
    };
    this.roots.set(rootId, root);
    return rootId;
  }

  async listProtoRoots(): Promise<ProtoRoot[]> {
    return Array.from(this.roots.values());
  }

  async scanProtoRoot(rootId: string): Promise<void> {
    // For web, scanning means analyzing the uploaded proto files
    // This triggers proto://analyze_start and proto://analyze_done events
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
  async uploadProtoStructure(sessionId: string, files: File[]): Promise<void> {
    const formData = new FormData();

    // Add all files with their relative paths (browser provides this via webkitdirectory)
    files.forEach(file => {
      formData.append('files', file, file.webkitRelativePath || file.name);
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

  async listServices(rootId?: string): Promise<ServiceMeta[]> {
    const response = await this.client.post<{ services: ServiceMeta[] }>(
      '/api/grpc/services',
      {
        sessionId: this.client.getSessionId(),
        rootId,
      }
    );
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
      payload: params.payload,
      protoFiles: params.proto_files,
      rootId: params.root_id,
      headers: params.headers,
    });
  }
}

// ============================================================================
// Web Platform Adapter
// ============================================================================

export class WebAdapter implements PlatformAdapter {
  type: 'web' = 'web';
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

    // Create or retrieve session
    try {
      const sessionId = this.client.getSessionId();
      await this.client.post('/api/sessions', {
        sessionId,
      });
      console.log(`[WebAdapter] Session initialized: ${sessionId}`);
    } catch (error) {
      console.error('[WebAdapter] Failed to initialize session:', error);
      throw error;
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
