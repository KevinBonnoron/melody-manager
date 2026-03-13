import type { User } from '@melody-manager/shared';
import { redirect } from '@tanstack/react-router';
import { pb } from './pocketbase';

export function adminGuard() {
  if (!pb.authStore.isValid) {
    throw redirect({ to: '/login' });
  }

  const user = pb.authStore.record as User | null;
  if (user?.role !== 'admin') {
    throw redirect({ to: '/' });
  }
}
