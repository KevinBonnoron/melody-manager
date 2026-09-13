import { useCallback, useEffect, useRef, useState } from 'react';

const CLOSE_EVENT = 'command-dialog-request-close';
const OPEN_EVENT = 'command-dialog-request-open';

export function openCommandDialog(shortcutKey = 'f') {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: shortcutKey }));
}

export function useCommandDialog(shortcutKey?: string) {
  const [open, setOpen] = useState(false);
  const isOpeningRef = useRef(false);
  const openRef = useRef(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const handleClose = () => {
      if (!isOpeningRef.current) {
        setOpen(false);
      }
    };
    window.addEventListener(CLOSE_EVENT, handleClose);
    return () => window.removeEventListener(CLOSE_EVENT, handleClose);
  }, []);

  useEffect(() => {
    if (!shortcutKey) {
      return;
    }

    const handleOpen = (e: Event) => {
      const target = (e as CustomEvent<string>).detail;
      if (target !== shortcutKey) {
        return;
      }

      if (!openRef.current) {
        isOpeningRef.current = true;
        window.dispatchEvent(new CustomEvent(CLOSE_EVENT));
        isOpeningRef.current = false;
        setOpen(true);
      }
    };
    window.addEventListener(OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_EVENT, handleOpen);
  }, [shortcutKey]);

  useEffect(() => {
    if (!shortcutKey) {
      return;
    }

    const down = (e: KeyboardEvent) => {
      if (e.key === shortcutKey && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (openRef.current) {
          setOpen(false);
        } else {
          isOpeningRef.current = true;
          window.dispatchEvent(new CustomEvent(CLOSE_EVENT));
          isOpeningRef.current = false;
          setOpen(true);
        }
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [shortcutKey]);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen) {
      isOpeningRef.current = true;
      window.dispatchEvent(new CustomEvent(CLOSE_EVENT));
      isOpeningRef.current = false;
    }

    setOpen(newOpen);
  }, []);

  return { open, setOpen, handleOpenChange };
}
