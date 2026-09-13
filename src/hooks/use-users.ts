import { useLiveQuery } from '@tanstack/react-db';
import { userCollection } from '@/collections/user.collection';
import type { User } from '@/shared';

// Live rather than fetched: the previous hook refetched the whole list after
// every change and flipped a `loading` flag while it did, which took the table
// off screen and put it back. Only the very first load has nothing to show.
export function useUsers(): { users: User[]; isLoading: boolean } {
  const { data = [], isLoading } = useLiveQuery({ query: (q) => q.from({ users: userCollection }) });
  return { users: data as unknown as User[], isLoading };
}
