import { useLiveQuery } from '@tanstack/react-db';
import { ChevronDown, MoreVertical, Plus, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { metadataClient } from '@/clients/metadata.client';
import { providerCollection } from '@/collections/provider.collection';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePlugins } from '@/hooks/use-plugins';
import { AdminProviderAddButton } from './admin-provider-add-button';
import { AdminProviderCard } from './admin-provider-card';
import { getProviderInfoFromManifests } from './provider-info';

export function AdminProviderList() {
  const { t } = useTranslation();
  const { manifests } = usePlugins();
  const { data: providers = [] } = useLiveQuery((q) => q.from({ providers: providerCollection }));
  const configuredTypes = new Set(providers.map((p) => p.type));
  const availableToAdd = manifests.filter((m) => !configuredTypes.has(m.id));
  const providerInfo = getProviderInfoFromManifests(t, manifests);
  const handleEnrichAll = async () => {
    try {
      const res = await metadataClient.enrichAll();
      if (!res.taskId) {
        throw new Error('No taskId returned');
      }

      toast.success(t('Admin.enrichAllStarted'));
    } catch {
      toast.error(t('Admin.enrichAllFailed'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>{providers.length > 0 ? <p className="text-muted-foreground text-sm">{t('Admin.providersCount', { count: providers.length })}</p> : <p className="text-muted-foreground text-sm">{t('Admin.noProvidersInCategory')}</p>}</div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label={t('Admin.providerActions')}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleEnrichAll}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('Admin.enrichAllTitle')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t('Admin.addProvider')}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
              {availableToAdd.length === 0 ? (
                <div className="px-2 py-4 text-center text-muted-foreground text-sm">{t('Admin.allProviderTypesAdded')}</div>
              ) : (
                availableToAdd.map((m) => {
                  const category = m.features.includes('device') ? ('device' as const) : ('track' as const);
                  const info = providerInfo[m.id];
                  return <AdminProviderAddButton key={m.id} type={m.id} category={category} title={info?.title ?? m.id} description={info?.description ?? ''} />;
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {providers.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => (
            <AdminProviderCard key={p.id} providerId={p.id} />
          ))}
        </div>
      )}
    </div>
  );
}
