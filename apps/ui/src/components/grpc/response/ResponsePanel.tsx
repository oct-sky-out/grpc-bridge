import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useRequestStore } from '@/state/request';
import toast from 'react-hot-toast';

export const ResponsePanel: React.FC = () => {
  const { t } = useTranslation();
  const { lastResponse } = useRequestStore();

  return (
    <Card>
      <CardHeader className="pb-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t('grpc.response')}</CardTitle>
        {lastResponse && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  const text = JSON.stringify(lastResponse.data, null, 2);
                  await navigator.clipboard.writeText(text);
                  toast.success(t('response.copySuccess'));
                } catch (e) {
                  try {
                    const text = JSON.stringify(lastResponse.data, null, 2);
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    toast.success(t('response.copySuccess'));
                  } catch (err) {
                    toast.error(t('response.copyFail'));
                  }
                }
              }}
              title={t('response.copy')}
            >
              {t('response.copy')}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {lastResponse ? (
          <pre className="bg-neutral-950 text-neutral-100 p-3 max-h-[300px] overflow-auto rounded border">
            {JSON.stringify(lastResponse.data, null, 2)}
          </pre>
        ) : (
          <em className="text-neutral-400">{t('grpc.noResponse')}</em>
        )}
      </CardContent>
    </Card>
  );
};