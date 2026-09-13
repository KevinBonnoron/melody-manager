import { useEffect, useState } from 'react';

// Holds a value still for a while after it stops moving. For work that is too
// expensive to redo on every change: an import writes hundreds of records, each
// one arriving as its own realtime event, and anything rebuilt per event runs
// hundreds of times in a burst on the one thread the page has.
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
