import { Preferences } from '@capacitor/preferences';
import { redirect } from '@tanstack/react-router';
import { isStandaloneClient } from './client-target';
import { pb } from './pocketbase';

export async function authGuard() {
  if (isStandaloneClient) {
    const { value } = await Preferences.get({ key: 'serverUrl' });
    if (!value) {
      throw redirect({ to: '/setup' });
    }
  }

  if (!pb.authStore.isValid) {
    throw redirect({ to: '/login' });
  }

  if (!pb.authStore.record?.onboardingDone) {
    throw redirect({ to: '/onboarding' });
  }
}
