import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/auth/auth-layout';
import { RegisterForm } from '@/components/auth/register-form';
import { pb } from '@/lib/pocketbase';
import { fetchRegistrationAllowed } from '@/lib/settings';

export const Route = createFileRoute('/register')({
  beforeLoad: async () => {
    if (pb.authStore.isValid) {
      throw redirect({ to: '/login' });
    }

    if (!(await fetchRegistrationAllowed())) {
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
