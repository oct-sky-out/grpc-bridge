import React from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/Label';
import { useRequestStore } from '@/state/request';
import { useProtoFiles } from '@/state/protoFiles';
import { DirectoryPicker } from '@/components/DirectoryPicker';
import toast from 'react-hot-toast';

export const WebConfigPanel: React.FC = () => {
  const { t } = useTranslation();
  const {
    indexing,
    rootId,
    setRootId,
  } = useRequestStore();

  const protoFiles = useProtoFiles(s => s.files);

  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs">
          {t('protoFiles.uploadTitle')}
        </Label>
        <DirectoryPicker
          onDirectorySelected={(id) => {
            setRootId(id);
          }}
          onError={(error) => {
            toast.error(error);
          }}
          buttonText={indexing ? t('common.loading') : t('protoFiles.uploadProtos')}
        />
        {rootId && (
          <div className="space-y-1">
            <div className="text-[11px] opacity-70">
              Session ID: {rootId}
            </div>
            {protoFiles.length > 0 && (
              <div className="text-[11px] text-green-600">
                ✓ {protoFiles.length} proto file(s) uploaded
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-300">
        💡 {t('protoFiles.webHint')}
      </div>
    </>
  );
};
