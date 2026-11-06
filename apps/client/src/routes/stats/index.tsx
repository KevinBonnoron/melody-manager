import { createFileRoute } from '@tanstack/react-router';
import { StatsPage } from '@/components/stats/stats-page';
import { authGuard } from '@/lib/auth-guard';

export const Route = createFileRoute('/stats/')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <StatsPage />;
}
