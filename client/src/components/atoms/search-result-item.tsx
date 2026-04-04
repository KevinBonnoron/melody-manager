import type { AlbumSearchResult, ArtistSearchResult, PlaylistSearchResult, TrackSearchResult } from '@melody-manager/shared';
import type { LucideIcon } from 'lucide-react';
import { Check, Disc, ExternalLink, Library, Loader2, Music, Plus, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CommandItem } from '@/components/ui/command';
import { formatDuration, getProviderColor } from '@/lib/utils';

export interface LibraryStatus {
  isInLibrary: boolean;
  tracksInLibrary?: number;
  totalTracks?: number;
}

interface SearchResultItemProps {
  externalUrl: string;
  provider: string;
  image: string;
  Icon: LucideIcon;
  title: string;
  subtitle: ReactNode;
  status: LibraryStatus;
  isAdding: boolean;
  onAdd: () => void;
}

function SearchResultItem({ externalUrl, provider, image, Icon, title, subtitle, status, isAdding, onAdd }: SearchResultItemProps) {
  const { t } = useTranslation();
  const isComplete = status.isInLibrary && !status.tracksInLibrary;
  const isPartial = status.tracksInLibrary && status.totalTracks && status.tracksInLibrary < status.totalTracks;
  return (
    <CommandItem value={title} className="flex items-center gap-3 p-3 transition-colors hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-primary/50 data-[selected=true]:bg-secondary/60">
      <div className="flex-shrink-0">
        {image ? (
          <img src={image} alt={title} className="h-12 w-12 rounded object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">
            <Icon className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-card-foreground truncate flex-1">{title}</p>
          <Badge variant="outline" className={`text-xs flex-shrink-0 ${getProviderColor(provider)}`}>
            {provider}
          </Badge>
        </div>
        {subtitle}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          size="sm"
          variant="ghost"
          aria-label={t('GlobalSearch.openExternal')}
          title={t('GlobalSearch.openExternal')}
          onClick={(e) => {
            e.stopPropagation();
            window.open(externalUrl, '_blank');
          }}
          className="transition-colors w-9 h-9 p-0 cursor-pointer"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          aria-label={t('GlobalSearch.addToLibrary')}
          title={t('GlobalSearch.addToLibrary')}
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          disabled={isAdding || !!isComplete}
          variant="default"
          className="transition-all w-9 h-9 p-0 cursor-pointer"
        >
          {isAdding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isComplete ? (
            <Check className="h-4 w-4" />
          ) : isPartial ? (
            <span className="text-xs font-medium">
              {status.tracksInLibrary}/{status.totalTracks}
            </span>
          ) : (
            <Plus className="h-4 w-4 text-primary-foreground" />
          )}
        </Button>
      </div>
    </CommandItem>
  );
}

function Subtitle({ left, right }: { left: string; right?: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <p className="text-sm text-muted-foreground truncate">{left}</p>
      {right && <p className="flex-shrink-0 text-sm text-muted-foreground">{right}</p>}
    </div>
  );
}

export interface TrackResultItemProps {
  result: TrackSearchResult;
  status: LibraryStatus;
  isAdding: boolean;
  onAdd: () => void;
}

export function TrackResultItem({ result, status, isAdding, onAdd }: TrackResultItemProps) {
  return (
    <SearchResultItem
      externalUrl={result.externalUrl}
      provider={result.provider}
      image={result.thumbnail ?? ''}
      Icon={Music}
      title={result.title}
      subtitle={<Subtitle left={[result.artist, result.album].filter(Boolean).join(' • ')} right={result.duration ? formatDuration(result.duration) : undefined} />}
      status={status}
      isAdding={isAdding}
      onAdd={onAdd}
    />
  );
}

export interface AlbumResultItemProps {
  result: AlbumSearchResult;
  status: LibraryStatus;
  isAdding: boolean;
  onAdd: () => void;
}

export function AlbumResultItem({ result, status, isAdding, onAdd }: AlbumResultItemProps) {
  const { t } = useTranslation();
  const right = [result.trackCount ? t('GlobalSearch.tracksCount', { count: result.trackCount }) : null, result.releaseYear].filter(Boolean).join(' • ') || undefined;
  return <SearchResultItem externalUrl={result.externalUrl} provider={result.provider} image={result.coverUrl ?? ''} Icon={Disc} title={result.name} subtitle={<Subtitle left={result.artist ?? ''} right={right} />} status={status} isAdding={isAdding} onAdd={onAdd} />;
}

export interface ArtistResultItemProps {
  result: ArtistSearchResult;
  status: LibraryStatus;
  isAdding: boolean;
  onAdd: () => void;
}

export function ArtistResultItem({ result, status, isAdding, onAdd }: ArtistResultItemProps) {
  const { t } = useTranslation();
  const right = [result.albumCount ? t('GlobalSearch.albumsCount', { count: result.albumCount }) : null, result.trackCount ? t('GlobalSearch.tracksCount', { count: result.trackCount }) : null].filter(Boolean).join(' • ') || undefined;
  return <SearchResultItem externalUrl={result.externalUrl} provider={result.provider} image={result.imageUrl ?? ''} Icon={User} title={result.name} subtitle={<Subtitle left={result.genres?.join(', ') ?? ''} right={right} />} status={status} isAdding={isAdding} onAdd={onAdd} />;
}

export interface PlaylistResultItemProps {
  result: PlaylistSearchResult;
  status: LibraryStatus;
  isAdding: boolean;
  onAdd: () => void;
}

export function PlaylistResultItem({ result, status, isAdding, onAdd }: PlaylistResultItemProps) {
  const { t } = useTranslation();
  return (
    <SearchResultItem
      externalUrl={result.externalUrl}
      provider={result.provider}
      image={result.coverUrl ?? ''}
      Icon={Library}
      title={result.name}
      subtitle={<Subtitle left={result.owner ?? result.description ?? ''} right={result.trackCount ? t('GlobalSearch.tracksCount', { count: result.trackCount }) : undefined} />}
      status={status}
      isAdding={isAdding}
      onAdd={onAdd}
    />
  );
}
