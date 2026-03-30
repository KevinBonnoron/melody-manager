import { OnboardingPage } from '@/components/onboarding/onboarding-page';
import { pb } from '@/lib/pocketbase';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/onboarding')({
  beforeLoad: () => {
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/login' });
    }
    const user = pb.authStore.record;
    if (user?.onboardingDone) {
      throw redirect({ to: '/' });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <OnboardingPage />;
}
