import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { ListMusic, Loader2, Music2, Pause, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface QueueSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QueueSheet({ open, onOpenChange }: QueueSheetProps) {
  const { t } = useTranslation();
  const { queue, currentTrack, isLoading, isPlaying, removeFromQueue, clearQueue, playTrack } = useMusicPlayer();

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[420px] p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-4 pr-12 border-b border-border/50">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ListMusic className="h-5 w-5" />
            {t('QueueSheet.title')}
          </SheetTitle>
          <div className="flex items-center justify-between">
            <SheetDescription>{t('QueueSheet.tracksCount', { count: queue.length })}</SheetDescription>
            {queue.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearQueue} className="h-7 text-xs text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {t('QueueSheet.clearAll')}
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-6">
              <Music2 className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">{t('QueueSheet.emptyTitle')}</p>
              <p className="text-sm text-center mt-2">{t('QueueSheet.emptyDescription')}</p>
            </div>
          ) : (
            <div className="py-1 px-1">
              {queue.map((track, index) => {
                const isCurrentTrack = currentTrack?.id === track.id;
                const albumCoverUrl = track.expand?.album?.coverUrl;
                const artistName = track.expand?.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';

                return (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: contains nested interactive elements (remove button), cannot use <button>
                  // biome-ignore lint/a11y/noStaticElementInteractions: same reason
                  <div key={`${track.id}-${index}`} className={`group flex w-full items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-left ${isCurrentTrack ? 'bg-primary/10' : 'hover:bg-muted/50'}`} onClick={() => playTrack(track)}>
                    <span className="w-5 text-xs text-muted-foreground text-right tabular-nums flex-shrink-0 flex items-center justify-end">
                      {isCurrentTrack && isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : isCurrentTrack && isPlaying ? <Pause className="h-3.5 w-3.5 text-primary" fill="currentColor" /> : index + 1}
                    </span>

                    <div className="relative flex-shrink-0">
                      {albumCoverUrl ? (
                        <img src={albumCoverUrl} alt={track.expand?.album?.name || 'Album'} className="h-10 w-10 rounded-md object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                          <Music2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isCurrentTrack ? 'text-primary' : 'text-foreground'}`}>{track.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{artistName}</p>
                    </div>

                    <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">{formatDuration(track.duration || 0)}</span>
                    <button
                      type="button"
                      className="flex-shrink-0 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-all text-muted-foreground/40 hover:text-muted-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromQueue(track.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
