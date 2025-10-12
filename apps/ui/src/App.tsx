import React, { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import toast from 'react-hot-toast';
import { useRequestStore } from '@/state/request';
import { useHistoryStore } from '@/state/history';
import { UnaryRequestPanel } from '@/components/UnaryRequestPanel';
import { useServicesStore } from '@/state/services';
import { useProtoFiles } from '@/state/protoFiles';
import { invoke } from '@tauri-apps/api/core';
import { ThemeProvider } from '@/context/ThemeContext';
import '@/i18n'; // Initialize i18n

const App: React.FC = () => {
  const setBusy = useRequestStore(s => s.setBusy);
  const setIndexing = useRequestStore(s => s.setIndexing);
  const setLastResponse = useRequestStore(s => s.setLastResponse);
  const setKnownRoots = useRequestStore(s => s.setKnownRoots);
  const pushHistory = useHistoryStore(s => s.push);
  const updatePendingHistory = useHistoryStore(s => s.updatePending);
  const reqSnapshot = useRequestStore(s => ({
    target: s.target,
    service: s.service,
    method: s.method,
    payload: s.payload,
    headers: s.headers,
  }));

  const setServices = useServicesStore(s => s.setServices);
  const setProtoFiles = useProtoFiles(s => s.setFiles);

  useEffect(() => {
    const unlisten: (() => void)[] = [];
    listen('grpc://response', (e: any) => {
      setBusy(false);
      setLastResponse({ ok: true, data: e.payload, at: Date.now() });
      const p = e.payload as any;
      updatePendingHistory(true, p.took_ms);
    }).then(f => unlisten.push(f));
    listen('grpc://error', (e: any) => {
      setBusy(false);
      setLastResponse({ ok: false, data: e.payload, at: Date.now() });
      toast.error(e.payload.error || 'Request failed');
      const p = e.payload as any;
      updatePendingHistory(false, p.took_ms);
    }).then(f => unlisten.push(f));
    listen('proto://index_start', () => {
      setIndexing(true);
    }).then(f => unlisten.push(f));
    listen('proto://index_done', () => {
      setIndexing(false);
    }).then(f => unlisten.push(f));
    listen('proto://index_done', async (e: any) => {
      try {
        const list = await invoke<any>('list_services', {
          root_id: e.payload.rootId,
        });
        setServices(list as any);
        if (e.payload.files) {
          setProtoFiles(e.payload.files as string[]);
        }
        toast.success(`Indexed services: ${(list as any[]).length}`);
      } catch (err: any) {
        toast.error('List services failed');
      }
    }).then(f => unlisten.push(f));
    // initial roots fetch
    (async () => {
      try {
        const roots = await invoke<any>('list_proto_roots');
        setKnownRoots((roots as any[]).map(r => ({ id: r.id, path: r.path })));
      } catch {}
    })();
    return () => unlisten.forEach(u => u());
  }, [setBusy, setLastResponse, setIndexing, updatePendingHistory]);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-background text-foreground theme-transition">
        <div className="p-4 space-y-4">
          <h1 className="text-2xl font-bold">🌉 「gRPC Bridge」</h1>
          <UnaryRequestPanel />
        </div>
      </div>
    </ThemeProvider>
  );
};

export default App;
