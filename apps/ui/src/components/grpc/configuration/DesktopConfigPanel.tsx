import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { platform } from '@/lib/platform';
import { useRequestStore } from '@/state/request';
import { useProtoFiles } from '@/state/protoFiles';
import { useServicesStore } from '@/state/services';
import toast from 'react-hot-toast';

export const DesktopConfigPanel: React.FC = () => {
  const { t } = useTranslation();
  const {
    indexing,
    rootPath,
    setRootPath,
    rootId,
    setRootId,
    knownRoots,
    addKnownRoot,
    removeKnownRoot,
    setService,
    setMethod,
    setPayload,
  } = useRequestStore();

  const clearFiles = useProtoFiles(s => s.clear);
  const resetServices = useServicesStore(s => s.reset);

  const registerRoot = async () => {
    if (!rootPath) {
      toast.error(t('errors.pathEmpty'));
      return;
    }
    try {
      const id = await platform.proto.registerProtoRoot(rootPath);
      await platform.proto.scanProtoRoot(id);
      setRootId(id);
      addKnownRoot({ id, path: rootPath });
      toast.success(t('common.rootRegistered'));
    } catch (e: any) {
      toast.error(e.toString());
    }
  };

  const rescan = async () => {
    if (!rootId) {
      toast.error(t('errors.noRoot'));
      return;
    }
    await platform.proto.scanProtoRoot(rootId);
  };

  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="root-path" className="text-xs">
          {t('protoFiles.protoRootPath')}
        </Label>
        <Input
          id="root-path"
          value={rootPath}
          onChange={e => setRootPath(e.target.value)}
          placeholder={t('protoFiles.pathPlaceholder')}
        />
      </div>
      <div className="mt-1 flex gap-2 items-center flex-wrap">
        <Button onClick={registerRoot} disabled={!rootPath || indexing}>
          {indexing ? t('common.loading') : t('protoFiles.scanDirectory')}
        </Button>
        <Button
          variant="secondary"
          onClick={rescan}
          disabled={!rootId || indexing}
        >
          {t('common.refresh')}
        </Button>
        {rootId && !indexing && (
          <div className='w-full'><span className="text-[11px] opacity-70">id: {rootId}</span></div>
        )}
      </div>
      {knownRoots.length > 0 && (
        <div className="mt-2">
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">
              {t('protoFiles.knownRoots')}
            </Label>
            <Select
              value={rootId || ''}
              onValueChange={async sel => {
                if (!sel) return;
                setRootId(sel);
                const chosen = knownRoots.find(r => r.id === sel);
                if (chosen) setRootPath(chosen.path);
                await platform.proto.scanProtoRoot(sel);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('protoFiles.selectRoot')} />
              </SelectTrigger>
              <SelectContent>
                {knownRoots.map(r => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {rootId && (
            <div className="mt-1 flex gap-2">
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!rootId) return;
                  if (!confirm(t('protoFiles.confirmRemove'))) return;
                  try {
                    await platform.proto.removeProtoRoot(rootId);
                    removeKnownRoot(rootId);
                    setRootId(undefined);
                    setRootPath('');
                    clearFiles();
                    resetServices();
                    setService('');
                    setMethod('');
                    setPayload('');
                    toast.success(t('protoFiles.removeSuccess'));
                  } catch (e: any) {
                    toast.error(t('errors.removeFailed'));
                  }
                }}
              >
                {t('protoFiles.removeRoot')}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
};
