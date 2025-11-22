import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { pb } from '@/lib/pocketbase';
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useAuth } from 'pocketbase-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export function RegisterForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error(t('RegisterForm.errors.passwordsMismatch'));
      return;
    }

    if (password.length < 8) {
      toast.error(t('RegisterForm.errors.passwordTooShort'));
      return;
    }

    setIsLoading(true);

    try {
      await pb.collection('users').create({
        email,
        password,
        passwordConfirm: password,
        name,
        role: 'user',
      });

      await signIn.email(email, password);

      toast.success(t('RegisterForm.success'));
      navigate({ to: '/' });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('RegisterForm.errors.createFailed');
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t('RegisterForm.name.label')}</Label>
        <Input id="name" type="text" placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} required disabled={isLoading} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{t('RegisterForm.email.label')}</Label>
        <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isLoading} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t('RegisterForm.password.label')}</Label>
        <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} disabled={isLoading} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t('RegisterForm.confirmPassword.label')}</Label>
        <Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={isLoading} />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {t('RegisterForm.submit.label')}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t('RegisterForm.alreadyHaveAccount')}{' '}
        <Link to="/login" className="text-primary hover:underline">
          {t('RegisterForm.signIn.label')}
        </Link>
      </p>
    </form>
  );
}
