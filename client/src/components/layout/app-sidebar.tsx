import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useAuthUser } from '@/hooks/use-auth-user';
import { config } from '@/lib/config';
import { cn } from '@/lib/utils';
import { Link, useLocation } from '@tanstack/react-router';
import { Disc3, Heart, List, Settings, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SignOutDropdownMenuItem } from './sign-out-dropdown-menu-item';

export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const user = useAuthUser();

  const navItems = [
    {
      title: t('AppSidebar.tracks'),
      href: '/',
      icon: List,
    },
    {
      title: t('AppSidebar.favorites'),
      href: '/favorites',
      icon: Heart,
    },
    {
      title: t('AppSidebar.albums'),
      href: '/albums',
      icon: Disc3,
    },
    {
      title: t('AppSidebar.artists'),
      href: '/artists',
      icon: User,
    },
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

  const avatarUrl = user?.avatar ? `${config.pocketbase.url}/api/files/_pb_users_auth_/${user.id}/${user.avatar}` : undefined;

  return (
    <Sidebar collapsible="icon" className="lg:flex" variant="sidebar">
      <SidebarHeader className="h-16 border-b">
        <div className="flex items-center gap-3 px-2 group-data-[collapsible=icon]:justify-center">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8">
            <img src="/icon.svg" alt="Melody Manager" className="h-8 w-8 group-data-[collapsible=icon]:h-6 group-data-[collapsible=icon]:w-6" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Melody Manager</h1>
            <p className="text-[11px] text-muted-foreground whitespace-nowrap">{t('AppSidebar.tagline')}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
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
            <DropdownMenu modal={false}>
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
                {user?.role === 'admin' && (
                  <>
                    <Link to="/admin">
                      <DropdownMenuItem>
                        <Settings className="mr-2 h-4 w-4" />
                        <span>{t('AppSidebar.admin')}</span>
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                  </>
                )}

                <SignOutDropdownMenuItem />
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
