import { eq, useLiveQuery } from '@tanstack/react-db';
import { Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { connectionCollection } from '@/collections/connection.collection';
import { providerCollection } from '@/collections/provider.collection';
import { usePlugins } from '@/hooks/use-plugins';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { getDefaultConfigForType } from './available-provider-types';
import type { ConfigFormData } from './provider-config-form';
import { ProviderConfigForm } from './provider-config-form';
import { getProviderInfoFromManifests } from './provider-info';

type Props = {
  connectionId: string;
  title: string;
  description: string;
};

export function EditConnectionButton({ title, description, connectionId }: Props) {
  const { t } = useTranslation();
  const { manifests } = usePlugins();
  const [open, setOpen] = useState(false);

  const { data: connection } = useLiveQuery(
    (q) =>
      q
        .from({ connections: connectionCollection })
        .where(({ connections }) => eq(connections.id, connectionId))
        .findOne(),
    [connectionId],
  );

  const { data: provider } = useLiveQuery(
    (q) =>
      q
        .from({ providers: providerCollection })
        .where(({ providers }) => eq(providers.id, connection?.provider ?? ''))
        .findOne(),
    [connection?.provider],
  );

  const type = provider?.type;
  const category = provider?.category;
  const providerInfo = getProviderInfoFromManifests(t, manifests);
  const info = type ? (providerInfo[type] ?? null) : null;
  const initialConfig = useMemo(() => (connection?.config ? { ...connection.config } : type ? getDefaultConfigForType(manifests, type, true) : {}) as ConfigFormData, [connection?.config, type, manifests]);

  const handleSubmit = async (config: ConfigFormData) => {
    if (!connection || !info) {
      return;
    }
    try {
      connectionCollection.update(connectionId, (draft) => {
        draft.config = config;
        draft.enabled = true;
      });
      const wasConnected = !!connection.enabled;
      toast.success(wasConnected ? t('ProviderCardActions.providerUpdatedSuccess', { title: info.title }) : t('ProviderCardActions.providerConnectedSuccess', { title: info.title }));
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error(t('ProviderCardActions.providerSaveError', { title: info.title }));
    }
  };

  const handleAddAutoDiscovery = () => {
    if (!connection || !info) {
      return;
    }
    try {
      connectionCollection.update(connectionId, (draft) => {
        draft.enabled = true;
      });
      toast.success(t('ProviderCardActions.providerConnectedSuccess', { title: info.title }));
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error(t('ProviderCardActions.providerSaveError', { title: info.title }));
    }
  };

  const handleCancel = () => setOpen(false);

  const canShowForm = connection && type && category;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-0 flex-1">
          <Pencil className="h-3.5 w-3.5 xl:mr-1.5" />
          <span className="hidden xl:inline">{t('ProviderCardActions.edit')}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          {!canShowForm ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : (
            <ProviderConfigForm type={type} initialConfig={initialConfig} onSubmit={handleSubmit} onAdd={info?.isAutoDiscovery ? handleAddAutoDiscovery : undefined} onCancel={handleCancel} isEdit isConnected={!!connection.enabled} useConnectionSchema />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
