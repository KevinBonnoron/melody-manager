import { Link, useNavigate } from '@tanstack/react-router';
import { useAuth } from 'pocketbase-react-hooks';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { useRegistrationAllowed } from '@/hooks/use-registration-allowed';
import { useAppForm } from '@/lib/forms';
import { Button } from '../ui/button';

export function LoginForm() {
  const registrationAllowed = useRegistrationAllowed();
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
        const user = await signIn.email(value.email, value.password);
        if (!user) {
          toast.error(t('LoginForm.error'));
          return;
        }

        toast.success(t('LoginForm.success'));
        // A full reload, not a route change: the realtime stream and the
        // collections were started before anyone was signed in, so they carry
        // no token and never retry. Everything that reads the session once, at
        // startup, has to start again now that there is one.
        window.location.replace('/');
      } catch (error) {
        // A request that never reached the server is not a refused one. Saying
        // "wrong email or password" there sends the listener hunting for a
        // mistake they did not make.
        toast.error(t(isUnreachable(error) ? 'LoginForm.unreachable' : 'LoginForm.error'));
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
              <Button variant="link" size="sm" tabIndex={-1} onClick={() => navigate({ to: '/reset-password' })}>
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

      {registrationAllowed && (
        <p className="text-center text-sm text-muted-foreground">
          {t('SignInForm.dontHaveAccount')}{' '}
          <Link to="/register" className="text-primary hover:underline">
            {t('SignInForm.signUp.label')}
          </Link>
        </p>
      )}
    </form>
  );
}

// Whether a sign-in failed before the server could answer: no response at all,
// or one the browser refused to hand over. PocketBase reports a refusal with a
// status; a network or CORS failure has none.
function isUnreachable(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return !status || status === 0;
}
