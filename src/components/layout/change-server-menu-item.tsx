import { Preferences } from '@capacitor/preferences';
import { ServerCog } from 'lucide-react';
import { useAuth } from 'pocketbase-react-hooks';
import { useTranslation } from 'react-i18next';
import { isStandaloneClient } from '@/lib/client-target';
import { DropdownMenuItem } from '../ui/dropdown-menu';

// Only a client that was told where its server is can be told again. In a
// browser the server is wherever the page came from, so there is nothing to
// change.
export function ChangeServerMenuItem() {
  const { t } = useTranslation();
  const { signOut } = useAuth();

  if (!isStandaloneClient) {
    return null;
  }

  const handleChangeServer = async () => {
    // The session belongs to the server being left, so it goes with it.
    signOut();
    await Preferences.remove({ key: 'serverUrl' });
    // A full reload, because the address is read once when the app starts.
    window.location.replace('/');
  };

  return (
    <DropdownMenuItem onClick={handleChangeServer}>
      <ServerCog className="mr-2 h-4 w-4" />
      <span>{t('ChangeServerMenuItem.label')}</span>
    </DropdownMenuItem>
  );
}
