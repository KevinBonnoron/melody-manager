import { createFileRoute } from '@tanstack/react-router';
import { DevicesPage } from '@/components/devices/devices-page';
import { authGuard } from '@/lib/auth-guard';

export const Route = createFileRoute('/devices/')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <DevicesPage />;
}
