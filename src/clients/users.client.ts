import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';

export const usersClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      // Email and password only: every other field of a user is an ordinary
      // one the collection already writes optimistically.
      updateCredentials: (userId: string, body: { email?: string; password?: string }) => http.patch(`/users/${userId}/credentials`, body),
    };
  }),
);
