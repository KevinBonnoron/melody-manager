import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { providerConfigCollection } from '@/collections/provider-config.collection';
import { refreshPluginsAfterWrite } from '@/hooks/use-plugins';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

interface Props {
  title: string;
  configId: string;
  dropsLibrary?: boolean;
  // Run inside the confirmation, before the row goes. Whatever else has to
  // change with it happens first, and its failure cancels the deletion rather
  // than leaving the two halves disagreeing.
  beforeDelete?: () => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved?: () => void;
}

// A required field cannot be emptied, so without this the first value ever
// saved is the last one: the row has to go for the source to be unconfigured
// again.
export function RemoveProviderConfigDialog({ title, configId, dropsLibrary = false, beforeDelete, open, onOpenChange, onRemoved }: Props) {
  const { t } = useTranslation();
  const [isDeleting, setIsDeleting] = useState(false);
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await beforeDelete?.();
      await providerConfigCollection.delete(configId).isPersisted.promise;
      await refreshPluginsAfterWrite();
      toast.success(t('ProviderCardActions.serverSettingsRemoved', { title }));
      onOpenChange(false);
      onRemoved?.();
    } catch {
      toast.error(t('ProviderCardActions.providerSaveError', { title }));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ProviderCardActions.removeServerSettingsConfirmTitle')}</DialogTitle>
          <DialogDescription>{t(dropsLibrary ? 'ProviderCardActions.removeServerSettingsDropsLibrary' : 'ProviderCardActions.removeServerSettingsConfirmDescription', { title })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            {t('AlbumActionsMenu.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? t('ProviderCardActions.deleting') : t('ProviderCardActions.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
