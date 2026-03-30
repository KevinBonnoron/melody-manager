import { eq, useLiveQuery } from '@tanstack/react-db';
import { Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { providerCollection } from '@/collections/provider.collection';
import { usePlugins } from '@/hooks/use-plugins';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { getDefaultConfigForType } from './available-provider-types';
import type { ConfigFormData } from './provider-config-form';
import { ProviderConfigForm } from './provider-config-form';
import { getProviderInfoFromManifests } from './provider-info';

type Props = {
  providerId: string;
  title: string;
  description: string;
};

export function AdminProviderEditButton({ title, description, providerId }: Props) {
  const { t } = useTranslation();
  const { manifests } = usePlugins();
  const [open, setOpen] = useState(false);

  const { data: provider } = useLiveQuery(
    (q) =>
      q
        .from({ providers: providerCollection })
        .where(({ providers }) => eq(providers.id, providerId))
        .findOne(),
    [providerId],
  );

  const type = provider?.type;
  const providerInfo = getProviderInfoFromManifests(t, manifests);
  const info = type ? (providerInfo[type] ?? null) : null;
  const initialConfig = useMemo(() => (provider?.config ? { ...provider.config } : type ? getDefaultConfigForType(manifests, type) : {}) as ConfigFormData, [provider?.config, type, manifests]);

  const handleSubmit = async (config: ConfigFormData) => {
    if (!provider || !info) {
      return;
    }
    try {
      const tx = providerCollection.update(providerId, (draft) => {
        draft.config = config;
        draft.enabled = true;
      });
      await tx.isPersisted.promise;
      toast.success(t('ProviderCardActions.providerUpdatedSuccess', { title: info.title }));
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error(t('ProviderCardActions.providerSaveError', { title: info.title }));
    }
  };

  const handleCancel = () => setOpen(false);

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
        <div className="mt-4">{!provider || !type ? <p className="text-muted-foreground text-sm">Loading…</p> : <ProviderConfigForm type={type} initialConfig={initialConfig} onSubmit={handleSubmit} onCancel={handleCancel} isEdit isConnected={!!provider.enabled} />}</div>
      </DialogContent>
    </Dialog>
  );
}
