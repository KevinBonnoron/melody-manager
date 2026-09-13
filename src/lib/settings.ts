import { configClient } from '@/clients/config.client';

// The auth screens run unauthenticated and outside React (route guards), so they
// ask the filtered endpoint rather than reading any collection.
export async function fetchRegistrationAllowed(): Promise<boolean> {
  try {
    const response = await configClient.get();
    return response.registrationAllowed;
  } catch {
    return false;
  }
}
