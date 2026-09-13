import { eq, useLiveQuery } from '@tanstack/react-db';
import { CheckCircle2, Circle, Link, Lock, Plus, Settings, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { connectionCollection } from '@/collections/connection.collection';
import { providerCollection } from '@/collections/provider.collection';
import { providerConfigCollection } from '@/collections/provider-config.collection';
import { useAuthUser } from '@/hooks/use-auth-user';
import { refreshPluginsAfterWrite, usePlugins } from '@/hooks/use-plugins';
import { getSourceColor } from '@/lib/source-colors';
import type { Connection, PluginManifest, Provider, ProviderConfig } from '@/shared';
import { getDefaultConfigForType } from '../providers/available-provider-types';
import type { ConfigFormData } from '../providers/provider-config-form';
import { ProviderConfigForm } from '../providers/provider-config-form';
import { getProviderInfoFromManifests } from '../providers/provider-info';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Button } from '../ui/button';
import { Card, CardAction, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 15 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

interface Props {
  manifest: PluginManifest;
}

export function ProviderOnboardingCard({ manifest }: Props) {
  const { t } = useTranslation();
  const { manifests } = usePlugins();
  const user = useAuthUser();
  const isAdmin = user.role === 'admin';
  const [configOpen, setConfigOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { data: provider } = useLiveQuery({
    query: (q) =>
      q
        .from({ providers: providerCollection })
        .where(({ providers }) => eq(providers.type, manifest.id))
        .findOne(),
  });

  const { data: connections = [] } = useLiveQuery({ query: (q) => q.from({ connections: connectionCollection }).where(({ connections }) => eq(connections.type, manifest.id)) });
  const { data: serverConfigs = [] } = useLiveQuery({ query: (q) => q.from({ configs: providerConfigCollection }).where(({ configs }) => eq(configs.type, manifest.id)) });
  const serverConfig = (serverConfigs as ProviderConfig[])[0];
  const providerInfo = getProviderInfoFromManifests(t, manifests);
  const info = providerInfo[manifest.id];
  const userConnection = connections.find((c) => c.user === user.id);
  const configInitial = useMemo(() => (serverConfig?.config ?? getDefaultConfigForType(manifests, manifest.id)) as ConfigFormData, [serverConfig?.config, manifests, manifest.id]);
  const connectInitial = useMemo(() => (userConnection?.config ?? getDefaultConfigForType(manifests, manifest.id, true)) as ConfigFormData, [userConnection?.config, manifests, manifest.id]);
  const handleConfigure = async (config: ConfigFormData) => {
    // The provider and its configuration are two records and there is no
    // transaction across them. An enabled provider with no configuration is the
    // state the screens cannot make sense of, so the one written here is taken
    // back when the other fails.
    let addedProviderId: string | null = null;
    try {
      if (!provider) {
        const id = generateId();
        await providerCollection.insert({
          id,
          type: manifest.id,
          category: manifest.features.includes('device') ? 'device' : ('track' as const),
          enabled: true,
        } as Provider).isPersisted.promise;
        addedProviderId = id;
      }

      if (serverConfig) {
        await providerConfigCollection.update(serverConfig.id, (draft) => {
          draft.config = config;
        }).isPersisted.promise;
      } else {
        await providerConfigCollection.insert({ id: generateId(), type: manifest.id, config } as ProviderConfig).isPersisted.promise;
      }

      await refreshPluginsAfterWrite();

      toast.success(t('ProviderCardActions.providerConnectedSuccess', { title: info?.title }));
      setConfigOpen(false);
    } catch (err) {
      console.error(err);
      if (addedProviderId) {
        await providerCollection.delete(addedProviderId).isPersisted.promise.catch((cleanup) => console.error(cleanup));
      }
      toast.error(t('ProviderCardActions.providerSaveError', { title: info?.title }));
    }
  };

  const handleConnect = async (config: ConfigFormData) => {
    if (!provider) {
      return;
    }

    try {
      if (userConnection) {
        const tx = connectionCollection.update(userConnection.id, (draft) => {
          draft.config = config;
          draft.enabled = true;
        });
        await tx.isPersisted.promise;
      } else {
        const tx = connectionCollection.insert({
          id: generateId(),
          type: manifest.id,
          user: user.id,
          config,
          enabled: true,
        } as Connection);
        await tx.isPersisted.promise;
      }

      toast.success(t('ProviderCardActions.providerConnectedSuccess', { title: info?.title }));
      setConnectOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(t('ProviderCardActions.providerSaveError', { title: info?.title }));
    }
  };

  const handleDelete = async () => {
    if (!provider) {
      return;
    }

    setIsDeleting(true);
    try {
      await Promise.all(connections.map((c) => connectionCollection.delete(c.id).isPersisted.promise));
      await providerCollection.delete(provider.id).isPersisted.promise;
      toast.success(t('ProviderCardActions.providerDeletedSuccess', { title: info?.title }));
      setDeleteOpen(false);
    } catch {
      toast.error(t('ProviderCardActions.providerDeleteError', { title: info?.title }));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!info) {
    return null;
  }

  const Icon = info.icon;
  const isShared = manifest.scope === 'shared';
  const isConfigured = !!provider;
  const hasConnectionSchema = !!manifest.connectionSchema?.length;
  const isConnected = !hasConnectionSchema || (!!userConnection && userConnection.enabled !== false);
  const showConfigButton = isAdmin && !!manifest.configSchema?.length && !info.isAutoDiscovery;
  const showAddButton = isAdmin && !isConfigured && (!manifest.configSchema?.length || info.isAutoDiscovery);
  const showConnectButton = isConfigured && hasConnectionSchema;
  const showDeleteButton = isAdmin && isConfigured;
  const deleteOnly = showDeleteButton && !showConfigButton && !showConnectButton;
  const isUnavailable = !isConfigured && !isAdmin;
  const isAdminManaged = isConfigured && isShared && !isAdmin;
  const isDone = isConfigured && isConnected && !isAdminManaged;
  const statusIcon = isDone ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : isAdminManaged ? <Lock className="h-5 w-5 text-muted-foreground" /> : <Circle className="h-5 w-5 text-muted-foreground" />;
  const showFooter = showConfigButton || showAddButton || showConnectButton || showDeleteButton;
  return (
    <Card className={`gap-4 p-5 ${isUnavailable || isAdminManaged ? 'opacity-60' : ''}`}>
      <CardHeader className="flex flex-row items-center gap-4 p-0">
        <Avatar className="h-12 w-12 shrink-0 rounded-xl" style={{ backgroundColor: getSourceColor(manifest.id) }}>
          <AvatarFallback className="bg-transparent text-white">
            <Icon className="h-6 w-6" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base leading-tight">{info.title}</CardTitle>
          {isAdminManaged && <p className="mt-0.5 text-xs text-muted-foreground">{t('Onboarding.adminManaged')}</p>}
        </div>
        <CardAction className="shrink-0">{statusIcon}</CardAction>
      </CardHeader>

      {showFooter && (
        <CardFooter className="flex gap-2 border-t p-0 pt-4">
          {showConfigButton && (
            <Dialog open={configOpen} onOpenChange={setConfigOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1">
                  <Settings className="h-3.5 w-3.5 mr-1.5" />
                  {t('ProviderCardActions.configure')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{info.title}</DialogTitle>
                  <DialogDescription>{info.description}</DialogDescription>
                </DialogHeader>
                <div className="mt-4">
                  <ProviderConfigForm type={manifest.id} initialConfig={configInitial} onSubmit={handleConfigure} onCancel={() => setConfigOpen(false)} isEdit={isConfigured} />
                </div>
              </DialogContent>
            </Dialog>
          )}
          {showAddButton && (
            <Button variant="outline" size="sm" className="flex-1" onClick={() => handleConfigure({})}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t('ProviderCardActions.add')}
            </Button>
          )}
          {showConnectButton && (
            <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1">
                  <Link className="h-3.5 w-3.5 mr-1.5" />
                  {t('ProviderCardActions.connect')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{info.title}</DialogTitle>
                  <DialogDescription>{info.description}</DialogDescription>
                </DialogHeader>
                <div className="mt-4">
                  <ProviderConfigForm type={manifest.id} initialConfig={connectInitial} onSubmit={handleConnect} onCancel={() => setConnectOpen(false)} isEdit={!!userConnection} useConnectionSchema />
                </div>
              </DialogContent>
            </Dialog>
          )}
          {showDeleteButton && (
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className={`text-destructive hover:bg-destructive/10 hover:text-destructive ${deleteOnly ? 'flex-1' : ''}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleteOnly && <span className="ml-1.5">{t('ProviderCardActions.delete')}</span>}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('ProviderCardActions.deleteConfirmTitle')}</DialogTitle>
                  <DialogDescription>{t('ProviderCardActions.deleteConfirmDescription', { title: info.title })}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                    {isDeleting ? t('ProviderCardActions.deleting') : t('ProviderCardActions.delete')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
