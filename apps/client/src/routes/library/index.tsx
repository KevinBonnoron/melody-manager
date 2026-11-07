import { createFileRoute } from '@tanstack/react-router';
import { LibraryPage } from '@/components/library/library-page';
import { authGuard } from '@/lib/auth-guard';

export type LibraryTab = 'all' | 'artists' | 'albums' | 'playlists' | 'tracks';
const TABS: LibraryTab[] = ['all', 'artists', 'albums', 'playlists', 'tracks'];

export interface LibrarySearch {
  source?: string;
  tab?: LibraryTab;
}

export const Route = createFileRoute('/library/')({
  beforeLoad: authGuard,
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    source: typeof search.source === 'string' && search.source !== 'all' ? search.source : undefined,
    tab: TABS.includes(search.tab as LibraryTab) && search.tab !== 'all' ? (search.tab as LibraryTab) : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return <LibraryPage />;
}
