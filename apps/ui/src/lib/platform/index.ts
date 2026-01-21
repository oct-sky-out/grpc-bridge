/**
 * Platform Abstraction Layer
 * Automatically detects and provides the correct platform adapter
 */

import type { PlatformAdapter } from './types';
import { DesktopAdapter } from './desktop-adapter';
import { WebAdapter } from './web-adapter';

export * from './types';

// ============================================================================
// Platform Detection
// ============================================================================

/**
 * Detect if the app is running in Tauri (desktop)
 */
function isTauri(): boolean {
  // Check if window.__TAURI__ exists (injected by Tauri)
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Detect the current platform
 */
export function detectPlatform(): 'desktop' | 'web' {
  // First check build-time environment variable
  const buildPlatform = import.meta.env.VITE_PLATFORM;
  console.log('[Platform] VITE_PLATFORM:', buildPlatform);
  
  if (buildPlatform === 'web' || buildPlatform === 'desktop') {
    console.log('[Platform] Using build-time platform:', buildPlatform);
    return buildPlatform;
  }

  // Fallback to runtime detection
  const hasTauri = isTauri();
  const runtimePlatform = hasTauri ? 'desktop' : 'web';
  console.log('[Platform] Using runtime detection:', runtimePlatform, '(Tauri:', hasTauri, ')');
  return runtimePlatform;
}

// ============================================================================
// Platform Adapter Factory
// ============================================================================

let platformInstance: PlatformAdapter | null = null;

/**
 * Get the platform adapter instance (singleton)
 */
export function getPlatform(): PlatformAdapter {
  if (!platformInstance) {
    const platformType = detectPlatform();
    console.log(`[Platform] Detected platform: ${platformType}`);

    if (platformType === 'desktop') {
      platformInstance = new DesktopAdapter();
    } else {
      platformInstance = new WebAdapter();
    }
  }

  return platformInstance;
}

/**
 * Initialize the platform adapter
 * Should be called once on app startup
 */
export async function initializePlatform(): Promise<PlatformAdapter> {
  const platform = getPlatform();
  await platform.initialize();
  return platform;
}

/**
 * Cleanup the platform adapter
 * Should be called on app unmount
 */
export function cleanupPlatform(): void {
  if (platformInstance) {
    platformInstance.cleanup();
    platformInstance = null;
  }
}

// ============================================================================
// React Hook (optional, for convenience)
// ============================================================================

/**
 * React hook to access the platform adapter
 * @example
 * const platform = usePlatform();
 * await platform.proto.registerProtoRoot('/path/to/protos');
 */
export function usePlatform(): PlatformAdapter {
  return getPlatform();
}

// ============================================================================
// Default Export (for convenience)
// ============================================================================

/**
 * Default platform instance
 * Can be used directly in non-React code
 */
export const platform = getPlatform();
