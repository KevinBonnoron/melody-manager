import { Link } from '@tanstack/react-router';
import { ChevronRight, Plug, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '../ui/card';

export function AdminPage() {
  const { t } = useTranslation();
  const adminLinks = [
    {
      titleKey: 'Admin.usersTitle' as const,
      descriptionKey: 'Admin.usersDescription' as const,
      icon: Users,
      href: '/admin/users',
    },
    {
      titleKey: 'Admin.providersTitle' as const,
      descriptionKey: 'Admin.providersDescription' as const,
      icon: Plug,
      href: '/admin/providers',
    },
  ];

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        {adminLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} to={link.href} className="h-full">
              <Card className="h-full p-6 hover:bg-accent/50 transition-colors cursor-pointer group">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-semibold text-lg">{t(link.titleKey)}</h3>
                      <p className="text-sm text-muted-foreground">{t(link.descriptionKey)}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
