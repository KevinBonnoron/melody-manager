import { Button } from '@/components/ui/button';
import { Loader2, Pause, Play } from 'lucide-react';

interface Props {
  isPlaying: boolean;
  isLoading?: boolean;
  onToggle: () => void;
}

export function PlayButton({ isPlaying, isLoading = false, onToggle }: Props) {
  return (
    <Button variant="default" size="icon" className="h-10 w-10 rounded-full" onClick={onToggle} disabled={isLoading}>
      {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : isPlaying ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="h-6 w-6 ml-0.5" fill="currentColor" />}
    </Button>
  );
}
