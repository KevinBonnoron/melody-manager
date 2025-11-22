import { useCanGoBack, useRouter } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';

export function BackButton() {
  const { t } = useTranslation();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  function handleClick() {
    if (canGoBack) {
      router.history.back();
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleClick}>
      <ArrowLeft className="h-4 w-4 mr-2" />
      {t('BackButton.label')}
    </Button>
  );
}
