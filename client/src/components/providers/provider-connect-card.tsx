import type { Connection } from '@melody-manager/shared';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Circle, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { connectionCollection } from '@/collections/connection.collection';
import { providerCollection } from '@/collections/provider.collection';
import { useAuthUser } from '@/hooks/use-auth-user';
import { usePlugins } from '@/hooks/use-plugins';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Button } from '../ui/button';
import { Card, CardAction, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { getDefaultConfigForType } from './available-provider-types';
import type { ConfigFormData } from './provider-config-form';
import { ProviderConfigForm } from './provider-config-form';
import { getProviderInfoFromManifests } from './provider-info';
import { getProviderTypeColors } from './provider-type-colors';

interface Props {
  providerId: string;
}

export function ProviderConnectCard({ providerId }: Props) {
  const { t } = useTranslation();
  const { manifests } = usePlugins();
  const user = useAuthUser();
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
  const info = type ? providerInfo[type] : null;
  const initialConfig = useMemo(() => (type ? getDefaultConfigForType(manifests, type, true) : {}) as ConfigFormData, [type, manifests]);
  const handleSubmit = async (config: ConfigFormData) => {
    if (!info || !type) {
      return;
    }

    try {
      connectionCollection.insert({
        id: crypto.randomUUID(),
        provider: providerId,
        user: user.id,
        config,
        enabled: true,
      } as Connection);
      toast.success(t('ProviderCardActions.providerConnectedSuccess', { title: info.title }));
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error(t('ProviderCardActions.providerSaveError', { title: info.title }));
    }
  };

  const handleAddAutoDiscovery = () => {
    if (!info || !type) {
      return;
    }

    try {
      connectionCollection.insert({
        id: crypto.randomUUID(),
        provider: providerId,
        user: user.id,
        config: {},
        enabled: true,
      } as Connection);
      toast.success(t('ProviderCardActions.providerConnectedSuccess', { title: info.title }));
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error(t('ProviderCardActions.providerSaveError', { title: info.title }));
    }
  };

  if (!provider || !type || !info) {
    return null;
  }

  const Icon = info.icon;
  const colors = getProviderTypeColors(type);
  return (
    <Card className="gap-4 p-5 opacity-60">
      <CardHeader className="flex flex-row items-center gap-4 p-0">
        <Avatar className={`h-12 w-12 shrink-0 rounded-xl ${colors.bg}`}>
          <AvatarFallback className={`bg-transparent ${colors.icon}`}>
            <Icon className="h-6 w-6" />
          </AvatarFallback>
        </Avatar>
        <CardTitle className="min-w-0 flex-1 text-base leading-tight">{info.title}</CardTitle>
        <CardAction className="shrink-0">
          <Circle className="h-5 w-5 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardFooter className="border-t p-0 pt-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="w-full">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t('ProviderCardActions.configure')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{info.title}</DialogTitle>
              <DialogDescription>{info.description}</DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              <ProviderConfigForm type={type} initialConfig={initialConfig} onSubmit={handleSubmit} onAdd={info.isAutoDiscovery ? handleAddAutoDiscovery : undefined} onCancel={() => setOpen(false)} isEdit={false} useConnectionSchema />
            </div>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}
