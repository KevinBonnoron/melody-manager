import { SetupPage } from '@/components/setup/setup-page';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/setup')({
  beforeLoad: async () => {
    if (!Capacitor.isNativePlatform()) {
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
