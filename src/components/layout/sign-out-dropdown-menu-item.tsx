import { LogOut } from 'lucide-react';
import { useAuth } from 'pocketbase-react-hooks';
import { useTranslation } from 'react-i18next';
import { DropdownMenuItem } from '../ui/dropdown-menu';

export function SignOutDropdownMenuItem() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  function handleLogout() {
    signOut();
    window.location.replace('/login');
  }

  return (
    <DropdownMenuItem onClick={handleLogout}>
      <LogOut className="mr-2 h-4 w-4" />
      <span>{t('SignOutDropdownMenuItem.label')}</span>
    </DropdownMenuItem>
  );
}
