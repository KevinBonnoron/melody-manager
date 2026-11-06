import { useEffect, useState } from 'react';
import { fetchRegistrationAllowed } from '@/lib/settings';

export function useRegistrationAllowed(): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchRegistrationAllowed().then((value) => {
      if (!cancelled) {
        setAllowed(value);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return allowed;
}
