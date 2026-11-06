import { SkipBack } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface PreviousButtonProps {
  disabled: boolean;
  onPrevious: () => void;
}

export function PreviousButton({ disabled, onPrevious }: PreviousButtonProps) {
  const { t } = useTranslation();
  return (
    <Button variant="ghost" size="icon" onClick={onPrevious} disabled={disabled} aria-label={t('NowPlaying.previous')}>
      <SkipBack className="h-4 w-4" />
    </Button>
  );
}
