import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Checkbox } from '@/components/ui/Checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useRequestStore } from '@/state/request';

export const HeadersPanel: React.FC = () => {
  const { t } = useTranslation();
  const {
    headers,
    addHeader,
    updateHeader,
    removeHeader,
    authToken,
    setAuthToken,
    autoAuth,
    setAutoAuth,
  } = useRequestStore();

  return (
    <Card className="lg:col-span-1">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">{t('grpc.headers')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" type="button" onClick={addHeader}>
            {t('grpc.addHeader')}
          </Button>
        </div>
        {headers.map(h => (
          <div key={h.id} className="flex gap-2 mt-1">
            <Input
              className="flex-1"
              value={h.key}
              placeholder={t('grpc.headerKey')}
              onChange={e => updateHeader(h.id, 'key', e.target.value)}
            />
            <Input
              className="flex-1"
              value={h.value}
              placeholder={t('grpc.headerValue')}
              onChange={e => updateHeader(h.id, 'value', e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeHeader(h.id)}
            >
              ×
            </Button>
          </div>
        ))}

        <div className="space-y-2 border-t border-neutral-700 pt-4">
          <div className="space-y-1">
            <Label htmlFor="auth-token" className="text-xs">
              {t('grpc.authToken')}
            </Label>
            <Input
              id="auth-token"
              type="text"
              value={authToken}
              onChange={e => setAuthToken(e.target.value)}
              placeholder={t('grpc.authTokenPlaceholder')}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="auto-auth"
              checked={autoAuth}
              onCheckedChange={setAutoAuth}
            />
            <Label htmlFor="auto-auth" className="text-xs">
              {t('grpc.autoAuth')}
            </Label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};