import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { playlistsClient } from '@/clients/playlists.client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackIds?: string[];
}

export function CreatePlaylistDialog({ open, onOpenChange, trackIds }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    setIsSaving(true);
    try {
      const playlist = await playlistsClient.create({ name: trimmed, description: description.trim() || undefined, trackIds });
      toast.success(t('CreatePlaylist.created', { name: trimmed }));
      onOpenChange(false);
      setName('');
      setDescription('');
      if (!trackIds?.length) {
        navigate({ to: '/playlists/$playlistId', params: { playlistId: playlist.id } });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('CreatePlaylist.error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('CreatePlaylist.title')}</DialogTitle>
          <DialogDescription>{t('CreatePlaylist.description')}</DialogDescription>
        </DialogHeader>
        <form
          className="mt-2 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="playlist-name">{t('CreatePlaylist.nameLabel')}</Label>
            <Input id="playlist-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="playlist-description">{t('CreatePlaylist.descriptionLabel')}</Label>
            <Textarea id="playlist-description" rows={3} className="field-sizing-fixed min-h-0" value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              {t('CreatePlaylist.cancel')}
            </Button>
            <Button type="submit" disabled={isSaving || !name.trim()}>
              {isSaving ? t('CreatePlaylist.creating') : t('CreatePlaylist.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
