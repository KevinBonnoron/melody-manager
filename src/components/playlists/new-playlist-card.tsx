import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  onClick: () => void;
}

// Shaped like the playlists beside it, because what it makes is one of them.
// The dashed border is the only thing saying this card is not a playlist yet.
export function NewPlaylistCard({ onClick }: Props) {
  const { t } = useTranslation();

  return (
    <button type="button" onClick={onClick} className="block h-full w-full text-left">
      <Card className="group flex h-full cursor-pointer flex-col overflow-hidden border-2 border-dashed border-primary/30 bg-primary/[0.03] p-0 gap-0 transition-all hover:border-primary/60 hover:bg-primary/5">
        <div className="flex h-[140px] flex-1 items-center justify-center md:h-[180px]">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110">
            <Plus className="h-5 w-5" />
          </span>
        </div>
        <CardContent className="px-2 py-1.5">
          <h3 className="line-clamp-1 text-[11px] font-semibold text-muted-foreground transition-colors group-hover:text-foreground sm:text-xs">{t('CreatePlaylist.create')}</h3>
        </CardContent>
      </Card>
    </button>
  );
}
