import { createFileRoute } from '@tanstack/react-router';
import { ArtistPage } from '@/components/artists/artist-page';
import { authGuard } from '@/lib/auth-guard';

export const Route = createFileRoute('/artists/$artistId')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  const { artistId } = Route.useParams();
  return <ArtistPage artistId={artistId} />;
}
