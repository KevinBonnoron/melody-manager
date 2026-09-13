import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { connectionCollection } from '@/collections/connection.collection';
import { providerCollection } from '@/collections/provider.collection';
import { useAuthUser } from '@/hooks/use-auth-user';
import { usePlugins } from '@/hooks/use-plugins';
import type { Connection } from '@/shared';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { getDefaultConfigForType } from './available-provider-types';
import type { ConfigFormData } from './provider-config-form';
import { ProviderConfigForm } from './provider-config-form';
import { getProviderInfoFromManifests } from './provider-info';

interface Props {
  providerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProviderConnectDialog({ providerId, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const { manifests } = usePlugins();
  const user = useAuthUser();
  const { data: provider } = useLiveQuery({
    query: (q) =>
      q
        .from({ providers: providerCollection })
        .where(({ providers }) => eq(providers.id, providerId))
        .findOne(),
  });

  const type = provider?.type;
  const providerInfo = getProviderInfoFromManifests(t, manifests);
  const info = type ? providerInfo[type] : null;
  const initialConfig = useMemo(() => (type ? getDefaultConfigForType(manifests, type, true) : {}) as ConfigFormData, [type, manifests]);

  const connect = async (config: ConfigFormData) => {
    if (!info || !type) {
      return;
    }

    try {
      // The insert applies locally and persists after; without waiting for it,
      // a refused connection still closes the dialog and says it worked.
      await connectionCollection.insert({
        id: connectionCollection.utils.newId(),
        type,
        user: user.id,
        config,
        enabled: true,
      } as Connection).isPersisted.promise;
      toast.success(t('ProviderCardActions.providerConnectedSuccess', { title: info.title }));
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(t('ProviderCardActions.providerSaveError', { title: info.title }));
    }
  };

  if (!provider || !type || !info) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{info.title}</DialogTitle>
          <DialogDescription>{info.description}</DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <ProviderConfigForm type={type} initialConfig={initialConfig} onSubmit={connect} onAdd={info.isAutoDiscovery ? () => connect({} as ConfigFormData) : undefined} onCancel={() => onOpenChange(false)} isEdit={false} useConnectionSchema />
        </div>
      </DialogContent>
    </Dialog>
  );
}
