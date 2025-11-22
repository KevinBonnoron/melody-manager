import { providerCollection } from '@/collections/provider.collection';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { getDefaultConfigForType } from './available-provider-types';
import type { ConfigFormData } from './provider-config-form';
import { ProviderConfigForm } from './provider-config-form';
import { getProviderInfo } from './provider-info';

type Props = {
  providerId: string;
  title: string;
  description: string;
};

export function EditProviderButton({ title, description, providerId }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { data: provider } = useLiveQuery(
    (q) =>
      q
        .from({ providers: providerCollection })
        .where(({ providers }) => eq(providers.id, providerId))
        .findOne(),
    [providerId],
  );

  const providerInfo = getProviderInfo(t);
  const info = provider ? (providerInfo[provider.type] ?? null) : null;
  const initialConfig = useMemo(() => (provider?.config ? { ...provider.config } : provider ? (getDefaultConfigForType(provider.type as Parameters<typeof getDefaultConfigForType>[0]) as ConfigFormData) : {}), [provider?.id, provider?.config, provider?.type]);

  const handleSubmit = async (config: ConfigFormData) => {
    if (!provider || !info) return;
    try {
      providerCollection.update(providerId, (draft) => {
        draft.config = config;
        draft.enabled = true;
      });
      const wasConnected = !!provider.enabled;
      toast.success(wasConnected ? t('ProviderCardActions.providerUpdatedSuccess', { title: info.title }) : t('ProviderCardActions.providerConnectedSuccess', { title: info.title }));
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error(t('ProviderCardActions.providerSaveError', { title: info.title }));
    }
  };

  const handleAddAutoDiscovery = () => {
    if (!provider || !info) return;
    try {
      providerCollection.update(providerId, (draft) => {
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

  const type = provider?.type;
  const category = provider?.category;
  const canShowForm = provider && type && category;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-0 flex-1">
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          {t('ProviderCardActions.edit')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          {!canShowForm ? <p className="text-muted-foreground text-sm">Loading…</p> : <ProviderConfigForm type={type} initialConfig={initialConfig} onSubmit={handleSubmit} onAdd={info?.isAutoDiscovery ? handleAddAutoDiscovery : undefined} onCancel={handleCancel} isEdit isConnected={!!provider.enabled} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
