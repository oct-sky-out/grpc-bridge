import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { invoke } from '@tauri-apps/api/core';
import { useRequestStore } from '@/state/request';
import { useServicesStore } from '@/state/services';
import { useProtoFiles } from '@/state/protoFiles';
import toast from 'react-hot-toast';

export const RequestPanel: React.FC = () => {
  const { t } = useTranslation();
  const {
    target,
    setTarget,
    service,
    setService,
    method,
    setMethod,
    payload,
    setPayload,
    lastSentPayload,
    showDiff,
    setShowDiff,
  } = useRequestStore();

  const services = useServicesStore(s => s.services);
  const byService = useServicesStore(s => s.byService);
  const selectedFiles = useProtoFiles(s => s.selected);

  const [payloadError, setPayloadError] = React.useState<string | null>(null);

  const validatePayload = (v: string) => {
    // 빈 문자열이나 공백만 있는 경우는 유효한 것으로 처리
    if (!v.trim()) {
      setPayloadError(null);
      return;
    }

    try {
      JSON.parse(v);
      setPayloadError(null);
    } catch (e: any) {
      setPayloadError(e.message);
    }
  };

  const formatPayload = () => {
    // 빈 문자열이나 공백만 있는 경우는 그대로 유지
    if (!payload.trim()) {
      return;
    }

    try {
      const obj = JSON.parse(payload);
      setPayload(JSON.stringify(obj, null, 2));
      setPayloadError(null);
    } catch {
      /* ignore */
    }
  };

  const fillSkeleton = async () => {
    if (!service || !method) return;
    try {
      const skel = await invoke<string>('get_method_skeleton', {
        fq_service: service,
        method,
      });
      setPayload(skel);
    } catch (e: any) {
      toast.error(t('errors.skeletonFailed'));
    }
  };

  const renderDiff = () => {
    if (!lastSentPayload) return <em>{t('grpc.noPreviousPayload')}</em>;
    try {
      // 빈 문자열 처리
      const beforeText = lastSentPayload.trim() ?
        JSON.stringify(JSON.parse(lastSentPayload), null, 2) :
        '';
      const afterText = payload.trim() ?
        JSON.stringify(JSON.parse(payload), null, 2) :
        '';

      const before = beforeText.split('\n');
      const after = afterText.split('\n');
      // simple line diff
      const max = Math.max(before.length, after.length);
      const rows: React.ReactNode[] = [];
      for (let i = 0; i < max; i++) {
        const b = before[i];
        const a = after[i];
        if (b === a)
          rows.push(
            <div key={i} style={{ opacity: 0.5 }}>
              {a}
            </div>
          );
        else
          rows.push(
            <div key={i} style={{ background: '#331', color: '#fdd' }}>
              <div>{b || ''}</div>
              <div style={{ background: '#133', color: '#cfd' }}>{a || ''}</div>
            </div>
          );
      }
      return (
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 12,
            maxHeight: 200,
            overflow: 'auto',
          }}
        >
          {rows}
        </div>
      );
    } catch {
      return <em>{t('errors.diffParseError')}</em>;
    }
  };

  return (
    <Card className="lg:col-span-1">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">{t('grpc.request')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="target" className="text-xs">
            {t('grpc.target')}
          </Label>
          <Input
            id="target"
            value={target}
            onChange={e => setTarget(e.target.value)}
            placeholder={t('grpc.targetPlaceholder')}
          />
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('grpc.service')}</Label>
              <Select
                value={service}
                onValueChange={val => {
                  setService(val);
                  setMethod('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('grpc.selectService')} />
                </SelectTrigger>
                <SelectContent>
                  {services
                    .filter(s => selectedFiles[s.file])
                    .map(s => (
                      <SelectItem key={s.fq_service} value={s.fq_service}>
                        {s.fq_service}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('grpc.method')}</Label>
              <Select
                value={method}
                onValueChange={setMethod}
                disabled={!service}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('grpc.selectMethod')} />
                </SelectTrigger>
                <SelectContent>
                  {service &&
                    byService[service]?.methods
                      .filter(m => !m.streaming)
                      .map(m => (
                        <SelectItem key={m.name} value={m.name}>
                          {m.name}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Button
              variant="secondary"
              disabled={!service || !method}
              onClick={fillSkeleton}
              className="w-full sm:w-auto"
            >
              {t('grpc.skeleton')}
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="payload" className="text-xs">
            {t('grpc.requestPayload')}
          </Label>
          <Textarea
            id="payload"
            className={`min-h-[120px] ${payloadError ? 'border-red-500' : ''}`}
            value={payload}
            onChange={e => {
              setPayload(e.target.value);
              validatePayload(e.target.value);
            }}
            placeholder={t('grpc.payloadPlaceholder')}
          />
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Button variant="secondary" type="button" onClick={formatPayload}>
            {t('common.format')}
          </Button>
          {payloadError && (
            <span className="text-red-500 text-xs">{payloadError}</span>
          )}
          <Button
            variant="ghost"
            type="button"
            onClick={() => setShowDiff(s => !s)}
            disabled={!lastSentPayload}
          >
            {showDiff ? t('common.hideDiff') : t('common.showDiff')}
          </Button>
        </div>
        {showDiff && <div className="mt-2">{renderDiff()}</div>}
      </CardContent>
    </Card>
  );
};