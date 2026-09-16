import { Link, useLocation } from '@tanstack/react-router';
import { Music2, Plus, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isSourceInUse, isUserConnectable } from '@/components/sources/source-status';
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useActiveSources } from '@/hooks/use-active-sources';
import { useAuthUser } from '@/hooks/use-auth-user';
import { usePlugins } from '@/hooks/use-plugins';
import { getSourceColor } from '@/lib/source-colors';
import { cn } from '@/lib/utils';
import type { PluginManifest, Provider } from '@/shared';
import { ProviderConfigDialog } from '../providers/provider-config-dialog';
import { ProviderConnectDialog } from '../providers/provider-connect-dialog';
import { getProviderInfoFromManifests, type ProviderIcon } from '../providers/provider-info';

export function SidebarPlatforms() {
  const { t } = useTranslation();
  const { manifests } = usePlugins();
  const { pathname } = useLocation();
  const { trackProviders, statusOf, countByType, totalTracks } = useActiveSources();
  const providerInfo = useMemo(() => getProviderInfoFromManifests(t, manifests), [t, manifests]);
  const connectedProviders = useMemo(() => trackProviders.filter((p) => isSourceInUse(statusOf(p.type))), [trackProviders, statusOf]);
  const availableProviders = useMemo(() => trackProviders.filter((p) => !isSourceInUse(statusOf(p.type))), [trackProviders, statusOf]);

  if (trackProviders.length === 0) {
    return null;
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="justify-between">
        <span>{t('AppSidebar.platforms')}</span>
        <span className="text-[10px] text-muted-foreground/60 font-normal">{t('AppSidebar.platformsConnected', { count: connectedProviders.length })}</span>
      </SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip={t('AppSidebar.allSources')} isActive={pathname === '/sources'}>
            <Link to="/sources">
              <div className="flex items-center justify-center w-[18px] h-[18px] shrink-0">
                {connectedProviders.slice(0, 3).map((p, i) => (
                  <span key={p.id} className={cn('w-[7px] h-[7px] shrink-0 rounded-full shadow-[0_0_0_1.5px_var(--sidebar)]', i > 0 && '-ml-[3px]')} style={{ backgroundColor: getSourceColor(p.type) }} />
                ))}
              </div>
              <span className="flex-1">{t('AppSidebar.allSources')}</span>
              <span className="text-[10px] tabular-nums text-muted-foreground font-mono">{totalTracks.toLocaleString()}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>

        {connectedProviders.map((p) => {
          const info = providerInfo[p.type];
          const Icon = info?.icon ?? Music2;
          const count = countByType.get(p.type) ?? 0;

          return (
            <SidebarMenuItem key={p.id}>
              <SidebarMenuButton asChild tooltip={info?.title ?? p.type} isActive={pathname === `/sources/${p.type}`}>
                <Link to="/sources/$type" params={{ type: p.type }}>
                  <div className="flex items-center justify-center w-[18px] h-[18px] shrink-0 rounded-[6px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.3),0_1px_2px_rgba(0,0,0,0.3)]" style={{ backgroundColor: getSourceColor(p.type) }}>
                    <Icon className="h-2.5 w-2.5 text-white" />
                  </div>
                  <span className="flex-1">{info?.title ?? p.type}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground font-mono">{count.toLocaleString()}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}

        {availableProviders.length > 0 && <div className="mx-2 my-1 h-px bg-border" />}
        {availableProviders.map((p) => (
          <AvailableSourceItem key={p.id} provider={p} title={providerInfo[p.type]?.title ?? p.type} icon={providerInfo[p.type]?.icon ?? Music2} manifests={manifests} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function AvailableSourceItem({ provider, title, icon: Icon, manifests }: { provider: Provider; title: string; icon: ProviderIcon; manifests: PluginManifest[] }) {
  const { t } = useTranslation();
  const user = useAuthUser();
  const [connectOpen, setConnectOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const connectable = isUserConnectable(provider.type, manifests);
  const configurable = user.role === 'admin' && (manifests.find((m) => m.id === provider.type)?.configSchema?.length ?? 0) > 0;
  const start = connectable ? () => setConnectOpen(true) : configurable ? () => setConfigOpen(true) : undefined;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip={`${connectable ? t('AppSidebar.connect') : t('SourcesPage.serverSettings')} ${title}`} className={cn('text-muted-foreground')} disabled={!start} onClick={start}>
        <div className="flex items-center justify-center w-[18px] h-[18px] shrink-0 rounded-[6px] border border-current opacity-40">
          <Icon className="h-2.5 w-2.5" />
        </div>
        <span className="flex-1 opacity-60">{title}</span>
        {connectable ? (
          <Plus className="h-3.5 w-3.5 shrink-0 text-foreground opacity-0 transition-opacity group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100" />
        ) : (
          configurable && <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-foreground opacity-0 transition-opacity group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100" />
        )}
      </SidebarMenuButton>
      {connectable && <ProviderConnectDialog providerId={provider.id} open={connectOpen} onOpenChange={setConnectOpen} />}
      {configurable && <ProviderConfigDialog type={provider.type} title={title} serverConfig={undefined} open={configOpen} onOpenChange={setConfigOpen} />}
    </SidebarMenuItem>
  );
}
