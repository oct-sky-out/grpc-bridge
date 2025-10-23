import React, { useEffect } from 'react';
import toast from 'react-hot-toast';
import { useRequestStore } from '@/state/request';
import { useHistoryStore } from '@/state/history';
import { UnaryRequestPanel } from '@/components/UnaryRequestPanel';
import { useServicesStore } from '@/state/services';
import { useProtoFiles } from '@/state/protoFiles';
import { ThemeProvider } from '@/context/ThemeContext';
import { initializePlatform, cleanupPlatform } from '@/lib/platform';
import type {
  ProtoIndexDonePayload,
  GRPCResponsePayload,
  GRPCErrorPayload,
} from '@/lib/platform';
import '@/i18n'; // Initialize i18n

const App: React.FC = () => {
  const setBusy = useRequestStore((s) => s.setBusy);
  const setIndexing = useRequestStore((s) => s.setIndexing);
  const setLastResponse = useRequestStore((s) => s.setLastResponse);
  const setKnownRoots = useRequestStore((s) => s.setKnownRoots);
  const updatePendingHistory = useHistoryStore((s) => s.updatePending);

  const setServices = useServicesStore((s) => s.setServices);
  const setProtoFiles = useProtoFiles((s) => s.setFiles);

  useEffect(() => {
    let cleanupFn: (() => void) | null = null;

    const setup = async () => {
      try {
        // Initialize platform adapter
        const platform = await initializePlatform();
        console.log(`[App] Platform initialized: ${platform.type}`);

        // Subscribe to events
        const unsubscribers: (() => void)[] = [];

        // proto://index_start
        unsubscribers.push(
          platform.events.on('proto://index_start', () => {
            setIndexing(true);
          })
        );

        // proto://index_done
        unsubscribers.push(
          platform.events.on('proto://index_done', async (payload: ProtoIndexDonePayload) => {
            setIndexing(false);
            try {
              const list = await platform.grpc.listServices(payload.rootId);
              setServices(list);
              if (payload.files) {
                setProtoFiles(payload.files);
              }
              toast.success(`Indexed services: ${list.length}`);
            } catch (err: any) {
              toast.error('List services failed');
              console.error('[App] Failed to list services:', err);
            }
          })
        );

        // grpc://response
        unsubscribers.push(
          platform.events.on('grpc://response', (payload: GRPCResponsePayload) => {
            setBusy(false);
            setLastResponse({ ok: true, data: payload, at: Date.now() });
            updatePendingHistory(true, payload.took_ms);
          })
        );

        // grpc://error
        unsubscribers.push(
          platform.events.on('grpc://error', (payload: GRPCErrorPayload) => {
            setBusy(false);
            setLastResponse({ ok: false, data: payload, at: Date.now() });
            toast.error(payload.error || 'Request failed');
            updatePendingHistory(false, payload.took_ms || 0);
          })
        );

        // Load initial proto roots
        try {
          const roots = await platform.proto.listProtoRoots();
          setKnownRoots(roots.map((r) => ({ id: r.id, path: r.path })));
        } catch (err) {
          console.error('[App] Failed to load proto roots:', err);
        }

        // Cleanup function
        cleanupFn = () => {
          unsubscribers.forEach((unsub) => unsub());
          cleanupPlatform();
        };
      } catch (error) {
        console.error('[App] Failed to initialize platform:', error);
        toast.error('Failed to initialize application');
      }
    };

    setup();

    return () => {
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, [setBusy, setLastResponse, setIndexing, updatePendingHistory, setServices, setProtoFiles, setKnownRoots]);

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
