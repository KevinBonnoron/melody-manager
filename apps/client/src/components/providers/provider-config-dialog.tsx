import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { providerConfigCollection } from '@/collections/provider-config.collection';
import { refreshPluginsAfterWrite, usePlugins } from '@/hooks/use-plugins';
import type { ProviderConfig } from '@/shared';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { getDefaultConfigForType } from './available-provider-types';
import type { ConfigFormData } from './provider-config-form';
import { ProviderConfigForm } from './provider-config-form';

interface Props {
  type: string;
  title: string;
  description?: string;
  serverConfig?: ProviderConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProviderConfigDialog({ type, title, description, serverConfig, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const { manifests } = usePlugins();
  const initialConfig = useMemo(() => (serverConfig?.config ? { ...serverConfig.config } : getDefaultConfigForType(manifests, type)) as ConfigFormData, [serverConfig?.config, type, manifests]);

  const handleSubmit = async (config: ConfigFormData) => {
    try {
      const tx = serverConfig
        ? providerConfigCollection.update(serverConfig.id, (draft) => {
            draft.config = config;
          })
        : providerConfigCollection.insert({ id: providerConfigCollection.utils.newId(), type, config } as ProviderConfig);
      await tx.isPersisted.promise;
      await refreshPluginsAfterWrite();
      toast.success(t('ProviderCardActions.providerUpdatedSuccess', { title }));
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(t('ProviderCardActions.providerSaveError', { title }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <ProviderConfigForm type={type} initialConfig={initialConfig} onSubmit={handleSubmit} onCancel={() => onOpenChange(false)} submitLabel={serverConfig ? t('ProviderCardActions.update') : t('ProviderCardActions.save')} isEdit />
        </div>
      </DialogContent>
    </Dialog>
  );
}
