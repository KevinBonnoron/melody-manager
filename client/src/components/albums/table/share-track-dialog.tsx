import type { ShareLink, Track } from '@melody-manager/shared';
import { Check, Copy, Link } from 'lucide-react';
import { nanoid } from 'nanoid';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { shareLinkCollection } from '@/collections/share-link.collection';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthUser } from '@/hooks/use-auth-user';
import { config } from '@/lib/config';

interface Props {
  track: Track;
  children: ReactElement;
}

export function ShareTrackDialog({ track, children }: Props) {
  const { t } = useTranslation();
  const user = useAuthUser();
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const token = nanoid(12);
      shareLinkCollection.insert({
        id: 'tmp',
        token,
        track: track.id,
        createdBy: user.id,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : '',
      } as ShareLink);
      setShareUrl(`${config.server.url}/share/stream/${token}`);
    } catch {
      toast.error(t('TrackActionsMenu.shareError'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) {
      return;
    }

    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success(t('TrackActionsMenu.shareCopied'));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) {
      setShareUrl(null);
      setCopied(false);
      setExpiresAt('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('TrackActionsMenu.shareDialogTitle')}</DialogTitle>
          <DialogDescription>{t('TrackActionsMenu.shareDialogDescription', { title: track.title })}</DialogDescription>
        </DialogHeader>

        {!shareUrl ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="expiresAt">{t('TrackActionsMenu.expiresAt')}</Label>
              <Input id="expiresAt" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t('TrackActionsMenu.expiresAtHint')}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {t('TrackActionsMenu.cancel')}
              </Button>
              <Button onClick={handleCreate} disabled={isCreating}>
                <Link className="h-4 w-4 mr-2" />
                {isCreating ? t('TrackActionsMenu.creating') : t('TrackActionsMenu.createLink')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input readOnly value={shareUrl} className="font-mono text-sm" aria-label={t('TrackActionsMenu.shareDialogTitle')} />
              <Button size="icon" variant="outline" onClick={handleCopy} aria-label={t('TrackActionsMenu.shareCopied')}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {t('TrackActionsMenu.close')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
