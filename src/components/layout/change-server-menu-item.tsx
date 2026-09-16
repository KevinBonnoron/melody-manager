import { Preferences } from '@capacitor/preferences';
import { ServerCog } from 'lucide-react';
import { useAuth } from 'pocketbase-react-hooks';
import { useTranslation } from 'react-i18next';
import { isStandaloneClient } from '@/lib/client-target';
import { DropdownMenuItem } from '../ui/dropdown-menu';

export function ChangeServerMenuItem() {
  const { t } = useTranslation();
  const { signOut } = useAuth();

  if (!isStandaloneClient) {
    return null;
  }

  const handleChangeServer = async () => {
    signOut();
    await Preferences.remove({ key: 'serverUrl' });
    window.location.replace('/');
  };

  return (
    <DropdownMenuItem onClick={handleChangeServer}>
      <ServerCog className="mr-2 h-4 w-4" />
      <span>{t('ChangeServerMenuItem.label')}</span>
    </DropdownMenuItem>
  );
}
