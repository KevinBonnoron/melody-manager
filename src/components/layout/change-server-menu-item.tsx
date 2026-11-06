import { Preferences } from '@capacitor/preferences';
import { ServerCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { signOutSession } from '@/lib/auth-session';
import { isStandaloneClient } from '@/lib/client-target';
import { pb } from '@/lib/pocketbase';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { DropdownMenuItem } from '../ui/dropdown-menu';

async function switchServerLocally() {
  pb.authStore.clear();
  await Preferences.remove({ key: 'serverUrl' });
  window.location.replace('/');
}

export function ChangeServerMenuItem({ onRevocationFailed }: { onRevocationFailed?: () => void }) {
  const { t } = useTranslation();

  if (!isStandaloneClient) {
    return null;
  }

  const handleChangeServer = async () => {
    try {
      await signOutSession();
    } catch {
      toast.error(t('common.signOutError'));
      onRevocationFailed?.();
      return;
    }
    await switchServerLocally();
  };

  return (
    <DropdownMenuItem onClick={handleChangeServer}>
      <ServerCog className="mr-2 h-4 w-4" />
      <span>{t('ChangeServerMenuItem.label')}</span>
    </DropdownMenuItem>
  );
}

// Rendered outside the dropdown content: the menu unmounts its items when it
// closes, before the async revocation above can fail, so the fallback dialog
// cannot live next to the menu item.
export function ChangeServerFallbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('ChangeServerMenuItem.localFallbackTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('ChangeServerMenuItem.localFallbackDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={() => void switchServerLocally()}>{t('ChangeServerMenuItem.localFallbackConfirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
