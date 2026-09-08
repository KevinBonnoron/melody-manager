import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/auth/auth-layout';
import { RegisterForm } from '@/components/auth/register-form';
import { config } from '@/lib/config';
import { pb } from '@/lib/pocketbase';

export const Route = createFileRoute('/register')({
  beforeLoad: () => {
    if (config.registrationDisabled || pb.authStore.isValid) {
      throw redirect({ to: '/login' });
    }
  },
  component: RegisterPage,
});

function RegisterPage() {
  const { t } = useTranslation();
  return (
    <AuthLayout title={t('RegisterPage.title')} description={t('RegisterPage.description')}>
      <RegisterForm />
    </AuthLayout>
  );
}
