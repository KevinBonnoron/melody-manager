import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { type LucideIcon, Music2, Plug, Plus, RefreshCw, SlidersHorizontal, Trash2, Unlink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { libraryClient } from '@/clients/library.client';
import { connectionCollection } from '@/collections/connection.collection';
import { providerCollection } from '@/collections/provider.collection';
import { providerConfigCollection } from '@/collections/provider-config.collection';
import { trackCollection } from '@/collections/track.collection';
import { DisconnectSourceDialog } from '@/components/providers/disconnect-source-dialog';
import { ProviderConfigDialog } from '@/components/providers/provider-config-dialog';
import { ProviderConnectDialog } from '@/components/providers/provider-connect-dialog';
import { getProviderInfoFromManifests, type ProviderIcon } from '@/components/providers/provider-info';
import { RemoveProviderConfigDialog } from '@/components/providers/remove-provider-config-dialog';
import { Button } from '@/components/ui/button';
import { useAuthUser } from '@/hooks/use-auth-user';
import { usePlugins } from '@/hooks/use-plugins';
import { getSourceColor } from '@/lib/source-colors';
import { cn } from '@/lib/utils';
import type { Connection, Provider, ProviderConfig, Track } from '@/shared';
import { getSourceStatus, getTrackProviders, isSourceInUse, isUserConnectable, ownsItsLibrary, type SourceStatus } from './source-status';

interface SourceMetrics {
  tracks: number;
  albums: number;
  artists: number;
}

export function SourcesPage() {
  const { t } = useTranslation();
  const user = useAuthUser();
  const { manifests } = usePlugins();
  const { data: providers = [] } = useLiveQuery({ query: (q) => q.from({ providers: providerCollection }).where(({ providers }) => eq(providers.enabled, true)) });
  const { data: connections = [] } = useLiveQuery({ query: (q) => q.from({ connections: connectionCollection }).where(({ connections }) => eq(connections.user, user.id)) });
  const { data: tracks = [] } = useLiveQuery({ query: (q) => q.from({ tracks: trackCollection }) });
  const isAdmin = user.role === 'admin';
  const { data: serverConfigs = [] } = useLiveQuery({ query: (q) => q.from({ configs: providerConfigCollection }) });

  const allTrackProviders = useMemo(() => getTrackProviders(providers as Provider[]), [providers]);
  const linkedTypes = useMemo(() => new Set((connections as Connection[]).map((c) => c.type)), [connections]);
  const providerInfo = useMemo(() => getProviderInfoFromManifests(t, manifests), [t, manifests]);

  const metricsByType = useMemo(() => {
    const acc = new Map<string, { tracks: number; albums: Set<string>; artists: Set<string> }>();
    for (const track of tracks as Track[]) {
      let entry = acc.get(track.source);
      if (!entry) {
        entry = { tracks: 0, albums: new Set(), artists: new Set() };
        acc.set(track.source, entry);
      }

      entry.tracks += 1;
      if (track.album) {
        entry.albums.add(track.album);
      }

      for (const artistId of track.artists ?? []) {
        entry.artists.add(artistId);
      }
    }

    return new Map([...acc].map(([type, e]) => [type, { tracks: e.tracks, albums: e.albums.size, artists: e.artists.size } satisfies SourceMetrics]));
  }, [tracks]);

  const statusOf = (type: string) => getSourceStatus(type, manifests, linkedTypes, (metricsByType.get(type)?.tracks ?? 0) > 0);
  const connectableOf = (type: string) => isUserConnectable(type, manifests);
  const activeProviders = allTrackProviders.filter((p) => isSourceInUse(statusOf(p.type)));
  const availableProviders = allTrackProviders.filter((p) => !isSourceInUse(statusOf(p.type)));

  if (allTrackProviders.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('SourcesPage.none')}</p>;
  }

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-[20px] border bg-card px-6 py-[22px]">
        <SummaryStat value={activeProviders.length} label={t('ProvidersPage.activeSources')} />
        <SummaryStat value={tracks.length} label={t('ProvidersPage.aggregatedTracks')} />
        <div className="ml-auto flex gap-2">
          {activeProviders.map((p) => {
            const Icon = providerInfo[p.type]?.icon ?? Music2;
            return (
              <div key={p.id} className="grid h-8 w-8 place-items-center rounded-[10px] text-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]" style={{ backgroundColor: getSourceColor(p.type) }} title={providerInfo[p.type]?.title ?? p.type}>
                <Icon className="h-4 w-4" />
              </div>
            );
          })}
        </div>
      </div>

      {activeProviders.length > 0 && (
        <section className="mb-7">
          <h3 className="mb-3 text-sm font-semibold">{t('ProvidersPage.activeSources')}</h3>
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
            {activeProviders.map((p) => (
              <ConnectedCard
                key={p.id}
                provider={p}
                title={providerInfo[p.type]?.title ?? p.type}
                icon={providerInfo[p.type]?.icon ?? Music2}
                status={statusOf(p.type)}
                metrics={metricsByType.get(p.type) ?? { tracks: 0, albums: 0, artists: 0 }}
                connectionId={(connections as Connection[]).find((c) => c.type === p.type)?.id}
                serverConfig={isAdmin ? (serverConfigs as ProviderConfig[]).find((c) => c.type === p.type) : undefined}
                configurable={isAdmin && (manifests.find((m) => m.id === p.type)?.configSchema?.length ?? 0) > 0}
                connectable={connectableOf(p.type)}
                ownsLibrary={isAdmin && ownsItsLibrary(p.type, manifests)}
                description={providerInfo[p.type]?.description}
              />
            ))}
          </div>
        </section>
      )}

      {availableProviders.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">{t('ProvidersPage.addSource')}</h3>
          <p className="mt-1 mb-3 text-[13px] text-muted-foreground">{t('ProvidersPage.addSourceDescription')}</p>
          {/* The same track size as the active grid, so the two sections line up
              column for column instead of splitting the same width differently. */}
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
            {availableProviders.map((p) => (
              <AvailableCard
                key={p.id}
                provider={p}
                title={providerInfo[p.type]?.title ?? p.type}
                subtitle={providerInfo[p.type]?.description}
                icon={providerInfo[p.type]?.icon ?? Music2}
                serverConfig={isAdmin ? (serverConfigs as ProviderConfig[]).find((c) => c.type === p.type) : undefined}
                configurable={isAdmin && (manifests.find((m) => m.id === p.type)?.configSchema?.length ?? 0) > 0}
                connectable={connectableOf(p.type)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[28px] font-semibold leading-none tabular-nums">{value.toLocaleString()}</div>
      <div className="text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
    </div>
  );
}

function ConnectedCard({
  provider,
  title,
  description,
  icon: Icon,
  status,
  metrics,
  connectionId,
  serverConfig,
  configurable,
  connectable,
  ownsLibrary,
}: {
  provider: Provider;
  title: string;
  description?: string;
  icon: ProviderIcon;
  status: SourceStatus;
  metrics: SourceMetrics;
  connectionId?: string;
  serverConfig?: ProviderConfig;
  configurable: boolean;
  connectable: boolean;
  ownsLibrary: boolean;
}) {
  const { t } = useTranslation();
  const [configOpen, setConfigOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [removeConfigOpen, setRemoveConfigOpen] = useState(false);
  const color = getSourceColor(provider.type);
  const scan = async () => {
    try {
      await libraryClient.scan();
      toast.success(t('SourcesPage.scanStarted', { title }));
    } catch (error) {
      console.error(error);
      toast.error(t('SourcesPage.scanError', { title }));
    }
  };

  return (
    <div className="relative flex flex-col gap-3.5 rounded-xl border bg-card px-[18px] pt-[18px] pb-4 transition-colors hover:border-[var(--plat)]" style={{ '--plat': color } as React.CSSProperties}>
      {/* The title's link is stretched over the whole card, so anywhere that is
          not a control opens the source. Nesting the buttons inside an anchor
          would be invalid markup and would swallow their clicks.

          The status sits on its own line rather than beside the title: sharing
          that row left it a third of the card, which no wording survives in
          every language. */}
      <div className="flex flex-col gap-1.5">
        <Link to="/sources/$type" params={{ type: provider.type }} className="flex min-w-0 items-center gap-3 after:absolute after:inset-0 after:content-['']">
          <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.3),0_1px_2px_rgba(0,0,0,0.3)]" style={{ backgroundColor: color }}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 truncate text-[15px] font-semibold">{title}</div>
        </Link>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={status === 'linked' || status === 'active' ? 'h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_var(--success)]' : 'h-1.5 w-1.5 rounded-full bg-muted-foreground/50'} />
          {t(`SourcesPage.status.${status}`)}
        </div>
      </div>

      <div className="flex gap-6 border-y pt-2.5 pb-2">
        <Metric value={metrics.tracks} label={t('SourcesPage.tracks', { count: metrics.tracks })} />
        <Metric value={metrics.albums} label={t('SourcesPage.albums', { count: metrics.albums })} />
        <Metric value={metrics.artists} label={t('SourcesPage.artists', { count: metrics.artists })} />
      </div>

      {/* Icons rather than labels: what a source offers depends on its scope,
          and spelled out the row wrapped into a different shape on every card.
          Each control keeps its own place, so the set reads the same
          everywhere. */}
      <div className="relative flex items-center justify-end gap-1">
        {ownsLibrary && <CardAction icon={RefreshCw} label={t('SourcesPage.scan')} onClick={scan} />}
        {configurable && <CardAction icon={SlidersHorizontal} label={t('SourcesPage.serverSettings')} onClick={() => setConfigOpen(true)} />}
        {connectable && !connectionId && <CardAction icon={Plug} label={t('AppSidebar.connect')} onClick={() => setConnectOpen(true)} />}
        {connectionId && <CardAction icon={Unlink} label={t('ProviderCardActions.disconnect')} destructive onClick={() => setDisconnectOpen(true)} />}
        {serverConfig && <CardAction icon={Trash2} label={t('ProviderCardActions.removeServerSettings')} destructive onClick={() => setRemoveConfigOpen(true)} />}
      </div>

      {configurable && <ProviderConfigDialog type={provider.type} title={title} description={description} serverConfig={serverConfig} open={configOpen} onOpenChange={setConfigOpen} />}
      {connectable && <ProviderConnectDialog providerId={provider.id} open={connectOpen} onOpenChange={setConnectOpen} />}
      {connectionId && <DisconnectSourceDialog connectionId={connectionId} title={title} open={disconnectOpen} onOpenChange={setDisconnectOpen} />}
      {serverConfig && <RemoveProviderConfigDialog configId={serverConfig.id} title={title} dropsLibrary={ownsLibrary} open={removeConfigOpen} onOpenChange={setRemoveConfigOpen} />}
    </div>
  );
}

function CardAction({ icon: Icon, label, destructive = false, onClick }: { icon: LucideIcon; label: string; destructive?: boolean; onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" className={cn('h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground', destructive && 'hover:bg-destructive/10 hover:text-destructive')} onClick={onClick} aria-label={label} title={label}>
      <Icon className="h-4 w-4" />
    </Button>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-sm font-semibold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
    </div>
  );
}

function AvailableCard({ provider, title, subtitle, icon: Icon, serverConfig, configurable, connectable }: { provider: Provider; title: string; subtitle?: string; icon: ProviderIcon; serverConfig?: ProviderConfig; configurable: boolean; connectable: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  // A source the server owns is not connected, it is configured: sending it to
  // the connect dialog would write a connection row nothing ever reads.
  const start = connectable ? () => setOpen(true) : configurable ? () => setConfigOpen(true) : undefined;

  return (
    <div className="group flex items-center gap-2 rounded-xl border bg-transparent p-3.5 transition-colors hover:border-[var(--plat)] hover:bg-card" style={{ '--plat': getSourceColor(provider.type) } as React.CSSProperties}>
      <button type="button" onClick={start} disabled={!start} aria-label={`${connectable ? t('AppSidebar.connect') : t('SourcesPage.serverSettings')} ${title}`} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default">
        <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-[var(--plat)] text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.3)]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{title}</div>
          {subtitle && <div className="truncate text-[11.5px] text-muted-foreground">{subtitle}</div>}
        </div>
        {start && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/[0.05] text-muted-foreground transition-colors group-hover:bg-[var(--plat)] group-hover:text-white">{connectable ? <Plus className="h-3.5 w-3.5" /> : <SlidersHorizontal className="h-3.5 w-3.5" />}</span>}
      </button>
      {connectable && configurable && <CardAction icon={SlidersHorizontal} label={t('SourcesPage.serverSettings')} onClick={() => setConfigOpen(true)} />}
      {connectable && <ProviderConnectDialog providerId={provider.id} open={open} onOpenChange={setOpen} />}
      {configurable && <ProviderConfigDialog type={provider.type} title={title} description={subtitle} serverConfig={serverConfig} open={configOpen} onOpenChange={setConfigOpen} />}
    </div>
  );
}
