import React from 'react';
import { ConfigurationPanel } from '@/components/grpc/configuration/ConfigurationPanel';
import { RequestPanel } from '@/components/grpc/request/RequestPanel';
import { HeadersPanel } from '@/components/grpc/header/HeadersPanel';
import { ExecuteRequestPanel } from '@/components/grpc/request/ExecuteRequestPanel';
import { ResponsePanel } from '@/components/grpc/response/ResponsePanel';
import { HistoryPanel } from '@/components/grpc/history/HistoryPanel';

export const UnaryRequestPanel: React.FC = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-sm">
      <ConfigurationPanel />
      <RequestPanel />
      <HeadersPanel />
      <div className="lg:col-span-3 space-y-6">
        <ExecuteRequestPanel />
        <ResponsePanel />
        <HistoryPanel />
      </div>
    </div>
  );
};