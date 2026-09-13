import { useCallback, useEffect, useRef, useState } from 'react';

// The height a card takes at the current column width.
//
// Grids skip the rendering of what is off screen, and that reserves each card's
// place with `contain-intrinsic-size`. Chrome applies that height to the card
// whether it is being skipped or not, so a guessed value is not merely a hint:
// too small and the bottom of every card is cut off, marker on the one playing
// included; too large and the grid grows gaps. Measuring one card settles it,
// and every card in a grid is the same height.
export function useCardHeight(fallback: number): [number, (element: HTMLElement | null) => void] {
  const [height, setHeight] = useState(fallback);
  const observer = useRef<ResizeObserver | null>(null);

  useEffect(() => () => observer.current?.disconnect(), []);

  // The card, not the slot holding it: the slot's height is the very value
  // being worked out here, so measuring it would only ever return itself.
  const measure = useCallback((slot: HTMLElement | null) => {
    observer.current?.disconnect();
    const element = slot?.firstElementChild as HTMLElement | null;
    if (!element) {
      return;
    }

    const apply = () => {
      const next = Math.ceil(element.getBoundingClientRect().height);
      if (next > 0) {
        setHeight((previous) => (Math.abs(previous - next) <= 1 ? previous : next));
      }
    };

    apply();
    observer.current = new ResizeObserver(apply);
    observer.current.observe(element);
  }, []);

  return [height, measure];
}
