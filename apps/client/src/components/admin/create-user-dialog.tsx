import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usersClient } from '@/clients/users.client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { User } from '@/shared';

const PASSWORD_MIN_LENGTH = 8;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<User['role']>('user');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const passwordTooShort = password.length > 0 && password.length < PASSWORD_MIN_LENGTH;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const incomplete = email.trim() === '' || password === '' || passwordTooShort || passwordsMismatch;

  const reset = () => {
    setName('');
    setEmail('');
    setRole('user');
    setPassword('');
    setConfirmPassword('');
  };

  const save = async () => {
    if (isSaving || incomplete) {
      return;
    }

    setIsSaving(true);
    try {
      await usersClient.createUser({ email: email.trim(), password, name: name.trim(), role });
      toast.success(t('Admin.userCreated', { name: name.trim() || email.trim() }));
      onOpenChange(false);
      reset();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : t('Admin.createUserError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Admin.createUser')}</DialogTitle>
          <DialogDescription>{t('Admin.createUserDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="new-user-name">{t('Admin.name')}</Label>
            <Input id="new-user-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="new-user-email">{t('Admin.email')}</Label>
            <Input id="new-user-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="new-user-role">{t('Admin.role')}</Label>
            <Select value={role} onValueChange={(next) => setRole(next as User['role'])}>
              <SelectTrigger id="new-user-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">{t('Admin.roleUser')}</SelectItem>
                <SelectItem value="admin">{t('Admin.roleAdmin')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="new-user-password">{t('Admin.password')}</Label>
            <Input id="new-user-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
            {passwordTooShort ? <p className="text-[12px] text-destructive">{t('Admin.passwordTooShort', { count: PASSWORD_MIN_LENGTH })}</p> : <p className="text-[12px] text-muted-foreground">{t('Admin.passwordHint')}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="new-user-password-confirm">{t('Admin.confirmPassword')}</Label>
            <Input id="new-user-password-confirm" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
            {passwordsMismatch && <p className="text-[12px] text-destructive">{t('Admin.passwordsMismatch')}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={isSaving || incomplete}>
            {isSaving ? t('Admin.saving') : t('Admin.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
