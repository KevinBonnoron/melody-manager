import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { pb } from '@/lib/pocketbase';
import { Link } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export function ResetPasswordForm() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await pb.collection('users').requestPasswordReset(email);
      setIsSuccess(true);
      toast.success(t('ResetPasswordForm.success'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send reset email';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950 p-4">
          <p className="text-sm text-green-800 dark:text-green-200">{t('ResetPasswordForm.success')}</p>
        </div>

        <Link to="/login">
          <Button variant="outline" className="w-full">
            {t('ResetPasswordForm.backToLogin')}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t('ResetPasswordForm.email.label')}</Label>
        <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isLoading} />
        <p className="text-sm text-muted-foreground">{t('ResetPasswordForm.enterEmail')}</p>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {t('ResetPasswordForm.sendResetLink')}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t('ResetPasswordForm.rememberPassword')}{' '}
        <Link to="/login" className="text-primary hover:underline">
          {t('ResetPasswordForm.signIn')}
        </Link>
      </p>
    </form>
  );
}
