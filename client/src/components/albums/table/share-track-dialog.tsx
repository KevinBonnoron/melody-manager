import { shareLinkCollection } from '@/collections/share-link.collection';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthUser } from '@/hooks/use-auth-user';
import type { ShareLink, Track } from '@melody-manager/shared';
import { Check, Copy, Link, Share2 } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface Props {
  track: Track;
}

export function ShareTrackDialog({ track }: Props) {
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
      await shareLinkCollection.insert({
        id: 'tmp',
        token,
        track: track.id,
        createdBy: user.id,
        expiresAt: expiresAt || '',
      } as ShareLink);
      setShareUrl(`${window.location.origin}/api/share/stream/${token}`);
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
    <>
      <DropdownMenuItem
        disabled={!track.metadata?.localPath && track.expand?.provider?.type !== 'local'}
        onSelect={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        <Share2 className="h-4 w-4 mr-2" />
        {t('TrackActionsMenu.share')}
      </DropdownMenuItem>

      <Dialog open={open} onOpenChange={handleOpenChange}>
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
                <Input readOnly value={shareUrl} className="font-mono text-sm" />
                <Button size="icon" variant="outline" onClick={handleCopy}>
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
    </>
  );
}
