import { AuthLayout } from '@/components/auth/auth-layout';
import { RegisterForm } from '@/components/auth/register-form';
import { pb } from '@/lib/pocketbase';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/register')({
  beforeLoad: () => {
    if (pb.authStore.isValid) {
      throw redirect({ to: '/' });
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
