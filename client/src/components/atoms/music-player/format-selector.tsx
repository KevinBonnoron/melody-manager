import { FileAudio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { AudioFormat } from '@/contexts/music-player-context';

interface FormatSelectorProps {
  audioFormat: AudioFormat;
  onFormatChange: (format: AudioFormat) => void;
}

export function FormatSelector({ audioFormat, onFormatChange }: FormatSelectorProps) {
  const { t } = useTranslation();

  const formatOptions: { value: AudioFormat; label: string }[] = [
    { value: 'source', label: t('FormatSelector.source') },
    { value: 'mp3', label: t('FormatSelector.mp3') },
    { value: 'aac', label: t('FormatSelector.aac') },
    { value: 'flac', label: t('FormatSelector.flac') },
    { value: 'wav', label: t('FormatSelector.wav') },
  ];

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" title={t('FormatSelector.selectFormat')}>
          <FileAudio className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t('FormatSelector.audioFormat')}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {formatOptions.map((option) => (
          <DropdownMenuItem key={option.value} onClick={() => onFormatChange(option.value)} className={audioFormat === option.value ? 'bg-accent font-semibold' : ''}>
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
