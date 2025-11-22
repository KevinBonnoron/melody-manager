import { AuthLayout } from '@/components/auth/auth-layout';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { pb } from '@/lib/pocketbase';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/reset-password')({
  beforeLoad: () => {
    if (pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation();

  return (
    <AuthLayout title={t('ResetPasswordPage.title')} description={t('ResetPasswordPage.description')}>
      <ResetPasswordForm />
    </AuthLayout>
  );
}
