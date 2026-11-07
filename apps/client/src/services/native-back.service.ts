import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import i18n from '@/i18n';

// Two presses inside this window quit the app; the first one only says how.
const EXIT_WINDOW_MS = 2_000;

let lastBackAt = 0;

/**
 * installNativeBackHandler makes the Android back button walk the navigation
 * history instead of leaving the app at the first press. At the root, where
 * there is nowhere to go back to, the app asks for a second press rather than
 * quitting on a tap aimed at something else.
 */
export function installNativeBackHandler() {
  if (Capacitor.getPlatform() !== 'android') {
    return;
  }

  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      // The window belongs to the page being left; the root asks afresh.
      lastBackAt = 0;
      window.history.back();
      return;
    }

    const now = Date.now();
    if (now - lastBackAt < EXIT_WINDOW_MS) {
      void App.exitApp();
      return;
    }
    lastBackAt = now;
    toast(i18n.t('common.backAgainToExit'));
  });
}
