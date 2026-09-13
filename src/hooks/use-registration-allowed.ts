import { useEffect, useState } from 'react';
import { fetchRegistrationAllowed } from '@/lib/settings';

// The login screen is unauthenticated, so it asks the filtered endpoint once.
// Assume closed until proven otherwise.
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
