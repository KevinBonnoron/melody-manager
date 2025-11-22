import { TrackPage } from '@/components/tracks/track-page';
import { createFileRoute } from '@tanstack/react-router';
import { authGuard } from '@/lib/auth-guard';

export const Route = createFileRoute('/')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <TrackPage />;
}
