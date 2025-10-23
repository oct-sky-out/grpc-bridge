import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { invoke } from '@tauri-apps/api/core';
import { useRequestStore } from '@/state/request';
import { useHistoryStore } from '@/state/history';
import { useProtoFiles } from '@/state/protoFiles';
import toast from 'react-hot-toast';

export const ExecuteRequestPanel: React.FC = () => {
  const { t } = useTranslation();
  const {
    busy,
    setBusy,
    rootPath,
    rootId,
    target,
    service,
    method,
    payload,
    headers,
    setLastSentPayload,
    authToken,
    autoAuth,
  } = useRequestStore();

  const selectedFiles = useProtoFiles(s => s.selected);
  const pushHistory = useHistoryStore(s => s.push);

  const run = async () => {
    if (busy) return;
    if (!rootPath) {
      toast.error(t('errors.protoRootRequired'));
      return;
    }
    if (!service || !method) {
      toast.error(t('errors.serviceMethodRequired'));
      return;
    }
    setBusy(true);
    const chosenFiles = Object.entries(selectedFiles)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (chosenFiles.length === 0) {
      toast.error(t('errors.selectProtoFile'));
      setBusy(false);
      return;
    }
    let effectiveHeaders = [...headers];
    if (
      autoAuth &&
      authToken &&
      !effectiveHeaders.some(h => h.key.toLowerCase() === 'authorization')
    ) {
      effectiveHeaders = [
        ...effectiveHeaders,
        {
          id: crypto.randomUUID(),
          key: 'Authorization',
          value: `Bearer ${authToken}`,
        },
      ];
    }
    const headerList = effectiveHeaders
      .filter(h => h.key)
      .map(h => `${h.key}: ${h.value}`);
    try {
      pushHistory({
        target,
        service,
        method,
        payload,
        headers: effectiveHeaders.map(h => ({ key: h.key, value: h.value })),
      });
      setLastSentPayload(payload);
      await invoke('run_grpc_call', {
        params: {
          target,
          service,
          method,
          payload,
          proto_files: chosenFiles,
          root_id: rootId ?? null,
          headers: headerList,
        },
      });
    } catch (e: any) {
      toast.error(e.toString());
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">
          {t('grpc.executeRequest')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Button
          disabled={busy}
          onClick={run}
          className="w-full h-10 text-base"
        >
          {busy ? t('common.loading') : t('grpc.sendRequest')}
        </Button>
      </CardContent>
    </Card>
  );
};