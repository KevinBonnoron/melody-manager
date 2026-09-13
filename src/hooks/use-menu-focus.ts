import { useRef } from 'react';

// Radix hands focus back to the trigger when a menu closes. That is what a
// keyboard user needs, but the focus is set programmatically, so Chrome treats
// it as keyboard focus and leaves a ring on a button the mouse just dismissed.
// Remembering how the menu was opened keeps the ring for the keyboard and drops
// it for the pointer.
export function useMenuFocus() {
  const openedByPointer = useRef(false);

  return {
    triggerProps: {
      onPointerDown: () => {
        openedByPointer.current = true;
      },
      onKeyDown: () => {
        openedByPointer.current = false;
      },
    },
    contentProps: {
      onCloseAutoFocus: (event: Event) => {
        if (openedByPointer.current) {
          event.preventDefault();
        }
      },
    },
  };
}
