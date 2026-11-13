import { Disc3 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { artistNames, useAlbumsById, useArtistsById } from '@/hooks/use-library-index';

export type AlbumTarget = { albumId: string } | { name: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** The album the thing being moved comes from: it is not offered as a destination. */
  excludeId: string;
  /** Albums of this artist are listed first. */
  preferArtistId?: string;
  /** Offer to make a new album instead of picking one. */
  allowNew?: boolean;
  onPick: (target: AlbumTarget) => Promise<void>;
}

export function AlbumPickerDialog({ open, ...props }: Props) {
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);

  const pick = async (target: AlbumTarget) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setIsBusy(true);
    try {
      await props.onPick(target);
    } catch {
      // Callers report the error; keep the picker open for another attempt.
      busyRef.current = false;
      setIsBusy(false);
      return;
    }
    busyRef.current = false;
    setIsBusy(false);
    props.onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!busyRef.current) {
      props.onOpenChange(nextOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {open && <AlbumPickerContent {...props} onOpenChange={handleOpenChange} isBusy={isBusy} pick={pick} />}
    </Dialog>
  );
}

function AlbumPickerContent({ onOpenChange, title, description, excludeId, preferArtistId, allowNew, isBusy, pick }: Omit<Props, 'open' | 'onPick'> & { isBusy: boolean; pick: (target: AlbumTarget) => Promise<void> }) {
  const { t } = useTranslation();
  const albumsById = useAlbumsById();
  const artistsById = useArtistsById();
  const [name, setName] = useState('');

  const candidates = useMemo(() => {
    const preferred = (albumArtists: string[]) => (preferArtistId && albumArtists.includes(preferArtistId) ? 0 : 1);
    return [...albumsById.values()].filter((album) => album.id !== excludeId).sort((a, b) => preferred(a.artists) - preferred(b.artists) || a.name.localeCompare(b.name));
  }, [albumsById, excludeId, preferArtistId]);

  return (
    <DialogContent
      className="sm:max-w-md"
      closeButtonDisabled={isBusy}
      onEscapeKeyDown={(event) => {
        if (isBusy) {
          event.preventDefault();
        }
      }}
      onPointerDownOutside={(event) => {
        if (isBusy) {
          event.preventDefault();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <Command className="rounded-md border">
        <CommandInput placeholder={t('AlbumPicker.search')} />
        <CommandList className="max-h-56">
          <CommandEmpty>{t('AlbumPicker.none')}</CommandEmpty>
          {candidates.map((album) => {
            const artists = artistNames(album.artists, artistsById);
            return (
              <CommandItem key={album.id} value={`${album.name} ${artists} ${album.id}`} disabled={isBusy} onSelect={() => pick({ albumId: album.id })}>
                <Disc3 className="h-4 w-4 mr-2 shrink-0" />
                <span className="truncate">{album.name}</span>
                {artists && <span className="ml-2 truncate text-xs text-muted-foreground">{artists}</span>}
              </CommandItem>
            );
          })}
        </CommandList>
      </Command>

      {allowNew && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) {
              pick({ name: name.trim() });
            }
          }}
        >
          <Label htmlFor="new-album-name">{t('AlbumPicker.newLabel')}</Label>
          <div className="flex gap-2">
            <Input id="new-album-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('AlbumPicker.newPlaceholder')} disabled={isBusy} />
            <Button type="submit" disabled={isBusy || !name.trim()}>
              {t('AlbumPicker.create')}
            </Button>
          </div>
        </form>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
          {t('AlbumPicker.cancel')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
