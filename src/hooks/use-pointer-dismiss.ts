import { useRef } from 'react';

/**
 * Keeps a focus ring off a menu trigger that was opened with the pointer.
 *
 * Radix puts focus back on the trigger when its menu closes, which a keyboard
 * needs and a mouse does not: a programmatic focus matches :focus-visible in
 * Firefox, so a click left a ring around the button until something else was
 * clicked. Opened by pointer, focus is not restored; opened by keyboard, it is.
 */
export function usePointerDismiss() {
  const byPointer = useRef(false);

  return {
    trigger: {
      onPointerDown: () => {
        byPointer.current = true;
      },
      onKeyDown: () => {
        byPointer.current = false;
      },
    },
    content: {
      onCloseAutoFocus: (event: Event) => {
        if (byPointer.current) {
          event.preventDefault();
        }
      },
    },
  };
}
