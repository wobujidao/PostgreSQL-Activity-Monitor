import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServers } from '@/hooks/use-servers';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from 'next-themes';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Server, Home, Users, KeyRound, ClipboardList, Sun, Moon, LogOut, Plus } from 'lucide-react';

export default function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { servers } = useServers();
  const { userRole, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const runAction = (fn) => {
    onOpenChange(false);
    fn();
  };

  const getStatusBadge = (server) => {
    if (!server.status || server.status === 'failed' || server.status?.includes?.('error')) {
      return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">offline</Badge>;
    }
    return <Badge variant="success" className="text-[10px] px-1.5 py-0">online</Badge>;
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Поиск серверов, страниц, действий..." />
      <CommandList>
        <CommandEmpty>Ничего не найдено</CommandEmpty>

        {servers.length > 0 && (
          <CommandGroup heading="Серверы">
            {servers.map(s => (
              <CommandItem key={s.name} onSelect={() => runAction(() => navigate(`/server/${s.name}`))}>
                <Server className="mr-2 h-4 w-4" />
                <span className="flex-1">{s.name}</span>
                <span className="text-xs text-muted-foreground mr-2">{s.host}</span>
                {getStatusBadge(s)}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Навигация">
          <CommandItem onSelect={() => runAction(() => navigate('/'))}>
            <Home className="mr-2 h-4 w-4" />
            Главная
          </CommandItem>
          {userRole === 'admin' && (
            <CommandItem onSelect={() => runAction(() => navigate('/users'))}>
              <Users className="mr-2 h-4 w-4" />
              Управление пользователями
            </CommandItem>
          )}
          {(userRole === 'admin' || userRole === 'operator') && (
            <CommandItem onSelect={() => runAction(() => navigate('/ssh-keys'))}>
              <KeyRound className="mr-2 h-4 w-4" />
              SSH-ключи
            </CommandItem>
          )}
          {userRole === 'admin' && (
            <CommandItem onSelect={() => runAction(() => navigate('/audit'))}>
              <ClipboardList className="mr-2 h-4 w-4" />
              Аудит сессий
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Действия">
          <CommandItem onSelect={() => runAction(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}>
            {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          </CommandItem>
          <CommandItem onSelect={() => runAction(logout)}>
            <LogOut className="mr-2 h-4 w-4" />
            Выход
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
