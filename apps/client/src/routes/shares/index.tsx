import { createFileRoute } from '@tanstack/react-router';
import { SharesPage } from '@/components/shares/shares-page';
import { authGuard } from '@/lib/auth-guard';

export const Route = createFileRoute('/shares/')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <SharesPage />;
}
