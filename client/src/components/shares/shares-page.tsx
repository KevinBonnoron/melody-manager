import { shareLinkCollection } from '@/collections/share-link.collection';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useShareLinks } from '@/hooks/use-share-links';
import { Check, Copy, Link2Off, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export function SharesPage() {
  const { t } = useTranslation();
  const { data: shareLinks = [], isLoading } = useShareLinks();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!confirmId) {
      return;
    }
    setDeletingId(confirmId);
    setConfirmId(null);
    try {
      shareLinkCollection.delete(confirmId);
      toast.success(t('SharesPage.deleteSuccess'));
    } catch {
      toast.error(t('SharesPage.deleteError'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopy = async (token: string, id: string) => {
    const url = `${window.location.origin}/api/share/stream/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success(t('TrackActionsMenu.shareCopied'));
    setTimeout(() => setCopiedId(null), 2000);
  };

  const isExpired = (expiresAt: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (shareLinks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Link2Off className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg font-medium">{t('SharesPage.empty')}</p>
        <p className="text-sm text-muted-foreground">{t('SharesPage.emptyDescription')}</p>
      </div>
    );
  }

  return (
    <div className="pb-48">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('SharesPage.track')}</TableHead>
            <TableHead>{t('SharesPage.createdAt')}</TableHead>
            <TableHead>{t('SharesPage.expiresAt')}</TableHead>
            <TableHead>{t('SharesPage.status')}</TableHead>
            <TableHead className="text-right">{t('SharesPage.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shareLinks.map((link) => {
            const expired = isExpired(link.expiresAt);
            return (
              <TableRow key={link.id} className={expired ? 'opacity-50' : undefined}>
                <TableCell className="font-medium">{link.expand?.track?.title ?? link.track}</TableCell>
                <TableCell>{new Date(link.created).toLocaleDateString()}</TableCell>
                <TableCell>{link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : t('SharesPage.never')}</TableCell>
                <TableCell>{expired ? <span className="text-destructive text-sm">{t('SharesPage.expired')}</span> : <span className="text-green-600 dark:text-green-400 text-sm">{t('SharesPage.active')}</span>}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleCopy(link.token, link.id)} disabled={expired}>
                      {copiedId === link.id ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setConfirmId(link.id)} disabled={deletingId === link.id}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AlertDialog open={!!confirmId} onOpenChange={(open) => !open && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('SharesPage.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('SharesPage.deleteConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('SharesPage.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              {t('SharesPage.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
