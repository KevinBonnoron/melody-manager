import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { connectionCollection } from '@/collections/connection.collection';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

interface Props {
  title: string;
  connectionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DisconnectSourceDialog({ title, connectionId, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [isDeleting, setIsDeleting] = useState(false);
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await connectionCollection.delete(connectionId).isPersisted.promise;
      toast.success(t('ProviderCardActions.providerDisconnectedSuccess', { title }));
      onOpenChange(false);
    } catch {
      toast.error(t('ProviderCardActions.providerDisconnectError', { title }));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ProviderCardActions.disconnectConfirmTitle')}</DialogTitle>
          <DialogDescription>{t('ProviderCardActions.disconnectConfirmDescription', { title })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            {t('AlbumActionsMenu.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? t('ProviderCardActions.disconnecting') : t('ProviderCardActions.disconnect')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
