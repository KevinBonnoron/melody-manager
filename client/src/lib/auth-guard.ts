import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { redirect } from '@tanstack/react-router';
import { pb } from './pocketbase';

export async function authGuard() {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: 'serverUrl' });
    if (!value) {
      throw redirect({ to: '/setup' });
    }
  }

  if (!pb.authStore.isValid) {
    throw redirect({ to: '/login' });
  }
}
