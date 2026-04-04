import { useCallback, useEffect, useRef, useState } from 'react';

const CLOSE_EVENT = 'command-dialog-request-close';
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
