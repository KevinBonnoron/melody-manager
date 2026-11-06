import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * NewVersion offers the new build rather than taking it. Applying one reloads
 * the page, which on a page that is playing music stops it mid-track and loses
 * where it had got to, so the moment belongs to whoever is listening.
 */
export function NewVersion() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) {
      return;
    }

    const id = toast(t('NewVersion.title'), {
      description: t('NewVersion.description'),
      duration: Number.POSITIVE_INFINITY,
      action: { label: t('NewVersion.reload'), onClick: () => void updateServiceWorker(true) },
    });

    return () => {
      toast.dismiss(id);
    };
  }, [needRefresh, updateServiceWorker, t]);

  return null;
}
