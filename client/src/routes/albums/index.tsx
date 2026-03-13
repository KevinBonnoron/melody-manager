import { createFileRoute } from '@tanstack/react-router';
import { AlbumsPage } from '@/components/albums/albums-page';
import { authGuard } from '@/lib/auth-guard';

export const Route = createFileRoute('/albums/')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  return <AlbumsPage />;
}
