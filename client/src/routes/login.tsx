import { AuthLayout } from '@/components/auth/auth-layout';
import { LoginForm } from '@/components/auth/login-form';
import { pb } from '@/lib/pocketbase';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: 'serverUrl' });
      if (!value) {
        throw redirect({ to: '/setup' });
      }
    }

    if (pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();

  return (
    <AuthLayout title={t('LoginPage.title')} description={t('LoginPage.description')}>
      <LoginForm />
    </AuthLayout>
  );
}
