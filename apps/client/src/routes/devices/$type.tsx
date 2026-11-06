import { createFileRoute } from '@tanstack/react-router';
import { DevicePage } from '@/components/devices/device-page';
import { authGuard } from '@/lib/auth-guard';

export const Route = createFileRoute('/devices/$type')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  const { type } = Route.useParams();
  return <DevicePage type={type} />;
}
