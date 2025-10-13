import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { platform } from '@/lib/platform';
import { useProtoFiles } from '@/state/protoFiles';
import { DirectoryTree } from '@/components/grpc/configuration/DirectoryTree';
import { LanguageSwitcher } from '@/components/grpc/configuration/LanguageSwitcher';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { DesktopConfigPanel } from '@/components/grpc/configuration/DesktopConfigPanel';
import { WebConfigPanel } from '@/components/grpc/configuration/WebConfigPanel';

export const ConfigurationPanel: React.FC = () => {
  const { t } = useTranslation();

  const protoFiles = useProtoFiles(s => s.files);
  const selectAllFiles = useProtoFiles(s => s.selectAll);
  const clearFiles = useProtoFiles(s => s.clear);

  return (
    <Card className="lg:col-span-1">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {t('grpc.configuration')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {platform.type === 'desktop' ? <DesktopConfigPanel /> : <WebConfigPanel />}
        <div className="mt-2 space-y-1">
          <div className="flex justify-between items-center">
            <strong className="text-xs uppercase tracking-wide">
              {t('protoFiles.title')}
            </strong>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                onClick={selectAllFiles}
                disabled={!protoFiles.length}
              >
                {t('common.selectAll')}
              </Button>
              <Button
                variant="ghost"
                onClick={clearFiles}
                disabled={!protoFiles.length}
              >
                {t('common.selectNone')}
              </Button>
            </div>
          </div>
          <DirectoryTree height={180} />
        </div>
      </CardContent>
    </Card>
  );
};