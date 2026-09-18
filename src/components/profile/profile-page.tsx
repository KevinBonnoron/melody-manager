import { Camera, Loader2 } from 'lucide-react';
import { useAuth } from 'pocketbase-react-hooks';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { SectionTabs } from '@/components/atoms/section-tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthUser } from '@/hooks/use-auth-user';
import { config } from '@/lib/config';
import { pb } from '@/lib/pocketbase';
import { AppearanceSettings } from './appearance-settings';

type Section = 'account' | 'security' | 'appearance';

export function ProfilePage() {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>('account');
  const user = useAuthUser();
  const { signIn } = useAuth();
  const [name, setName] = useState(user.name);
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarUrl = user.avatar ? `${config.pb.url}/api/files/_pb_users_auth_/${user.id}/${user.avatar}` : undefined;
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }

    setIsUpdatingName(true);
    try {
      await pb.collection('users').update(user.id, { name: name.trim() });
      toast.success(t('ProfilePage.nameUpdated'));
    } catch {
      toast.error(t('ProfilePage.nameUpdateError'));
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error(t('ProfilePage.passwordTooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('ProfilePage.passwordsMismatch'));
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await pb.collection('users').update(user.id, {
        oldPassword,
        password: newPassword,
        passwordConfirm: confirmPassword,
      });
      await signIn.email(user.email, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(t('ProfilePage.passwordUpdated'));
    } catch (error) {
      const pbError = error as { data?: { data?: Record<string, { code: string }> } };
      if (pbError?.data?.data?.oldPassword?.code === 'validation_invalid_old_password') {
        toast.error(t('ProfilePage.invalidOldPassword'));
      } else {
        toast.error(t('ProfilePage.passwordUpdateError'));
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      await pb.collection('users').update(user.id, formData);
      toast.success(t('ProfilePage.avatarUpdated'));
    } catch {
      toast.error(t('ProfilePage.avatarUpdateError'));
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button type="button" className="relative group" onClick={() => fileInputRef.current?.click()} disabled={isUploadingAvatar}>
          <Avatar className="h-24 w-24">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={user.name} />}
            <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-2xl">{user.name ? getInitials(user.name) : '?'}</AvatarFallback>
          </Avatar>
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">{isUploadingAvatar ? <Loader2 className="h-6 w-6 text-white animate-spin" /> : <Camera className="h-6 w-6 text-white" />}</div>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        <div className="min-w-0">
          <p className="text-lg font-semibold">{user.name}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <SectionTabs<Section>
        tabs={[
          { id: 'account', label: t('ProfilePage.sections.account') },
          { id: 'security', label: t('ProfilePage.sections.security') },
          { id: 'appearance', label: t('ProfilePage.sections.appearance') },
        ]}
        active={section}
        onChange={setSection}
      />

      {section === 'account' && (
        <Card className="p-4">
          <form onSubmit={handleUpdateName} className="space-y-3">
            <h3 className="font-semibold">{t('ProfilePage.name')}</h3>
            <Input id="name" aria-label={t('ProfilePage.name')} value={name} onChange={(e) => setName(e.target.value)} disabled={isUpdatingName} />
            <Button type="submit" size="sm" disabled={isUpdatingName || name.trim() === user.name}>
              {isUpdatingName && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('ProfilePage.save')}
            </Button>
          </form>
        </Card>
      )}

      {section === 'security' && (
        <Card className="p-4">
          <form onSubmit={handleUpdatePassword} className="space-y-3">
            <h3 className="font-semibold">{t('ProfilePage.changePassword')}</h3>
            <div className="space-y-2">
              <Label htmlFor="oldPassword">{t('ProfilePage.currentPassword')}</Label>
              <Input id="oldPassword" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} disabled={isUpdatingPassword} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t('ProfilePage.newPassword')}</Label>
              <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={isUpdatingPassword} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('ProfilePage.confirmPassword')}</Label>
              <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isUpdatingPassword} />
            </div>
            <Button type="submit" size="sm" disabled={isUpdatingPassword || !oldPassword || !newPassword || !confirmPassword}>
              {isUpdatingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('ProfilePage.updatePassword')}
            </Button>
          </form>
        </Card>
      )}

      {section === 'appearance' && <AppearanceSettings />}
    </div>
  );
}
