import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usersClient } from '@/clients/users.client';
import { userCollection } from '@/collections/user.collection';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { User } from '@/shared';

// What PocketBase itself enforces. Saying so before the request is sent beats
// letting a 400 come back and showing the listener a raw server message.
const PASSWORD_MIN_LENGTH = 8;

interface Props {
  user: User | null;
  isSelf: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditUserDialog({ user, isSelf, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<User['role']>('user');
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    setName(user.name ?? '');
    setEmail(user.email);
    setRole(user.role);
    setPassword('');
  }, [user]);

  const passwordTooShort = password.length > 0 && password.length < PASSWORD_MIN_LENGTH;

  const save = async () => {
    if (!user || isSaving || passwordTooShort) {
      return;
    }

    setIsSaving(true);
    try {
      // Credentials first: they are the half that can be refused, and applying
      // the optimistic half before knowing would show a save that did not
      // happen.
      const nextEmail = email.trim();
      if (nextEmail !== user.email || password) {
        await usersClient.updateCredentials(user.id, {
          ...(nextEmail !== user.email ? { email: nextEmail } : {}),
          ...(password ? { password } : {}),
        });
      }

      const nextName = name.trim();
      if (nextName !== (user.name ?? '') || role !== user.role) {
        await userCollection.update(user.id, (draft) => {
          draft.name = nextName;
          draft.role = role;
        }).isPersisted.promise;
      }

      toast.success(t('Admin.userUpdated', { name: nextName || nextEmail }));
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : t('Admin.userUpdateError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Admin.editUser')}</DialogTitle>
          <DialogDescription>{t('Admin.editUserDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="user-name">{t('Admin.name')}</Label>
            <Input id="user-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="user-email">{t('Admin.email')}</Label>
            <Input id="user-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="user-role">{t('Admin.role')}</Label>
            <Select value={role} onValueChange={(next) => setRole(next as User['role'])} disabled={isSelf}>
              <SelectTrigger id="user-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">{t('Admin.roleUser')}</SelectItem>
                <SelectItem value="admin">{t('Admin.roleAdmin')}</SelectItem>
              </SelectContent>
            </Select>
            {isSelf && <p className="text-[12px] text-muted-foreground">{t('Admin.cannotChangeOwnRole')}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="user-password">{t('Admin.newPassword')}</Label>
            <Input id="user-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('Admin.newPasswordPlaceholder')} autoComplete="new-password" />
            <p className={`text-[12px] ${passwordTooShort ? 'text-destructive' : 'text-muted-foreground'}`}>{passwordTooShort ? t('Admin.passwordTooShort', { count: PASSWORD_MIN_LENGTH }) : isSelf ? t('Admin.passwordResetSelfWarning') : t('Admin.passwordResetHint')}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t('AlbumActionsMenu.cancel')}
          </Button>
          <Button onClick={save} disabled={isSaving || passwordTooShort}>
            {isSaving ? t('Admin.saving') : t('Admin.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
