import { Link, useLocation } from '@tanstack/react-router';
import { ChartNoAxesColumn, History, Home, Library, PanelLeft, Search, Share2, SlidersHorizontal, User, UserCircle, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar } from '@/components/ui/sidebar';
import { useAuthUser } from '@/hooks/use-auth-user';
import { config } from '@/lib/config';
import { cn, getModifierKey } from '@/lib/utils';
import { ChangeServerMenuItem } from './change-server-menu-item';
import { SidebarDevices } from './sidebar-devices';
import { SidebarPlatforms } from './sidebar-platforms';
import { SignOutDropdownMenuItem } from './sign-out-dropdown-menu-item';

export function AppSidebar() {
  const { t } = useTranslation();
  const { toggleSidebar } = useSidebar();
  const location = useLocation();
  const user = useAuthUser();
  const navItems = [
    { title: t('AppSidebar.home'), href: '/', icon: Home },
    { title: t('AppSidebar.library'), href: '/library', icon: Library },
    { title: t('AppSidebar.history'), href: '/history', icon: History },
    { title: t('AppSidebar.stats'), href: '/stats', icon: ChartNoAxesColumn },
  ];

  const userNavItems = [{ title: t('AppSidebar.shares'), href: '/shares', icon: Share2 }];
  const adminNavItems = [
    { title: t('Admin.usersTitle'), href: '/admin/users', icon: Users },
    { title: t('AdminSettings.title'), href: '/admin/settings', icon: SlidersHorizontal },
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }

    return location.pathname.startsWith(href);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const avatarUrl = user?.avatar ? `${config.pb.url}/api/files/_pb_users_auth_/${user.id}/${user.avatar}` : undefined;

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="h-16 border-b p-0 flex items-center justify-center">
        <div className="flex w-full items-center gap-2 px-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          {/* Collapsed there is no room for the name, so the mark stands in for
              it. The control that opens the sidebar lives in the footer, where
              it stays visible either way. */}
          <span className="truncate text-[15px] font-semibold tracking-tight group-data-[collapsible=icon]:hidden">Melody Manager</span>
          <img src="/icon.svg" alt="Melody Manager" className="hidden h-8 w-8 shrink-0 group-data-[collapsible=icon]:block" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.slice(0, 2).map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.href}>
                        <Icon className={cn(active && 'text-primary')} />
                        <span className={cn(active && 'text-primary')}>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive('/search')} tooltip={t('AppSidebar.search')}>
                  <Link to="/search">
                    <Search className={cn(isActive('/search') && 'text-primary')} />
                    <span className={cn('flex-1', isActive('/search') && 'text-primary')}>{t('AppSidebar.search')}</span>
                    <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono border border-border">{getModifierKey('k')}</kbd>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {navItems.slice(2).map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.href}>
                        <Icon className={cn(active && 'text-primary')} />
                        <span className={cn(active && 'text-primary')}>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarPlatforms />
        <SidebarDevices />

        {user?.role === 'admin' && (
          <SidebarGroup>
            <SidebarGroupLabel>{t('AppSidebar.admin')}</SidebarGroupLabel>
            <SidebarMenu>
              {adminNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.href}>
                        <Icon className={cn(active && 'text-primary')} />
                        <span className={cn(active && 'text-primary')}>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* Just above the rule that closes the navigation, aligned right: it
            acts on the sidebar itself, so it is not one of its destinations. */}
        <div className="mt-auto hidden justify-end px-2 pb-1 group-data-[collapsible=icon]:justify-center md:flex">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={toggleSidebar} aria-label={t('AppSidebar.toggle')} title={t('AppSidebar.toggle')}>
            <PanelLeft className="h-4 w-4" />
          </Button>
        </div>

        <SidebarGroup className="border-t pt-2">
          <SidebarGroupContent>
            <SidebarMenu>
              {userNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.href}>
                        <Icon className={cn(active && 'text-primary')} />
                        <span className={cn(active && 'text-primary')}>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={user?.name || 'User'}>
                  <Avatar className="h-8 w-8">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt={user?.name || 'User'} />}
                    <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground">{user?.name ? getInitials(user.name) : <User className="h-4 w-4" />}</AvatarFallback>
                  </Avatar>
                  <span>{user?.name || 'User'}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" side="top">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.name || 'User'}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user?.email || 'No email'}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <Link to="/profile">
                  <DropdownMenuItem>
                    <UserCircle className="mr-2 h-4 w-4" />
                    <span>{t('ProfilePage.title')}</span>
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator />
                <ChangeServerMenuItem />
                <SignOutDropdownMenuItem />
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
