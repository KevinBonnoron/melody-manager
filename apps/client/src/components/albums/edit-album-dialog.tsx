import { Check } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { albumsClient } from '@/clients/albums.client';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useArtists } from '@/hooks/use-artists';
import { cn } from '@/lib/utils';
import type { Album, Artist } from '@/shared';

interface Props {
  album: Album;
  currentArtistId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAlbumDialog({ album, currentArtistId, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const { data: artists = [] } = useArtists();
  const [name, setName] = useState(album.name);
  const [artistId, setArtistId] = useState(currentArtistId ?? '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(album.name);
      setArtistId(currentArtistId ?? '');
    }
  }, [open, album.name, currentArtistId]);

  const sorted = useMemo(() => [...(artists as unknown as Artist[])].sort((a, b) => a.name.localeCompare(b.name)), [artists]);

  const submit = async () => {
    const nextName = name.trim();
    const renamed = nextName && nextName !== album.name;
    const moved = artistId && artistId !== currentArtistId;
    if (!renamed && !moved) {
      onOpenChange(false);
      return;
    }

    setIsSaving(true);
    try {
      await albumsClient.update(album.id, { name: renamed ? nextName : undefined, artist: moved ? artistId : undefined });
      toast.success(t('AlbumActionsMenu.edited', { name: nextName || album.name }));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('RenameDialog.error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('AlbumActionsMenu.edit')}</DialogTitle>
          <DialogDescription>{t('AlbumActionsMenu.editDescription')}</DialogDescription>
        </DialogHeader>
        <form
          className="mt-2 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="album-name">{t('AlbumActionsMenu.renameLabel')}</Label>
            <Input id="album-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </div>

          <div className="space-y-2">
            <Label>{t('AlbumActionsMenu.artistLabel')}</Label>
            <Command className="rounded-md border">
              <CommandInput placeholder={t('AlbumActionsMenu.artistSearch')} />
              <CommandList className="max-h-48">
                <CommandEmpty>{t('AlbumActionsMenu.artistNone')}</CommandEmpty>
                {sorted.map((artist) => (
                  <CommandItem key={artist.id} value={artist.name} onSelect={() => setArtistId(artist.id)}>
                    <Check className={cn('h-4 w-4 mr-2', artist.id === artistId ? 'opacity-100' : 'opacity-0')} />
                    {artist.name}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              {t('RenameDialog.cancel')}
            </Button>
            <Button type="submit" disabled={isSaving || !name.trim()}>
              {isSaving ? t('RenameDialog.saving') : t('RenameDialog.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
