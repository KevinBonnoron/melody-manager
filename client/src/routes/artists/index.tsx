import { ArtistListPage } from '@/components/artists/artist-list-page';
import { authGuard } from '@/lib/auth-guard';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/artists/')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <ArtistListPage />;
}
