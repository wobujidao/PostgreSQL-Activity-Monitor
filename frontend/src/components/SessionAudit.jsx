import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { formatTimestamp } from '@/lib/format';
import LoadingSpinner from './LoadingSpinner';
import PageHeader from './PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  LogIn, LogOut, RefreshCw, ShieldAlert,
  ChevronLeft, ChevronRight, RotateCcw, Search, Loader2,
  UserPlus, UserMinus, UserCog, ServerCog, Server, ServerOff, KeyRound, Settings,
} from 'lucide-react';

const PAGE_SIZE = 25;

const EVENT_TYPES = {
  // Авторизация
  login_success: { label: 'Вход', icon: LogIn, variant: 'success' },
  login_failed: { label: 'Ошибка', icon: ShieldAlert, variant: 'destructive' },
  refresh: { label: 'Продление', icon: RefreshCw, variant: 'secondary' },
  logout: { label: 'Выход', icon: LogOut, variant: 'outline' },
  // Пользователи
  user_create: { label: 'Польз.+', icon: UserPlus, variant: 'success' },
  user_update: { label: 'Польз.~', icon: UserCog, variant: 'outline' },
  user_delete: { label: 'Польз.−', icon: UserMinus, variant: 'destructive' },
  // Серверы
  server_create: { label: 'Сервер+', icon: Server, variant: 'success' },
  server_update: { label: 'Сервер~', icon: ServerCog, variant: 'outline' },
  server_delete: { label: 'Сервер−', icon: ServerOff, variant: 'destructive' },
  // SSH-ключи
  ssh_key_create: { label: 'Ключ+', icon: KeyRound, variant: 'success' },
  ssh_key_update: { label: 'Ключ~', icon: KeyRound, variant: 'outline' },
  ssh_key_delete: { label: 'Ключ−', icon: KeyRound, variant: 'destructive' },
  // Настройки
  settings_update: { label: 'Настройки', icon: Settings, variant: 'outline' },
};

function parseUserAgent(ua) {
  if (!ua || ua === 'unknown') return '—';
  let browser = '—';
  let os = '';
  if (ua.includes('Firefox/')) browser = 'Firefox ' + ua.match(/Firefox\/([\d.]+)/)?.[1]?.split('.')[0];
  else if (ua.includes('Edg/')) browser = 'Edge ' + ua.match(/Edg\/([\d.]+)/)?.[1]?.split('.')[0];
  else if (ua.includes('Chrome/')) browser = 'Chrome ' + ua.match(/Chrome\/([\d.]+)/)?.[1]?.split('.')[0];
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari ' + ua.match(/Version\/([\d.]+)/)?.[1]?.split('.')[0];
  else if (ua.includes('curl/')) browser = 'curl';

  if (ua.includes('Windows')) os = 'Win';
  else if (ua.includes('Mac OS')) os = 'Mac';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return os ? `${browser}/${os}` : browser;
}

function SessionAudit() {
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  // Поля ввода (не вызывают запрос)
  const [filterUser, setFilterUser] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Применённые фильтры (вызывают запрос)
  const [appliedFilters, setAppliedFilters] = useState({
    username: '', event_type: '', date_from: '', date_to: '',
  });
  const [initialLoad, setInitialLoad] = useState(true);

  const applyFilters = useCallback(() => {
    setAppliedFilters({
      username: filterUser.trim(),
      event_type: filterType,
      date_from: filterDateFrom,
      date_to: filterDateTo,
    });
    setPage(0);
  }, [filterUser, filterType, filterDateFrom, filterDateTo]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') applyFilters();
  };

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/audit/sessions/stats');
      setStats(res.data);
    } catch { /* ignore */ }
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (appliedFilters.username) params.username = appliedFilters.username;
      if (appliedFilters.event_type) params.event_type = appliedFilters.event_type;
      if (appliedFilters.date_from) params.date_from = appliedFilters.date_from;
      if (appliedFilters.date_to) params.date_to = appliedFilters.date_to;

      const res = await api.get('/audit/sessions', { params });
      setEvents(res.data.items);
      setTotal(res.data.total);
    } catch { /* ignore */ }
    finally { setLoading(false); setInitialLoad(false); }
  }, [page, appliedFilters]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const hasFilters = appliedFilters.username || appliedFilters.event_type || appliedFilters.date_from || appliedFilters.date_to;
  const hasPendingChanges = filterUser.trim() !== appliedFilters.username
    || filterType !== appliedFilters.event_type
    || filterDateFrom !== appliedFilters.date_from
    || filterDateTo !== appliedFilters.date_to;

  const handleFilterReset = () => {
    setFilterUser('');
    setFilterType('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setAppliedFilters({ username: '', event_type: '', date_from: '', date_to: '' });
    setPage(0);
  };

  const getEventBadge = (eventType) => {
    const cfg = EVENT_TYPES[eventType] || { label: eventType, variant: 'outline' };
    const Icon = cfg.icon;
    return (
      <Badge variant={cfg.variant} className="gap-1 text-[11px] px-1.5 py-0">
        {Icon && <Icon className="h-2.5 w-2.5" />}
        {cfg.label}
      </Badge>
    );
  };

  if (initialLoad) return <LoadingSpinner text="Загрузка аудита..." />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <PageHeader title="Аудит сессий" breadcrumbs={[{ label: 'Аудит' }]} />
        {/* Статистика — компактная полоска */}
        {stats && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Всего <strong className="text-foreground tabular-nums">{stats.total_events}</strong></span>
            <span className="text-muted-foreground">Сегодня <strong className="text-status-active tabular-nums">{stats.logins_today}</strong></span>
            <span className="text-muted-foreground">За неделю <strong className="text-status-info tabular-nums">{stats.unique_users_week}</strong> польз.</span>
            {stats.actions_today > 0 && (
              <span className="text-muted-foreground">Действий <strong className="text-foreground tabular-nums">{stats.actions_today}</strong></span>
            )}
            {stats.failed_today > 0 && (
              <span className="text-muted-foreground">Ошибок <strong className="text-status-danger tabular-nums">{stats.failed_today}</strong></span>
            )}
          </div>
        )}
      </div>

      {/* Фильтры — одна строка, применяются по кнопке или Enter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Пользователь / IP"
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-32 h-7 text-sm"
        />
        <Select value={filterType || 'all'} onValueChange={(v) => setFilterType(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-48 h-7 text-sm">
            <SelectValue placeholder="Все события" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все события</SelectItem>
            <SelectItem value="login_success">Вход</SelectItem>
            <SelectItem value="login_failed">Ошибка входа</SelectItem>
            <SelectItem value="refresh">Продление</SelectItem>
            <SelectItem value="logout">Выход</SelectItem>
            <SelectItem value="user_create">Создание пользователя</SelectItem>
            <SelectItem value="user_update">Изменение пользователя</SelectItem>
            <SelectItem value="user_delete">Удаление пользователя</SelectItem>
            <SelectItem value="server_create">Добавление сервера</SelectItem>
            <SelectItem value="server_update">Изменение сервера</SelectItem>
            <SelectItem value="server_delete">Удаление сервера</SelectItem>
            <SelectItem value="ssh_key_create">Создание SSH-ключа</SelectItem>
            <SelectItem value="ssh_key_delete">Удаление SSH-ключа</SelectItem>
            <SelectItem value="settings_update">Изменение настроек</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-32 h-7 text-sm"
        />
        <span className="text-xs text-muted-foreground">—</span>
        <Input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-32 h-7 text-sm"
        />
        <Button
          variant={hasPendingChanges ? 'default' : 'outline'}
          size="sm"
          onClick={applyFilters}
          disabled={!hasPendingChanges}
          className="h-7 px-2.5 text-xs"
        >
          <Search className="h-3 w-3 mr-1" />Найти
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={handleFilterReset} className="h-7 px-2 text-xs">
            <RotateCcw className="h-3 w-3 mr-1" />Сброс
          </Button>
        )}
        <div className="ml-auto text-xs text-muted-foreground tabular-nums">
          {total > 0 && <>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} из {total}</>}
        </div>
      </div>

      {/* Таблица */}
      <Card className="relative">
        {loading && (
          <div className="absolute inset-0 bg-background/60 z-10 flex items-center justify-center rounded-xl">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs h-8">Время</TableHead>
                <TableHead className="text-xs h-8">Событие</TableHead>
                <TableHead className="text-xs h-8">Пользователь</TableHead>
                <TableHead className="text-xs h-8">IP</TableHead>
                <TableHead className="text-xs h-8">Браузер</TableHead>
                <TableHead className="text-xs h-8">Детали</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">
                    Нет событий
                  </TableCell>
                </TableRow>
              ) : (
                events.map((event, i) => (
                  <TableRow key={`${event.timestamp}-${i}`}>
                    <TableCell className="text-xs tabular-nums py-1.5">{formatTimestamp(event.timestamp)}</TableCell>
                    <TableCell className="py-1.5">{getEventBadge(event.event_type)}</TableCell>
                    <TableCell className="text-sm font-medium py-1.5">{event.username}</TableCell>
                    <TableCell className="text-xs font-mono py-1.5">{event.ip_address || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground py-1.5">{parseUserAgent(event.user_agent)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground py-1.5 max-w-48 truncate">{event.details || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7 text-xs">
            <ChevronLeft className="h-3 w-3 mr-0.5" />Назад
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">{page + 1}/{totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-7 text-xs">
            Далее<ChevronRight className="h-3 w-3 ml-0.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default SessionAudit;
