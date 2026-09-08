import { createFileRoute } from '@tanstack/react-router';
import { ProfilePage } from '@/components/profile/profile-page';
import { authGuard } from '@/lib/auth-guard';

export const Route = createFileRoute('/profile')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <ProfilePage />;
}
