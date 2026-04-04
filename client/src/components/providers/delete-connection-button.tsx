import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { connectionCollection } from '@/collections/connection.collection';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';

interface Props {
  title: string;
  connectionId: string;
}

export function DeleteConnectionButton({ title, connectionId }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await connectionCollection.delete(connectionId);
      toast.success(t('ProviderCardActions.providerDeletedSuccess', { title }));
      setOpen(false);
    } catch {
      toast.error(t('ProviderCardActions.providerDeleteError', { title }));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-0 flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5 xl:mr-1.5" />
          <span className="hidden xl:inline">{t('ProviderCardActions.delete')}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ProviderCardActions.deleteConfirmTitle')}</DialogTitle>
          <DialogDescription>{t('ProviderCardActions.deleteConfirmDescription', { title })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isDeleting}>
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
