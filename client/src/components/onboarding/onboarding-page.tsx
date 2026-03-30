import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { connectionCollection } from '@/collections/connection.collection';
import { providerCollection } from '@/collections/provider.collection';
import { ConnectionCard } from '@/components/providers/connection-card';
import { ProviderConnectCard } from '@/components/providers/provider-connect-card';
import { Button } from '@/components/ui/button';
import { useAuthUser } from '@/hooks/use-auth-user';
import { usePlugins } from '@/hooks/use-plugins';
import { pb } from '@/lib/pocketbase';
import { PublicProviderCard } from './public-provider-card';

export function OnboardingPage() {
  const { t } = useTranslation();
  const { manifests } = usePlugins();
  const user = useAuthUser();
  const navigate = useNavigate();

  const { data: providers = [] } = useLiveQuery((q) => q.from({ providers: providerCollection }).where(({ providers }) => eq(providers.enabled, true)));

  const visibleProviders = providers
    .filter((p) => {
      const manifest = manifests.find((m) => m.id === p.type);
      return manifest?.scope === 'public' || manifest?.scope === 'personal';
    })
    .sort((a, b) => {
      const scopeOrder = { public: 0, personal: 1, shared: 2 };
      const aScope = manifests.find((m) => m.id === a.type)?.scope ?? 'personal';
      const bScope = manifests.find((m) => m.id === b.type)?.scope ?? 'personal';
      return (scopeOrder[aScope] ?? 1) - (scopeOrder[bScope] ?? 1);
    });

  const personalProviderIds = visibleProviders.filter((p) => manifests.find((m) => m.id === p.type)?.scope === 'personal').map((p) => p.id);

  const { data: connections = [] } = useLiveQuery(
    (q) =>
      q
        .from({ connections: connectionCollection })
        .where(({ connections }) => eq(connections.user, user.id))
        .where(({ connections }) => inArray(connections.provider, personalProviderIds.length > 0 ? personalProviderIds : [''])),
    [user.id, personalProviderIds.join(',')],
  );

  const connectionByProviderId = new Map(connections.map((c) => [c.provider, c]));
  const [isContinuing, setIsContinuing] = useState(false);

  const handleContinue = async () => {
    setIsContinuing(true);
    try {
      await pb.collection('users').update(user.id, { onboardingDone: true });
      await pb.collection('users').authRefresh();
      navigate({ to: '/' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to continue';
      toast.error(message);
    } finally {
      setIsContinuing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">{t('Onboarding.title')}</h1>
          <p className="text-muted-foreground max-w-md mx-auto">{t('Onboarding.description')}</p>
        </div>

        {visibleProviders.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {visibleProviders.map((p) => {
              const manifest = manifests.find((m) => m.id === p.type);
              if (manifest?.scope === 'public') {
                return <PublicProviderCard key={p.id} providerId={p.id} />;
              }
              const connection = connectionByProviderId.get(p.id);
              if (connectionByProviderId.has(p.id) && connection) {
                return <ConnectionCard key={p.id} connectionId={connection.id} />;
              }
              return <ProviderConnectCard key={p.id} providerId={p.id} />;
            })}
          </div>
        )}

        <div className="flex justify-center">
          <Button onClick={handleContinue} size="lg" disabled={isContinuing}>
            {t('Onboarding.continue')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
