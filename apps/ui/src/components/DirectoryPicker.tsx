/**
 * Directory Picker Component
 * Platform-agnostic directory selection UI
 * - Desktop: Uses Tauri native dialog
 * - Web: Uses webkitdirectory
 */
import { useState } from 'react';
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

  // Subscribe to events
  useProtoUploadEvents(
    () => setStatus('Uploading files...'),
    payload =>
      setStatus(`Uploaded ${payload.uploaded_count} files successfully`),
    error => {
      setStatus(`Upload error: ${error}`);
      onError?.(error);
    }
  );

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
        // Web: Create session, upload files, then analyze
        setStatus('Creating session...');
        const sessionId = await platform.proto.registerProtoRoot(
          result.path || 'Proto Files'
        );

        if (result.files && platform.proto.uploadProtoStructure) {
          setStatus(`Uploading ${result.files.length} files...`);
          await platform.proto.uploadProtoStructure(sessionId, result.files);

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

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <button
          onClick={handleSelectDirectory}
          disabled={isProcessing}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isProcessing ? 'Processing...' : buttonText}
        </button>
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
          {status}
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
