import { useLiveQuery } from '@tanstack/react-db';
import { userCollection } from '@/collections/user.collection';
import type { User } from '@/shared';

export function useUsers(): { users: User[]; isLoading: boolean } {
  const { data = [], isLoading } = useLiveQuery({ query: (q) => q.from({ users: userCollection }) });
  return { users: data as unknown as User[], isLoading };
}
