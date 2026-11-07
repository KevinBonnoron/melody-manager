import { Loader2, Pause, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface Props {
  isPlaying: boolean;
  isLoading?: boolean;
  onToggle: () => void;
}

export function PlayButton({ isPlaying, isLoading = false, onToggle }: Props) {
  const { t } = useTranslation();
  return (
    <Button
      variant="default"
      size="icon"
      className="h-10 w-10 rounded-full shadow-[0_4px_12px_var(--primary-glow)] hover:scale-105 transition-transform"
      onClick={onToggle}
      disabled={isLoading}
      aria-label={isLoading ? t('MusicPlayer.loadingPlayback') : isPlaying ? t('MusicPlayer.pause') : t('MusicPlayer.play')}
      aria-pressed={isPlaying}
      aria-busy={isLoading || undefined}
    >
      {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : isPlaying ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="h-6 w-6 ml-0.5" fill="currentColor" />}
    </Button>
  );
}
