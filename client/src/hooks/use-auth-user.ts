import type { User } from '@melody-manager/shared';
import { useAuth } from 'pocketbase-react-hooks';

/**
 * Hook to get the authenticated user
 * Throws an error if the user is not authenticated
 * Use this hook in pages/components that require authentication
 */
export function useAuthUser(): User {
  const { user } = useAuth<User>();

  if (!user) {
    throw new Error('User must be authenticated. This hook should only be used in protected routes.');
  }

  return user;
}
