/**
 * Directory Picker Component
 * Platform-agnostic directory selection UI
 * - Desktop: Uses Tauri native dialog
 * - Web: Uses webkitdirectory
 */
import { useState, useRef, useEffect } from 'react';
import { platform } from '@/lib/platform';
import {
  useProtoUploadEvents,
  useProtoIndexEvents,
} from '@/lib/platform/hooks';

interface DirectoryPickerProps {
  onDirectorySelected?: (rootId: string) => void;
  onError?: (error: string) => void;
  className?: string;
  buttonText?: string;
}

export function DirectoryPicker({
  onDirectorySelected,
  onError,
  className = '',
  buttonText = 'Select Proto Directory',
}: DirectoryPickerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [localDirectories, setLocalDirectories] = useState<string[]>([]);
  const [serverDirectories, setServerDirectories] = useState<string[]>([]);
  const webInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (platform.type === 'web' && webInputRef.current) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - vendor specific attribute
      webInputRef.current.setAttribute('webkitdirectory', '');
    }
  }, []);

  // Subscribe to upload events (web only)
  useProtoUploadEvents(
    () => setStatus('Uploading files...'),
    payload => {
      setStatus(`Uploaded ${payload.uploaded_count} files successfully`);
      if (payload.directories) {
        setServerDirectories(payload.directories);
      }
    },
    error => {
      setStatus(`Upload error: ${error}`);
      onError?.(error);
    }
  );

  // Subscribe to index events (both platforms)
  useProtoIndexEvents(
    () => setStatus('Scanning proto files...'),
    payload => {
      setStatus(
        `Found ${payload.summary.services} services in ${payload.summary.files} files`
      );
      setIsProcessing(false);
    }
  );

  const handleSelectDirectory = async () => {
    try {
      setIsProcessing(true);
      setStatus('Selecting directory...');

      // Step 1: Select directory (platform-agnostic)
  const result = await platform.proto.selectDirectory();

      if (!result.path && !result.files) {
        throw new Error('No directory selected');
      }

      setSelectedPath(result.path || 'Selected directory');

      if (platform.type === 'desktop') {
        // Desktop: Register path and scan
        setStatus('Registering proto root...');
        const rootId = await platform.proto.registerProtoRoot(result.path!);

        setStatus('Scanning proto files...');
        await platform.proto.scanProtoRoot(rootId);

        onDirectorySelected?.(rootId);
      } else {
        // Web: Use existing session, upload files, then analyze
        const sessionId = await platform.proto.registerProtoRoot(
          result.path || 'Proto Files'
        );

        if (result.files && platform.proto.uploadProtoStructure) {
          // Build relative (stripped) paths before upload for preview
          const files = result.files;
          if (files.length > 0) {
            const first = files[0];
            const firstRel = (first as File & { webkitRelativePath?: string }).webkitRelativePath || first.name;
            const rootSegment = firstRel.includes('/') ? firstRel.split('/')[0] : '';
            const dirSet = new Set<string>();
            files.forEach(f => {
              const rawRel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
              const stripped = rootSegment && rawRel.startsWith(rootSegment + '/') ? rawRel.substring(rootSegment.length + 1) : rawRel;
              if (stripped.includes('/')) {
                const parts = stripped.split('/');
                let agg = '';
                parts.slice(0, -1).forEach(p => { agg = agg ? `${agg}/${p}` : p; dirSet.add(agg); });
              }
            });
            setLocalDirectories(Array.from(dirSet).sort());
            // Perform manual upload with stripped paths
            setStatus(`Uploading ${files.length} files...`);
            const formData = new FormData();
            files.forEach(f => {
              const rawRel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
              const effective = rootSegment && rawRel.startsWith(rootSegment + '/') ? rawRel.substring(rootSegment.length + 1) : rawRel;
              formData.append('files', f, effective);
            });
            formData.append('sessionId', sessionId);
            formData.append('clientStripped', 'true');
            const resp = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/api/proto/upload-structure`, { method: 'POST', body: formData });
            if (!resp.ok) {
              throw new Error(`Upload failed: ${await resp.text()}`);
            }
          }

          setStatus('Analyzing dependencies...');
          await platform.proto.scanProtoRoot(sessionId);

          onDirectorySelected?.(sessionId);
        } else {
          throw new Error('No files to upload');
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';

      if (errorMsg.includes('cancelled') || errorMsg.includes('No files')) {
        setStatus('');
      } else {
        setStatus(`Error: ${errorMsg}`);
        onError?.(errorMsg);
      }

      setIsProcessing(false);
    }
  };

  const handleWebInputChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    if (platform.type !== 'web') return;
    try {
      setIsProcessing(true);
      const fileList = Array.from(e.target.files || []);
      if (fileList.length === 0) { setIsProcessing(false); return; }
      // Derive pseudo path (root folder) from first file
      const first = fileList[0];
      const firstRel = (first as File & { webkitRelativePath?: string }).webkitRelativePath || first.name;
      const rootSegment = firstRel.includes('/') ? firstRel.split('/')[0] : 'Proto Files';
      setSelectedPath(rootSegment);
      setStatus('Registering proto root...');
      const sessionId = await platform.proto.registerProtoRoot(rootSegment);
      // Build directory preview + manual upload (similar to existing branch logic)
      const dirSet = new Set<string>();
      fileList.forEach(f => {
        const rawRel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        const stripped = rootSegment && rawRel.startsWith(rootSegment + '/') ? rawRel.substring(rootSegment.length + 1) : rawRel;
        if (stripped.includes('/')) {
          const parts = stripped.split('/');
            let agg = '';
            parts.slice(0, -1).forEach(p => { agg = agg ? `${agg}/${p}` : p; dirSet.add(agg); });
        }
      });
      setLocalDirectories(Array.from(dirSet).sort());
      setStatus(`Uploading ${fileList.length} files...`);
      const formData = new FormData();
      fileList.forEach(f => {
        const rawRel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        const effective = rootSegment && rawRel.startsWith(rootSegment + '/') ? rawRel.substring(rootSegment.length + 1) : rawRel;
        formData.append('files', f, effective);
      });
      formData.append('sessionId', sessionId);
      formData.append('clientStripped', 'true');
      const resp = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/api/proto/upload-structure`, { method: 'POST', body: formData });
      if (!resp.ok) { throw new Error(`Upload failed: ${await resp.text()}`); }
      setStatus('Analyzing dependencies...');
      await platform.proto.scanProtoRoot(sessionId);
      onDirectorySelected?.(sessionId);
    } catch(err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setStatus(`Error: ${msg}`);
      onError?.(msg);
    } finally {
      setIsProcessing(false);
      // reset input value to allow re-selecting same folder
      e.target.value = '';
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        {platform.type === 'web' ? (
          <label className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium cursor-pointer">
            <input
              ref={webInputRef}
              id="filepicker"
              name="fileList"
              type="file"
              multiple
              className="hidden"
              onChange={handleWebInputChange}
              disabled={isProcessing}
            />
            {isProcessing ? 'Processing...' : buttonText}
          </label>
        ) : (
          <button
            onClick={handleSelectDirectory}
            disabled={isProcessing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isProcessing ? 'Processing...' : buttonText}
          </button>
        )}
      </div>

      {selectedPath && (
        <div className="text-sm text-gray-600">
          <span className="font-medium">Selected:</span> {selectedPath}
        </div>
      )}

      {status && (
        <div
          className={`p-3 rounded-lg text-sm ${
            status.includes('error') || status.includes('Error')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : status.includes('success') || status.includes('Found')
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}
        >
          {localDirectories.length > 0 && (
            <div className="mt-1 text-[11px] opacity-70">
              Local dirs: {localDirectories.length} ({localDirectories.join(', ')})
            </div>
          )}
          {serverDirectories.length > 0 && (
            <div className="mt-1 text-[11px] opacity-70">
              Server dirs: {serverDirectories.length}
            </div>
          )}
        </div>
      )}

      {platform.type === 'web' && (
        <p className="text-xs text-gray-500">
          Note: Web version requires uploading proto files. Directory structure
          will be preserved for import resolution.
        </p>
      )}
    </div>
  );
}
