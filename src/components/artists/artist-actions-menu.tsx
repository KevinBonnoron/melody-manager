import { HeartOff, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { artistsClient } from '@/clients/artists.client';
import { RenameDialog } from '@/components/albums/rename-dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useMenuFocus } from '@/hooks/use-menu-focus';
import { useArtistRatings } from '@/hooks/use-ratings';
import { afterMenuCloses } from '@/lib/utils';

interface Props {
  artistId: string;
  name: string;
  // Admin only; an artist nobody can delete still has an opinion to give.
  onDelete?: () => void;
}

// The same control, in the same place, as the album page: what it holds differs,
// where it sits does not.
export function ArtistActionsMenu({ artistId, name, onDelete }: Props) {
  const { t } = useTranslation();
  const menuFocus = useMenuFocus();
  const { isDisliked, toggleDislike } = useArtistRatings();
  const disliked = isDisliked(artistId);
  const [renameOpen, setRenameOpen] = useState(false);
  const rename = async (next: string) => {
    await artistsClient.update(artistId, { name: next });
    toast.success(t('ArtistPage.renamed', { name: next }));
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label={t('ArtistPage.actions')} {...menuFocus.triggerProps}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" {...menuFocus.contentProps}>
          <DropdownMenuItem onSelect={() => toggleDislike(artistId)}>
            <HeartOff className={disliked ? 'h-4 w-4 mr-2 text-destructive' : 'h-4 w-4 mr-2'} />
            {disliked ? t('ArtistPage.undislike') : t('ArtistPage.dislike')}
          </DropdownMenuItem>
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => afterMenuCloses(() => setRenameOpen(true))}>
                <Pencil className="h-4 w-4 mr-2" />
                {t('ArtistPage.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => afterMenuCloses(onDelete)}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('ArtistPage.delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameDialog title={t('ArtistPage.rename')} description={t('ArtistPage.renameDescription')} label={t('ArtistPage.renameLabel')} current={name} open={renameOpen} onOpenChange={setRenameOpen} onRename={rename} />
    </>
  );
}
