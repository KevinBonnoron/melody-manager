import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthUser } from '@/hooks/use-auth-user';
import { config } from '@/lib/config';
import { cn } from '@/lib/utils';
import { Link, useLocation } from '@tanstack/react-router';
import { Disc3, Heart, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const user = useAuthUser();

  const avatarUrl = user?.avatar ? `${config.pb.url}/api/files/_pb_users_auth_/${user.id}/${user.avatar}` : undefined;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  };

  const profileActive = isActive('/profile');

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden">
      <div className="flex h-14 items-center justify-around">
        <Link to="/" className={cn('flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground transition-colors', isActive('/') && 'text-primary')}>
          <List className="h-5 w-5" />
          <span>{t('AppSidebar.tracks')}</span>
        </Link>
        <Link to="/albums" className={cn('flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground transition-colors', isActive('/albums') && 'text-primary')}>
          <Disc3 className="h-5 w-5" />
          <span>{t('AppSidebar.albums')}</span>
        </Link>
        <Link to="/profile" className={cn('flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground transition-colors', profileActive && 'text-primary')}>
          <Avatar className={cn('h-6 w-6 border-2', profileActive ? 'border-primary' : 'border-transparent')}>
            {avatarUrl && <AvatarImage src={avatarUrl} alt={user?.name} />}
            <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-[8px]">{user?.name ? getInitials(user.name) : '?'}</AvatarFallback>
          </Avatar>
          <span>{t('ProfilePage.title')}</span>
        </Link>
        <Link to="/favorites" className={cn('flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground transition-colors', isActive('/favorites') && 'text-primary')}>
          <Heart className="h-5 w-5" />
          <span>{t('AppSidebar.favorites')}</span>
        </Link>
      </div>
    </nav>
  );
}
