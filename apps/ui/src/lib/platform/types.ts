/**
 * Platform abstraction layer types
 * Defines interfaces for desktop (Tauri) and web (HTTP API) implementations
 */
import type { ServiceMeta } from '@/state/services';

// ============================================================================
// Core Platform Interface
// ============================================================================

export interface PlatformAdapter {
  /**
   * Platform type identifier
   */
  type: 'desktop' | 'web';

  /**
   * Initialize the platform adapter
   * Called once on app startup
   */
  initialize(): Promise<void>;

  /**
   * Cleanup resources
   * Called on app unmount
   */
  cleanup(): void;

  /**
   * Proto file management
   */
  proto: ProtoManager;

  /**
   * gRPC call execution
   */
  grpc: GRPCManager;

  /**
   * Event system for real-time updates
   */
  events: EventManager;
}

// ============================================================================
// Proto File Management
// ============================================================================

export interface ProtoRoot {
  id: string;
  path: string;
  last_scan?: number;
}

export interface ProtoManager {
  /**
   * Select a directory containing proto files
   * Desktop: Opens native directory picker dialog
   * Web: Opens webkitdirectory file input
   * Returns directory path (desktop) or files array (web)
   */
  selectDirectory(): Promise<{ path?: string; files?: File[] }>;

  /**
   * Register a new proto root directory
   * Desktop: Registers local file system path
   * Web: Creates session and uploads files
   */
  registerProtoRoot(path: string): Promise<string>;

  /**
   * List all registered proto roots
   */
  listProtoRoots(): Promise<ProtoRoot[]>;

  /**
   * Scan proto root for proto files
   * Triggers index_start and index_done events
   */
  scanProtoRoot(rootId: string): Promise<void>;

  /**
   * List proto files in a root
   */
  listProtoFiles(rootId: string): Promise<string[]>;

  /**
   * Remove a proto root
   */
  removeProtoRoot(rootId: string): Promise<void>;

  /**
   * Upload proto files with directory structure (web only)
   * Uses webkitdirectory to preserve folder structure
   * Desktop: No-op, files are accessed from local file system
   */
  uploadProtoStructure?(sessionId: string, files: File[]): Promise<void>;
}

// ============================================================================
// gRPC Management
// ============================================================================

export interface RunGRPCParams {
  target: string;
  service: string;
  method: string;
  payload: string;
  proto_files: string[];
  root_id?: string;
  headers?: string[];
}

export interface GRPCResponse {
  raw: string;
  parsed?: any;
  took_ms: number;
}

export interface GRPCError {
  error: string;
  exit_code?: number;
  took_ms?: number;
  kind?: string;
}

export interface GRPCManager {
  /**
   * List available gRPC services
   */
  listServices(rootId?: string): Promise<ServiceMeta[]>;

  /**
   * Get method request skeleton
   */
  getMethodSkeleton(fqService: string, method: string): Promise<string>;

  /**
   * Execute gRPC call
   * Emits grpc://response or grpc://error events
   */
  runGRPCCall(params: RunGRPCParams): Promise<void>;
}

// ============================================================================
// Event System
// ============================================================================

export type EventCallback<T = any> = (payload: T) => void;

export interface EventManager {
  /**
   * Subscribe to an event
   * Returns unsubscribe function
   */
  on<T = any>(event: string, callback: EventCallback<T>): () => void;

  /**
   * Emit an event (internal use)
   */
  emit<T = any>(event: string, payload: T): void;

  /**
   * Remove all listeners for an event
   */
  off(event: string): void;
}

// ============================================================================
// Event Payloads
// ============================================================================

export interface ProtoIndexStartPayload {
  rootId: string;
}

export interface ProtoIndexDonePayload {
  rootId: string;
  summary: {
    files: number;
    services: number;
  };
  services: ServiceMeta[];
  files: string[];
}

export interface GRPCResponsePayload extends GRPCResponse {}

export interface GRPCErrorPayload extends GRPCError {}
