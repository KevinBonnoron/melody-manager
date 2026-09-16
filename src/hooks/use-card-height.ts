import { useCallback, useEffect, useRef, useState } from 'react';

export function useCardHeight(fallback: number): [number, (element: HTMLElement | null) => void] {
  const [height, setHeight] = useState(fallback);
  const observer = useRef<ResizeObserver | null>(null);

  useEffect(() => () => observer.current?.disconnect(), []);

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
