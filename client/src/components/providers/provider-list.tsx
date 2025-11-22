import { providerCollection } from '@/collections/provider.collection';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useLiveQuery } from '@tanstack/react-db';
import { ChevronDown, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ALL_AVAILABLE_PROVIDER_TYPES } from './available-provider-types';
import { CreateProviderButton } from './create-provider-button';
import { ProviderCard } from './provider-card';
import { getProviderInfo } from './provider-info';

interface Props {
  title?: string;
  description?: string;
}

export function ProviderList({ title, description }: Props) {
  const { t } = useTranslation();

  const { data: providers = [] } = useLiveQuery((q) => q.from({ providers: providerCollection }));

  const configuredTypes = new Set(providers.map((p) => p.type));
  const availableToAdd = ALL_AVAILABLE_PROVIDER_TYPES.filter(({ type }) => !configuredTypes.has(type));

  const providerInfo = getProviderInfo(t);

  const addButton = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={availableToAdd.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          {t('Admin.addProvider')}
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        {availableToAdd.length === 0 ? (
          <div className="px-2 py-4 text-center text-muted-foreground text-sm">{t('Admin.allProviderTypesAdded')}</div>
        ) : (
          availableToAdd.map(({ type, category }) => {
            const info = providerInfo[type];
            return <CreateProviderButton key={`${category}-${type}`} type={type} category={category} title={info.title} description={info.description} />;
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-6">
      {(title ?? description) && (
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-2xl font-bold">{title}</h2>}
            {description && <p className="text-muted-foreground">{description}</p>}
          </div>
          {addButton}
        </div>
      )}
      {!(title ?? description) && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>{providers.length > 0 ? <p className="text-muted-foreground text-sm">{t('Admin.providersCount', { count: providers.length })}</p> : <p className="text-muted-foreground text-sm">{t('Admin.noProvidersInCategory')}</p>}</div>
          {addButton}
        </div>
      )}
      {(title ?? description) && <div>{providers.length > 0 ? <p className="text-muted-foreground text-sm">{t('Admin.providersCount', { count: providers.length })}</p> : <p className="text-muted-foreground text-sm">{t('Admin.noProvidersInCategory')}</p>}</div>}

      {providers.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => (
            <ProviderCard key={p.id} providerId={p.id} />
          ))}
        </div>
      )}
    </div>
  );
}
