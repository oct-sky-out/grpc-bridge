/**
 * React hooks for platform abstraction layer
 */
import { useEffect, useState, useCallback } from 'react';
import { platform } from './index';
import type {
  ProtoIndexDonePayload,
  GRPCResponsePayload,
  GRPCErrorPayload,
} from './types';

/**
 * Hook to subscribe to proto index events
 * Listens to proto://index_start and proto://index_done
 */
export function useProtoIndexEvents(
  onStart?: (rootId: string) => void,
  onDone?: (payload: ProtoIndexDonePayload) => void
) {
  useEffect(() => {
    const unsubStart = platform.events.on('proto://index_start', payload => {
      onStart?.(payload.rootId || payload.session_id);
    });

    const unsubDone = platform.events.on('proto://index_done', payload => {
      onDone?.(payload);
    });

    return () => {
      unsubStart();
      unsubDone();
    };
  }, [onStart, onDone]);
}

/**
 * Hook to subscribe to proto upload events (web only)
 * Listens to proto://upload_start, proto://upload_done, proto://upload_error
 */
export function useProtoUploadEvents(
  onStart?: () => void,
  onDone?: (payload: { uploaded_count: number; error_count: number }) => void,
  onError?: (error: string) => void
) {
  useEffect(() => {
    if (platform.type !== 'web') return;

    const unsubStart = platform.events.on('proto://upload_start', () => {
      onStart?.();
    });

    const unsubDone = platform.events.on('proto://upload_done', payload => {
      onDone?.(payload);
    });

    const unsubError = platform.events.on('proto://upload_error', payload => {
      onError?.(payload.error);
    });

    return () => {
      unsubStart();
      unsubDone();
      unsubError();
    };
  }, [onStart, onDone, onError]);
}

/**
 * Hook to subscribe to proto analyze events (web only)
 * Listens to proto://analyze_start and proto://analyze_done
 */
export function useProtoAnalyzeEvents(
  onStart?: () => void,
  onDone?: (payload: { missing_count: number; missing_stdlib: string[] }) => void
) {
  useEffect(() => {
    if (platform.type !== 'web') return;

    const unsubStart = platform.events.on('proto://analyze_start', () => {
      onStart?.();
    });

    const unsubDone = platform.events.on('proto://analyze_done', payload => {
      onDone?.(payload);
    });

    return () => {
      unsubStart();
      unsubDone();
    };
  }, [onStart, onDone]);
}

/**
 * Hook to subscribe to gRPC call events
 * Listens to grpc://response and grpc://error
 */
export function useGRPCCallEvents(
  onResponse?: (payload: GRPCResponsePayload) => void,
  onError?: (payload: GRPCErrorPayload) => void
) {
  useEffect(() => {
    const unsubResponse = platform.events.on('grpc://response', payload => {
      onResponse?.(payload);
    });

    const unsubError = platform.events.on('grpc://error', payload => {
      onError?.(payload);
    });

    return () => {
      unsubResponse();
      unsubError();
    };
  }, [onResponse, onError]);
}

/**
 * Hook to manage proto file upload with directory structure (web only)
 * Returns upload function and loading state
 */
export function useProtoUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (sessionId: string, files: File[]) => {
      if (platform.type !== 'web' || !platform.proto.uploadProtoStructure) {
        console.warn('uploadProtoStructure is only available on web platform');
        return;
      }

      setIsUploading(true);
      setError(null);

      try {
        await platform.proto.uploadProtoStructure(sessionId, files);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Upload failed';
        setError(errorMessage);
        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    []
  );

  return { upload, isUploading, error };
}

/**
 * Hook to handle directory selection (platform-agnostic)
 * Returns a function to trigger directory selection
 * Desktop: Opens native dialog
 * Web: Opens webkitdirectory input
 */
export function useDirectoryPicker() {
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);

  const pickDirectory = useCallback(async () => {
    setIsSelecting(true);
    try {
      const result = await platform.proto.selectDirectory();

      if (result.path) {
        setSelectedPath(result.path);
      }
      if (result.files) {
        setSelectedFiles(result.files);
      }

      return result;
    } finally {
      setIsSelecting(false);
    }
  }, []);

  return { pickDirectory, selectedPath, selectedFiles, isSelecting };
}

/**
 * Hook to manage proto roots (sessions)
 */
export function useProtoRoots() {
  const [roots, setRoots] = useState<
    Array<{ id: string; path: string; last_scan?: number }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadRoots = useCallback(async () => {
    setIsLoading(true);
    try {
      const rootList = await platform.proto.listProtoRoots();
      setRoots(rootList);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addRoot = useCallback(
    async (name: string) => {
      const rootId = await platform.proto.registerProtoRoot(name);
      await loadRoots();
      return rootId;
    },
    [loadRoots]
  );

  const removeRoot = useCallback(
    async (rootId: string) => {
      await platform.proto.removeProtoRoot(rootId);
      await loadRoots();
    },
    [loadRoots]
  );

  const scanRoot = useCallback(async (rootId: string) => {
    await platform.proto.scanProtoRoot(rootId);
  }, []);

  useEffect(() => {
    loadRoots();
  }, [loadRoots]);

  return {
    roots,
    isLoading,
    addRoot,
    removeRoot,
    scanRoot,
    refresh: loadRoots,
  };
}
