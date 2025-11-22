import { providerCollection } from '@/collections/provider.collection';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { DeviceProviderType, Provider, TrackProviderType } from '@melody-manager/shared';
import { Music2, Speaker } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DropdownMenuItem } from '../ui/dropdown-menu';
import { getDefaultConfigForType } from './available-provider-types';
import type { ConfigFormData } from './provider-config-form';
import { ProviderConfigForm } from './provider-config-form';
import { getProviderInfo } from './provider-info';

interface Props {
  type: TrackProviderType | DeviceProviderType;
  category: 'track' | 'device';
  title: string;
  description: string;
}

export function CreateProviderButton({ type, category, title, description }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const providerInfo = getProviderInfo(t);
  const info = providerInfo[type] ?? null;
  const initialConfig = useMemo(() => getDefaultConfigForType(type) as ConfigFormData, [type]);

  const handleSubmit = async (config: ConfigFormData) => {
    if (!info) return;
    try {
      providerCollection.insert({
        id: crypto.randomUUID(),
        category,
        type,
        config,
        enabled: true,
      } as Provider);
      toast.success(t('ProviderCardActions.providerConnectedSuccess', { title: info.title }));
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error(t('ProviderCardActions.providerSaveError', { title: info.title }));
    }
  };

  const handleAddAutoDiscovery = () => {
    if (!info) return;
    try {
      providerCollection.insert({
        id: crypto.randomUUID(),
        category,
        type,
        config: {},
        enabled: true,
      } as Provider);
      toast.success(t('ProviderCardActions.providerConnectedSuccess', { title: info.title }));
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
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <span className="flex w-full items-center justify-between gap-2">
            {t(`ProviderCard.${type}.title`)}
            {category === 'track' ? <Music2 className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Speaker className="h-4 w-4 shrink-0 text-muted-foreground" />}
          </span>
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <ProviderConfigForm type={type} initialConfig={initialConfig} onSubmit={handleSubmit} onAdd={info?.isAutoDiscovery ? handleAddAutoDiscovery : undefined} onCancel={handleCancel} isEdit={false} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
