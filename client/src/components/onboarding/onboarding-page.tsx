import { useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { providerCollection } from '@/collections/provider.collection';
import { useAuthUser } from '@/hooks/use-auth-user';
import { usePlugins } from '@/hooks/use-plugins';
import { pb } from '@/lib/pocketbase';
import { Button } from '../ui/button';
import { ProviderOnboardingCard } from './provider-onboarding-card';

export function OnboardingPage() {
  const { t } = useTranslation();
  const { manifests, loading } = usePlugins();
  const user = useAuthUser();
  const isAdmin = user.role === 'admin';
  const navigate = useNavigate();
  const [isContinuing, setIsContinuing] = useState(false);

  const { data: providers = [] } = useLiveQuery((q) => q.from({ providers: providerCollection }), []);

  const handleContinue = useCallback(async () => {
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
  }, [user.id, navigate]);

  // For non-admins, only show providers that are configured and require user credentials
  const configuredProviderTypes = new Set(providers.filter((p) => p.enabled).map((p) => p.type));
  const visibleManifests = isAdmin ? manifests : manifests.filter((m) => m.connectionSchema?.some((f) => f.required) && configuredProviderTypes.has(m.id));

  // Auto-skip onboarding for non-admins if there's nothing to connect
  useEffect(() => {
    if (!isAdmin && !loading && visibleManifests.length === 0) {
      handleContinue();
    }
  }, [isAdmin, loading, visibleManifests.length, handleContinue]);

  if (!isAdmin && loading) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">{t('Onboarding.title')}</h1>
          <p className="text-muted-foreground max-w-md mx-auto">{t('Onboarding.description')}</p>
        </div>

        {visibleManifests.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {visibleManifests.map((manifest) => (
              <ProviderOnboardingCard key={manifest.id} manifest={manifest} />
            ))}
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
