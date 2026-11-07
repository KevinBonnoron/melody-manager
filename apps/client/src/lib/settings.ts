import { configClient } from '@/clients/config.client';

export async function fetchRegistrationAllowed(): Promise<boolean> {
  try {
    const response = await configClient.get();
    return response.registrationAllowed;
  } catch {
    return false;
  }
}
