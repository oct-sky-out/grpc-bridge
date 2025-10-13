import { useState } from 'react';
import { getPlatform } from '@/lib/platform';
import {
  useProtoUploadEvents,
  useProtoAnalyzeEvents,
} from '@/lib/platform/hooks';

interface ProtoUploaderProps {
  sessionId: string;
  onUploadComplete?: () => void;
  onAnalyzeComplete?: (missingDeps: string[]) => void;
}

export function ProtoUploader({
  sessionId,
  onUploadComplete,
  onAnalyzeComplete,
}: ProtoUploaderProps) {
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [analyzeStatus, setAnalyzeStatus] = useState<string>('');
  const [missingDeps, setMissingDeps] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFileCount, setSelectedFileCount] = useState(0);

  const platform = getPlatform();

  // Subscribe to upload events
  useProtoUploadEvents(
    () => {
      setUploadStatus('Uploading files...');
    },
    payload => {
      setUploadStatus(
        `Upload complete: ${payload.uploaded_count} files uploaded${
          payload.error_count > 0 ? `, ${payload.error_count} errors` : ''
        }`
      );
      setIsUploading(false);
      if (payload.error_count === 0) {
        onUploadComplete?.();
      }
    },
    error => {
      setUploadStatus(`Upload error: ${error}`);
      setIsUploading(false);
    }
  );

  // Subscribe to analyze events
  useProtoAnalyzeEvents(
    () => {
      setAnalyzeStatus('Analyzing dependencies...');
    },
    payload => {
      setAnalyzeStatus(
        `Analysis complete: ${payload.missing_count} missing dependencies`
      );
      setMissingDeps(payload.missing_stdlib);
      onAnalyzeComplete?.(payload.missing_stdlib);
    }
  );

  const handleDirectorySelect = async () => {
    try {
      // Create file input element
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.multiple = true;

      input.onchange = async event => {
        const target = event.target as HTMLInputElement;
        const files = Array.from(target.files || []);

        if (files.length === 0) {
          setUploadStatus('No files selected');
          return;
        }

        // Filter only .proto files
        const protoFiles = files.filter(f => f.name.endsWith('.proto'));

        if (protoFiles.length === 0) {
          setUploadStatus('No .proto files found in selected directory');
          return;
        }

        setSelectedFileCount(protoFiles.length);
        setIsUploading(true);
        setUploadStatus(`Uploading ${protoFiles.length} files...`);

        try {
          if (platform.proto.uploadProtoStructure) {
            await platform.proto.uploadProtoStructure(sessionId, protoFiles);
          } else {
            throw new Error('Upload not available on this platform');
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Upload failed';
          setUploadStatus(`Error: ${errorMsg}`);
          setIsUploading(false);
        }
      };

      input.click();
    } catch (err) {
      console.error('Directory selection failed:', err);
      setUploadStatus('Directory selection cancelled or failed');
    }
  };

  if (platform.type !== 'web') {
    return (
      <div className="p-4 text-sm text-gray-500">
        File upload is only available in web version. Desktop version uses
        local file system.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 border border-gray-200 rounded-lg">
      <div>
        <h3 className="text-lg font-semibold mb-2">Upload Proto Files</h3>
        <p className="text-sm text-gray-600 mb-4">
          Select a directory containing your .proto files. The directory
          structure will be preserved for import resolution.
        </p>
      </div>

      <div>
        <button
          onClick={handleDirectorySelect}
          disabled={isUploading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isUploading ? 'Uploading...' : 'Select Proto Directory'}
        </button>
      </div>

      {selectedFileCount > 0 && (
        <div className="text-sm text-gray-600">
          Selected {selectedFileCount} .proto files
        </div>
      )}

      {uploadStatus && (
        <div
          className={`p-3 rounded ${
            uploadStatus.includes('error') || uploadStatus.includes('Error')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : uploadStatus.includes('complete')
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}
        >
          {uploadStatus}
        </div>
      )}

      {analyzeStatus && (
        <div className="p-3 bg-blue-50 text-blue-700 rounded border border-blue-200">
          {analyzeStatus}
        </div>
      )}

      {missingDeps.length > 0 && (
        <div className="p-3 bg-yellow-50 text-yellow-800 rounded border border-yellow-200">
          <div className="font-semibold mb-2">Missing Dependencies:</div>
          <ul className="list-disc list-inside space-y-1">
            {missingDeps.map(dep => (
              <li key={dep} className="text-sm">
                {dep}
              </li>
            ))}
          </ul>
          <p className="text-sm mt-2 text-yellow-700">
            Note: Standard library files (google/*) are automatically provided
            by the server.
          </p>
        </div>
      )}
    </div>
  );
}
