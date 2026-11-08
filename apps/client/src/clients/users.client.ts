import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';

export const usersClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      createUser: (body: { email: string; password: string; name: string; role: 'user' | 'admin' }) => http.post('/users', body),
      updateCredentials: (userId: string, body: { email?: string; password?: string }) => http.patch(`/users/${userId}/credentials`, body),
    };
  }),
);
