import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from 'next-themes';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, Server, Users, KeyRound, ClipboardList, Settings, LogOut, Sun, Moon, Search } from 'lucide-react';

export default function AppSidebar({ onSearchOpen }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, userRole, backendStatus, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const roleLabel = userRole === 'admin' ? 'Администратор' : userRole === 'operator' ? 'Оператор' : 'Просмотр';

  const navItems = [
    { label: 'Серверы', icon: Server, path: '/', always: true },
    { label: 'Пользователи', icon: Users, path: '/users', roles: ['admin'] },
    { label: 'SSH-ключи', icon: KeyRound, path: '/ssh-keys', roles: ['admin', 'operator'] },
    { label: 'Аудит', icon: ClipboardList, path: '/audit', roles: ['admin'] },
    { label: 'Настройки', icon: Settings, path: '/settings', roles: ['admin'] },
  ];

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-accent">
            <Shield className="h-4 w-4 text-sidebar-accent-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-sidebar-foreground">PAM</span>
            <Badge
              variant={backendStatus === 'available' ? 'success' : 'destructive'}
              className="text-[10px] px-1.5 py-0"
            >
              {backendStatus === 'available' ? 'Online' : 'Offline'}
            </Badge>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Навигация</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems
                .filter((item) => item.always || (item.roles && item.roles.includes(userRole)))
                .map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive(item.path)}
                      onClick={() => navigate(item.path)}
                      tooltip={item.label}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onSearchOpen} tooltip="Поиск (Ctrl+K)">
                  <Search className="h-4 w-4" />
                  <span>Поиск</span>
                  <kbd className="ml-auto pointer-events-none inline-flex h-5 items-center gap-1 rounded border border-sidebar-border bg-sidebar-accent/20 px-1.5 font-mono text-[10px] font-medium text-sidebar-muted">
                    Ctrl+K
                  </kbd>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <SidebarSeparator className="mb-3" />
        <div className="flex items-center justify-between">
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-sidebar-foreground truncate">{currentUser}</span>
            <span className="text-xs text-sidebar-muted">{roleLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="h-8 w-8 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/20"
              aria-label="Переключить тему"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              className="h-8 w-8 text-sidebar-muted hover:text-destructive hover:bg-destructive/10"
              title="Выход"
              aria-label="Выход"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
