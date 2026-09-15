import { SkipForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface NextButtonProps {
  disabled: boolean;
  onNext: () => void;
}

export function NextButton({ disabled, onNext }: NextButtonProps) {
  const { t } = useTranslation();
  return (
    <Button variant="ghost" size="icon" onClick={onNext} disabled={disabled} aria-label={t('NowPlaying.next')}>
      <SkipForward className="h-5 w-5" />
    </Button>
  );
}
