import { useAppForm } from '@/lib/forms';
import { Link, useNavigate } from '@tanstack/react-router';
import { useAuth } from 'pocketbase-react-hooks';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '../ui/button';

export function LoginForm() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const form = useAppForm({
    defaultValues: {
      email: '',
      password: '',
    },
    onSubmit: async ({ value }) => {
      try {
        await signIn.email(value.email, value.password);
        toast.success(t('LoginForm.success'));
        navigate({ to: '/' });
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : 'Failed to login';
        toast.error(message);
      }
    },
    validators: {
      onSubmit: z.object({
        email: z.string().email(t('forms.errors.email')),
        password: z.string().min(8, t('forms.errors.minLength', { length: 8 })),
      }),
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    form.handleSubmit(e);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <form.AppField name="email">{(field) => <field.EmailField label={t('SignInForm.email.label')} placeholder={t('SignInForm.email.placeholder')} autoComplete="off" {...field} />}</form.AppField>
      <form.AppField name="password">
        {(field) => (
          <field.PasswordField
            label={t('SignInForm.password.label')}
            labelAction={
              <Button variant="link" size="sm" onClick={() => navigate({ to: '/reset-password' })}>
                {t('SignInForm.forgotPassword.label')}
              </Button>
            }
            placeholder={t('SignInForm.password.placeholder')}
            autoComplete="new-password"
            {...field}
          />
        )}
      </form.AppField>

      <form.AppForm>
        <form.SubmitButton label={t('SignInForm.submit.label')} />
      </form.AppForm>

      <p className="text-center text-sm text-muted-foreground">
        {t('SignInForm.dontHaveAccount')}{' '}
        <Link to="/register" className="text-primary hover:underline">
          {t('SignInForm.signUp.label')}
        </Link>
      </p>
    </form>
  );
}
