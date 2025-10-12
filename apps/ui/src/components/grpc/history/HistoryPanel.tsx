import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useRequestStore } from '@/state/request';
import { useHistoryStore } from '@/state/history';

export const HistoryPanel: React.FC = () => {
  const { t } = useTranslation();
  const {
    setService,
    setMethod,
    setTarget,
    setPayload,
    lastResponse
  } = useRequestStore();
  const history = useHistoryStore(s => s.calls);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">{t('history.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 flex-wrap mb-4">
          <Button
            variant="destructive"
            onClick={() => {
              if (confirm(t('history.confirmClear'))) {
                useHistoryStore.getState().clearAll()
              }
            }}
            disabled={history.length === 0}
          >
            {t('history.clear')}
          </Button>
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {history.length === 0 && (
            <em className="text-neutral-400">{t('history.noCalls')}</em>
          )}
          {history.slice(0, 15).map(h => {
            const kind = ((): string | undefined => {
              if (!lastResponse) return undefined;
              const d: any = lastResponse.data;
              if (d && d.kind) return d.kind;
              return undefined;
            })();
            const kindColors = {
              unknown_service: 'bg-orange-600',
              unknown_method: 'bg-orange-600',
              dial_failure: 'bg-red-600',
              timeout: 'bg-yellow-600',
              permission_denied: 'bg-red-600',
              unauthenticated: 'bg-red-600',
              unavailable: 'bg-red-600',
            };
            return (
              <div
                key={h.id}
                className="flex gap-2 text-xs border-b border-neutral-700 pb-2 items-center"
              >
                <span
                  className={`w-8 text-center font-semibold text-xs px-1 py-0.5 rounded ${h.ok === undefined ? 'text-neutral-400' : h.ok ? 'text-green-400' : 'text-red-400'}`}
                >
                  {h.ok === undefined ? '…' : h.ok ? 'OK' : 'ERR'}
                </span>
                <span className="flex-1 truncate">
                  {h.service}.{h.method}
                </span>
                <span className="text-neutral-400">
                  {new Date(h.at).toLocaleTimeString()}
                </span>
                {h.tookMs !== undefined && (
                  <span className="text-neutral-400">{h.tookMs}ms</span>
                )}
                {kind && (
                  <span
                    className={`text-white px-2 py-0.5 rounded text-[10px] ${kindColors[kind as keyof typeof kindColors] || 'bg-neutral-600'}`}
                  >
                    {kind}
                  </span>
                )}
                <span title="headers" className="text-neutral-400">
                  {h.headers.length}h
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setService(h.service);
                    setMethod(h.method);
                    setTarget(h.target);
                    setPayload(h.payload);
                  }}
                >
                  Load
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => useHistoryStore.getState().remove(h.id)}
                  title={t('history.deleteEntry')}
                >
                  ✕
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};