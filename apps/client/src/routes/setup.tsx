import { Preferences } from '@capacitor/preferences';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { SetupPage } from '@/components/setup/setup-page';
import { isStandaloneClient } from '@/lib/client-target';

export const Route = createFileRoute('/setup')({
  beforeLoad: async () => {
    if (!isStandaloneClient) {
      throw redirect({ to: '/' });
    }

    const { value } = await Preferences.get({ key: 'serverUrl' });
    if (value) {
      throw redirect({ to: '/' });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <SetupPage />;
}
