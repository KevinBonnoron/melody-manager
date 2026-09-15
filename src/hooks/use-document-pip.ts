import { useCallback, useEffect, useRef, useState } from 'react';

// Enough for a cover, a title and the transport, and small enough to leave
// beside something else. The window is resizable from there.
const PIP_WIDTH = 440;
const PIP_HEIGHT = 190;

interface PipOptions {
  width?: number;
  height?: number;
  disallowReturnToOpener?: boolean;
  preferInitialWindowPlacement?: boolean;
}

interface PipApi {
  requestWindow: (options?: PipOptions) => Promise<Window>;
  window: Window | null;
}

// Document Picture-in-Picture is Chromium-only and needs a secure context, so
// the API is absent in Firefox and Safari, and over plain HTTP on a LAN address
// too. Read through a cast rather than declared on Window: the DOM types have
// their own plans for this name, and a conflicting augmentation would not
// compile.
function pipApi(): PipApi | null {
  return (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture ?? null;
}

// The window gets a blank document of its own: without the page's stylesheets
// the player lands there unstyled, and without the theme the wrong colours.
function adoptPageStyles(target: Window): () => void {
  const root = document.documentElement;
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.document.createElement('style');
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
      target.document.head.appendChild(style);
    } catch {
      // A sheet from another origin refuses to be read, so it is linked instead
      // and fetched again by the new document.
      if (sheet.href) {
        const link = target.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        target.document.head.appendChild(link);
      }
    }
  }

  target.document.body.style.margin = '0';
  target.document.body.style.overflow = 'hidden';

  // The theme is a class on <html> and the accent a data attribute on it, and
  // either can change while the window is open.
  const syncTheme = () => {
    target.document.documentElement.className = root.className;
    target.document.documentElement.dataset.accent = root.dataset.accent ?? '';
  };

  syncTheme();
  const observer = new MutationObserver(syncTheme);
  observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-accent'] });
  return () => observer.disconnect();
}

/**
 * A window of this document's own, outside the browser's and above everything
 * else, which the page fills by rendering into it. The audio element stays
 * where it is: only the controls move, so nothing about the playback is
 * interrupted by opening or closing the window.
 */
export function useDocumentPip() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const windowRef = useRef<Window | null>(null);
  const disposeStylesRef = useRef<(() => void) | null>(null);

  const forget = useCallback(() => {
    disposeStylesRef.current?.();
    disposeStylesRef.current = null;
    windowRef.current = null;
    setPipWindow(null);
  }, []);

  const open = useCallback(async () => {
    const api = pipApi();
    if (!api) {
      return;
    }

    // There is at most one such window per document, and asking for a second
    // one while it is up is an error rather than a new window.
    if (api.window) {
      api.window.focus();
      return;
    }

    let target: Window;
    try {
      target = await api.requestWindow({ width: PIP_WIDTH, height: PIP_HEIGHT });
    } catch {
      // Refused: the click was not close enough to be a user gesture any more,
      // or the user has turned the feature off. The bar is still there.
      return;
    }

    disposeStylesRef.current = adoptPageStyles(target);
    // Closed from its own chrome, or by the tab going away. Either way the page
    // has to stop rendering into a document that is gone.
    target.addEventListener('pagehide', forget, { once: true });
    windowRef.current = target;
    setPipWindow(target);
  }, [forget]);

  const close = useCallback(() => {
    windowRef.current?.close();
    forget();
  }, [forget]);

  // Nothing renders into the window once the component holding it goes, so it
  // would be left standing empty and above everything else.
  useEffect(() => {
    return () => {
      disposeStylesRef.current?.();
      windowRef.current?.close();
    };
  }, []);

  return { supported: pipApi() !== null, pipWindow, open, close };
}
