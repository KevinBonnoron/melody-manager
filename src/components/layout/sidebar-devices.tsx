import { Link, useLocation } from '@tanstack/react-router';
import { SlidersHorizontal, Speaker } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useAuthUser } from '@/hooks/use-auth-user';
import { useDeviceProviders } from '@/hooks/use-device-providers';
import { useDevices } from '@/hooks/use-devices';
import { usePlugins } from '@/hooks/use-plugins';
import { useUndecidedSpeakers } from '@/hooks/use-speakers';
import { cn } from '@/lib/utils';
import type { Provider } from '@/shared';
import { SpeakerAddressesDialog } from '../devices/speaker-addresses-dialog';
import { getProviderInfoFromManifests } from '../providers/provider-info';

// Where sound comes out, in a section of its own. Devices and platforms share a
// table and a settings screen, and nothing else: listed together they would only
// invite the question of why a speaker holds no tracks.
export function SidebarDevices() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { manifests } = usePlugins();
  const deviceProviders = useDeviceProviders();
  const { speakers } = useDevices();
  const user = useAuthUser();
  const undecided = useUndecidedSpeakers();
  const providerInfo = useMemo(() => getProviderInfoFromManifests(t, manifests), [t, manifests]);
  const on = useMemo(() => deviceProviders.filter((p) => p.enabled), [deviceProviders]);
  const off = useMemo(() => deviceProviders.filter((p) => !p.enabled), [deviceProviders]);

  const isAdmin = user.role === 'admin';
  const waiting = isAdmin ? undecided.length : 0;

  if (deviceProviders.length === 0) {
    return null;
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="justify-between">
        <span>{t('AppSidebar.devices')}</span>
        <span className="text-[10px] text-muted-foreground/60 font-normal">{t('AppSidebar.devicesFound', { count: speakers.length })}</span>
      </SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          {/* A speaker nobody has decided about is only visible on the devices
              screen, and nothing would take an admin there. The dot is what
              does: it says there is something to look at, and it is on the row
              that leads to it. */}
          <SidebarMenuButton asChild tooltip={waiting > 0 ? t('DevicesPage.undecided', { count: waiting }) : t('AppSidebar.allDevices')} isActive={pathname === '/devices'}>
            <Link to="/devices">
              <Speaker className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1">{t('AppSidebar.allDevices')}</span>
              {waiting > 0 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]" />}
              <span className="text-[10px] tabular-nums text-muted-foreground font-mono">{speakers.length}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>

        {on.map((provider) => (
          <DeviceItem key={provider.id} provider={provider} title={providerInfo[provider.type]?.title ?? provider.type} found={speakers.filter((s) => s.type === provider.type).length} active={pathname === `/devices/${provider.type}`} />
        ))}

        {/* Divider and dimmed below it, the shape Platforms uses for a source
            that is not in service. A kind that is off keeps its row, though, and
            keeps leading somewhere: that row is the only way back to the settings
            that put it in service. Admin only, because those settings are: a
            regular user cannot read provider_config, let alone write it, so the
            row would open a form that refuses every change they make. */}
        {isAdmin && off.length > 0 && <div className="mx-2 my-1 h-px bg-border" />}
        {isAdmin && off.map((provider) => <OffDeviceItem key={provider.id} provider={provider} title={providerInfo[provider.type]?.title ?? provider.type} />)}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function DeviceItem({ provider, title, found, active, muted = false }: { provider: Provider; title: string; found: number; active: boolean; muted?: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={title} isActive={active} className={cn(muted && 'text-muted-foreground')}>
        <Link to="/devices/$type" params={{ type: provider.type }}>
          <div className={cn('flex items-center justify-center w-[18px] h-[18px] shrink-0 rounded-[6px] border border-current', muted && 'opacity-40')}>
            <Speaker className="h-2.5 w-2.5" />
          </div>
          <span className={cn('flex-1', muted && 'opacity-60')}>{title}</span>
          {!muted && <span className="text-[10px] tabular-nums text-muted-foreground font-mono">{found}</span>}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// A kind that is switched off has nothing to list, so its row opens what puts it
// back in service rather than a page that would only say it is off. The same
// move a source that is not connected makes.
function OffDeviceItem({ provider, title }: { provider: Provider; title: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip={t('DevicesPage.settings', { title })} className="text-muted-foreground" onClick={() => setOpen(true)}>
        <div className="flex items-center justify-center w-[18px] h-[18px] shrink-0 rounded-[6px] border border-current opacity-40">
          <Speaker className="h-2.5 w-2.5" />
        </div>
        <span className="flex-1 opacity-60">{title}</span>
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-foreground opacity-0 transition-opacity group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100" />
      </SidebarMenuButton>
      <SpeakerAddressesDialog provider={provider} title={title} open={open} onOpenChange={setOpen} />
    </SidebarMenuItem>
  );
}
