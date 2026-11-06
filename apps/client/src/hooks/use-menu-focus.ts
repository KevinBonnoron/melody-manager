import { useRef } from 'react';

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
