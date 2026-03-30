import type { User } from '@melody-manager/shared';
import { useEffect, useState } from 'react';
import { pb } from '@/lib/pocketbase';

export function useUsers(options?: { enabled?: boolean }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    setLoading(true);
    pb.collection<User>('users')
      .getFullList({ requestKey: null })
      .then(setUsers)
      .finally(() => setLoading(false));
  }, [enabled]);

  return { users, loading };
}
