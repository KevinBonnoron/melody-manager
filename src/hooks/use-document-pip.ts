import { useCallback, useEffect, useRef, useState } from 'react';

const PIP_WIDTH = 520;
// The height the player needs. What is asked for is the whole window and the
// browser's header is inside it, so asking for this alone leaves the position
// bar cut off the bottom.
const PIP_CONTENT_HEIGHT = 104;

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

function pipApi(): PipApi | null {
  return (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture ?? null;
}

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

  const syncTheme = () => {
    target.document.documentElement.className = root.className;
    target.document.documentElement.dataset.accent = root.dataset.accent ?? '';
  };

  syncTheme();
  const observer = new MutationObserver(syncTheme);
  observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-accent'] });
  return () => observer.disconnect();
}

/** A window of this document's own, outside the browser's and above everything else, which the page fills by rendering into it. */
// How much of the window its header took is the browser's business and not a
// number worth carrying: it differs between versions, and a window driven by
// automation wears a banner a real one does not. So it is measured and given
// back rather than guessed at.
//
// Not at once: the window answers with the height that was asked for until it
// has laid its own header out, and a correction computed then corrects nothing.
// Twice, a frame apart, and no further.
function giveBackTheHeader(target: Window) {
  const correct = () => {
    const shortfall = PIP_CONTENT_HEIGHT - target.innerHeight;
    if (shortfall > 0) {
      target.resizeBy(0, shortfall);
    }
  };

  target.requestAnimationFrame(() => {
    correct();
    target.requestAnimationFrame(correct);
  });
}

export function useDocumentPip() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const windowRef = useRef<Window | null>(null);
  const disposeStylesRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);

  const forget = useCallback(() => {
    disposeStylesRef.current?.();
    disposeStylesRef.current = null;
    windowRef.current = null;
    setPipWindow(null);
  }, []);

  const open = useCallback(async () => {
    const generation = ++requestRef.current;
    const api = pipApi();
    if (!api) {
      return;
    }

    if (api.window) {
      api.window.focus();
      return;
    }

    let target: Window;
    try {
      // The header is the browser's and cannot be styled or removed, but the
      // button back to the tab can go: the bar in the page says the player is
      // out here and brings it back, so the same thing twice costs height that
      // a window this short does not have.
      target = await api.requestWindow({ width: PIP_WIDTH, height: PIP_CONTENT_HEIGHT, disallowReturnToOpener: true });
    } catch {
      return;
    }

    if (!mountedRef.current || generation !== requestRef.current) {
      target.close();
      return;
    }

    giveBackTheHeader(target);

    disposeStylesRef.current = adoptPageStyles(target);
    target.addEventListener('pagehide', forget, { once: true });
    windowRef.current = target;
    setPipWindow(target);
  }, [forget]);

  const close = useCallback(() => {
    requestRef.current++;
    windowRef.current?.close();
    forget();
  }, [forget]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      disposeStylesRef.current?.();
      windowRef.current?.close();
    };
  }, []);

  return { supported: pipApi() !== null, pipWindow, open, close };
}
