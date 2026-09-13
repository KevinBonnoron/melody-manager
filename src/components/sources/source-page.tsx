import { and, eq, useLiveQuery } from '@tanstack/react-db';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { connectionCollection } from '@/collections/connection.collection';
import { providerCollection } from '@/collections/provider.collection';
import { trackCollection } from '@/collections/track.collection';
import { AlbumCard } from '@/components/albums/album-card';
import { ArtistCard } from '@/components/artists/artist-card';
import { CardGrid } from '@/components/atoms/card-grid';
import { EmptyTab } from '@/components/atoms/empty-tab';
import { SectionTabs } from '@/components/atoms/section-tabs';
import { usePageHeader } from '@/components/layout/page-header';
import { ProviderConnectDialog } from '@/components/providers/provider-connect-dialog';
import { getProviderInfoFromManifests } from '@/components/providers/provider-info';
import { TrackGrid } from '@/components/tracks/track-grid';
import { Button } from '@/components/ui/button';
import { useAlbumsByIds } from '@/hooks/use-album';
import { useArtistsByIds } from '@/hooks/use-artists';
import { useAuthUser } from '@/hooks/use-auth-user';
import { openCommandDialog } from '@/hooks/use-command-dialog';
import { usePlugins } from '@/hooks/use-plugins';
import { useSourceScope } from '@/hooks/use-source-scope';
import type { SourceSearch, SourceTab } from '@/routes/sources/$type';
import type { Connection, Track } from '@/shared';
import { getSourceStatus, isUserConnectable } from './source-status';

const PREVIEW_LIMIT = 12;

interface Props {
  type: string;
}

export function SourcePage({ type }: Props) {
  const { t } = useTranslation();
  const user = useAuthUser();
  const [connectOpen, setConnectOpen] = useState(false);
  const { tab } = useSearch({ from: '/sources/$type' });
  const navigate = useNavigate({ from: '/sources/$type' });
  const { manifests } = usePlugins();
  // Enabled, like the list this page is reached from: a disabled provider has no
  // page, or typing its address would walk straight into its connection flow.
  const { data: provider } = useLiveQuery({
    query: (q) =>
      q
        .from({ providers: providerCollection })
        .where(({ providers }) => and(eq(providers.type, type), eq(providers.enabled, true)))
        .findOne(),
  });
  const { data: connections = [] } = useLiveQuery({ query: (q) => q.from({ connections: connectionCollection }).where(({ connections }) => and(eq(connections.user, user.id), eq(connections.type, type))) });
  const { data: sourceTracks = [] } = useLiveQuery({ query: (q) => q.from({ tracks: trackCollection }).where(({ tracks }) => eq(tracks.source, type)) });

  const { albumIds, artistIds } = useSourceScope(type);
  const { data: albums = [] } = useAlbumsByIds(albumIds ? [...albumIds] : []);
  const { data: artists = [] } = useArtistsByIds(artistIds ? [...artistIds] : []);

  const providerInfo = useMemo(() => getProviderInfoFromManifests(t, manifests), [t, manifests]);
  const linkedTypes = useMemo(() => new Set((connections as Connection[]).map((c) => c.type)), [connections]);

  const info = providerInfo[type];
  const status = getSourceStatus(type, manifests, linkedTypes, sourceTracks.length > 0);
  usePageHeader(
    provider
      ? {
          title: info?.title ?? type,
          description: t(`SourcesPage.status.${status}`),
        }
      : null,
  );

  if (!provider) {
    return <p className="text-muted-foreground text-sm">{t('SourcesPage.notFound')}</p>;
  }

  const activeTab: SourceTab = tab ?? 'all';
  const isAll = activeTab === 'all';
  const shows = (name: SourceTab) => isAll || activeTab === name;
  const sourceName = info?.title ?? type;
  const emptyTab = resolveEmptyTab(activeTab, { artists: artists.length, albums: albums.length, tracks: sourceTracks.length }, status, isUserConnectable(type, manifests));
  const tabs = [
    { id: 'all' as const, label: t('LibraryPage.tabAll') },
    { id: 'artists' as const, label: t('LibraryPage.artists'), count: artists.length },
    { id: 'albums' as const, label: t('LibraryPage.albums'), count: albums.length },
    { id: 'tracks' as const, label: t('LibraryPage.tracks'), count: sourceTracks.length },
  ];

  return (
    <div>
      <SectionTabs tabs={tabs} active={activeTab} onChange={(id) => navigate({ search: (prev: SourceSearch) => ({ ...prev, tab: id === 'all' ? undefined : id }) })} />

      <div className="space-y-8">
        {shows('artists') && artists.length > 0 && (
          <Section title={t('LibraryPage.artists')} count={artists.length} bare={!isAll} onSeeAll={isAll && artists.length > PREVIEW_LIMIT ? () => navigate({ search: (prev: SourceSearch) => ({ ...prev, tab: 'artists' }) }) : undefined}>
            <CardGrid items={isAll ? artists.slice(0, PREVIEW_LIMIT) : artists} getKey={(artist) => artist.id} className="grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3 sm:gap-4" fallbackHeight={170}>
              {(artist) => <ArtistCard artist={artist} albumIds={albumIds} />}
            </CardGrid>
          </Section>
        )}

        {shows('albums') && albums.length > 0 && (
          <Section title={t('LibraryPage.albums')} count={albums.length} bare={!isAll} onSeeAll={isAll && albums.length > PREVIEW_LIMIT ? () => navigate({ search: (prev: SourceSearch) => ({ ...prev, tab: 'albums' }) }) : undefined}>
            <CardGrid items={isAll ? albums.slice(0, PREVIEW_LIMIT) : albums} getKey={(album) => album.id} className="grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 sm:gap-3" fallbackHeight={246}>
              {(album) => <AlbumCard album={album} />}
            </CardGrid>
          </Section>
        )}

        {shows('tracks') && sourceTracks.length > 0 && (
          <Section title={t('LibraryPage.tracks')} count={sourceTracks.length} bare={!isAll} onSeeAll={isAll && sourceTracks.length > PREVIEW_LIMIT * 2 ? () => navigate({ search: (prev: SourceSearch) => ({ ...prev, tab: 'tracks' }) }) : undefined}>
            <TrackGrid tracks={(isAll ? sourceTracks.slice(0, PREVIEW_LIMIT * 2) : sourceTracks) as unknown as Track[]} provider="all" />
          </Section>
        )}

        {emptyTab && (
          <EmptyTab
            title={t(emptyTab.title, { source: sourceName })}
            description={t(emptyTab.description, { source: sourceName })}
            action={emptyTab.action === 'connect' ? <Button onClick={() => setConnectOpen(true)}>{t('SourcePage.empty.connectAction')}</Button> : <Button onClick={() => openCommandDialog('k')}>{t('SourcePage.empty.searchAction')}</Button>}
          />
        )}
      </div>

      <ProviderConnectDialog providerId={provider.id} open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}

type EmptyTabInfo = { title: string; description: string; action: 'connect' | 'search' };

// Offering to connect a source the server has no credentials of its own for
// leads to a connection that cannot fetch anything, so searching is all that is
// left to offer.
function resolveEmptyTab(tab: SourceTab, counts: { artists: number; albums: number; tracks: number }, status: string, connectable: boolean): EmptyTabInfo | null {
  const action = status === 'unlinked' && connectable ? 'connect' : 'search';
  if (tab === 'artists') {
    return counts.artists === 0 ? { title: 'SourcePage.empty.noArtistsTitle', description: 'SourcePage.empty.noArtistsDescription', action } : null;
  }

  if (tab === 'albums') {
    return counts.albums === 0 ? { title: 'SourcePage.empty.noAlbumsTitle', description: 'SourcePage.empty.noAlbumsDescription', action } : null;
  }

  if (tab === 'tracks') {
    return counts.tracks === 0 ? { title: 'SourcePage.empty.noTracksTitle', description: 'SourcePage.empty.noTracksDescription', action } : null;
  }

  if (counts.artists + counts.albums + counts.tracks > 0) {
    return null;
  }

  if (status === 'unlinked') {
    return { title: 'SourcePage.empty.unlinkedTitle', description: 'SourcePage.empty.unlinkedDescription', action };
  }

  return { title: 'SourcePage.empty.title', description: 'SourcePage.empty.description', action };
}

function Section({ title, count, children, bare, onSeeAll }: { title: string; count: number; children: React.ReactNode; bare?: boolean; onSeeAll?: () => void }) {
  const { t } = useTranslation();
  if (bare) {
    return <section>{children}</section>;
  }

  // The heading counts everything the source holds while the grid below shows a
  // preview of it, so without this the numbers looked like missing tracks.
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold tracking-[-0.01em]">
          {title}
          <span className="ml-1.5 text-xs font-medium text-muted-foreground">{count}</span>
        </h3>
        {onSeeAll && (
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={onSeeAll}>
            {t('LibraryPage.seeAll')}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}
