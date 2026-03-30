import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useTranslation } from 'react-i18next';
import { connectionCollection } from '@/collections/connection.collection';
import { providerCollection } from '@/collections/provider.collection';
import { useAuthUser } from '@/hooks/use-auth-user';
import { usePlugins } from '@/hooks/use-plugins';
import { ConnectionCard } from './connection-card';
import { ProviderConnectCard } from './provider-connect-card';

export function ConnectionList() {
  const { t } = useTranslation();
  const { manifests } = usePlugins();
  const user = useAuthUser();

  // All enabled personal providers (system-level)
  const { data: providers = [] } = useLiveQuery((q) => q.from({ providers: providerCollection }).where(({ providers }) => eq(providers.enabled, true)));

  const personalProviders = providers.filter((p) => {
    const manifest = manifests.find((m) => m.id === p.type);
    return manifest?.scope === 'personal';
  });

  const personalProviderIds = personalProviders.map((p) => p.id);

  const { data: connections = [] } = useLiveQuery(
    (q) =>
      q
        .from({ connections: connectionCollection })
        .where(({ connections }) => eq(connections.user, user.id))
        .where(({ connections }) => inArray(connections.provider, personalProviderIds)),
    [user.id, personalProviderIds.join(',')],
  );

  const connectedProviderIds = new Set(connections.map((c) => c.provider));

  if (personalProviders.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('Admin.noProvidersInCategory')}</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {personalProviders.map((p) => {
        const connection = connections.find((c) => c.provider === p.id);
        if (connectedProviderIds.has(p.id) && connection) {
          return <ConnectionCard key={p.id} connectionId={connection.id} />;
        }
        return <ProviderConnectCard key={p.id} providerId={p.id} />;
      })}
    </div>
  );
}
