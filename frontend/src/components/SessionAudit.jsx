import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { formatTimestamp } from '@/lib/format';
import LoadingSpinner from './LoadingSpinner';
import PageHeader from './PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  ClipboardList, LogIn, LogOut, RefreshCw, ShieldAlert,
  ChevronLeft, ChevronRight, Users, CalendarDays, AlertTriangle,
} from 'lucide-react';

const PAGE_SIZE = 25;

const EVENT_TYPES = {
  login_success: { label: 'Вход', icon: LogIn, variant: 'success' },
  login_failed: { label: 'Ошибка входа', icon: ShieldAlert, variant: 'destructive' },
  refresh: { label: 'Продление', icon: RefreshCw, variant: 'secondary' },
  logout: { label: 'Выход', icon: LogOut, variant: 'outline' },
};

function parseUserAgent(ua) {
  if (!ua || ua === 'unknown') return '—';
  // Короткий формат: "Chrome 131 / Windows"
  let browser = '—';
  let os = '';
  if (ua.includes('Firefox/')) browser = 'Firefox ' + ua.match(/Firefox\/([\d.]+)/)?.[1]?.split('.')[0];
  else if (ua.includes('Edg/')) browser = 'Edge ' + ua.match(/Edg\/([\d.]+)/)?.[1]?.split('.')[0];
  else if (ua.includes('Chrome/')) browser = 'Chrome ' + ua.match(/Chrome\/([\d.]+)/)?.[1]?.split('.')[0];
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari ' + ua.match(/Version\/([\d.]+)/)?.[1]?.split('.')[0];
  else if (ua.includes('curl/')) browser = 'curl';

  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return os ? `${browser} / ${os}` : browser;
}

function SessionAudit() {
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  // Фильтры
  const [filterUser, setFilterUser] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

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
      if (filterUser) params.username = filterUser;
      if (filterType) params.event_type = filterType;
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;

      const res = await api.get('/audit/sessions', { params });
      setEvents(res.data.items);
      setTotal(res.data.total);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [page, filterUser, filterType, filterDateFrom, filterDateTo]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleFilterReset = () => {
    setFilterUser('');
    setFilterType('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setPage(0);
  };

  const getEventBadge = (eventType) => {
    const cfg = EVENT_TYPES[eventType] || { label: eventType, variant: 'outline' };
    const Icon = cfg.icon;
    return (
      <Badge variant={cfg.variant} className="gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {cfg.label}
      </Badge>
    );
  };

  if (loading && events.length === 0) return <LoadingSpinner text="Загрузка аудита..." />;

  return (
    <div className="space-y-4">
      <PageHeader title="Аудит сессий" breadcrumbs={[{ label: 'Аудит' }]} />

      {/* Статистика */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Всего событий</p>
              </div>
              <div className="text-2xl font-bold tabular-nums">{stats.total_events}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="h-4 w-4 text-[hsl(var(--status-active))]" />
                <p className="text-xs text-muted-foreground">Входов сегодня</p>
              </div>
              <div className="text-2xl font-bold text-[hsl(var(--status-active))] tabular-nums">{stats.logins_today}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-[hsl(var(--status-info))]" />
                <p className="text-xs text-muted-foreground">Пользователей за неделю</p>
              </div>
              <div className="text-2xl font-bold text-[hsl(var(--status-info))] tabular-nums">{stats.unique_users_week}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-[hsl(var(--status-danger))]" />
                <p className="text-xs text-muted-foreground">Неудачных попыток</p>
              </div>
              <div className="text-2xl font-bold text-[hsl(var(--status-danger))] tabular-nums">
                {stats.failed_today}
                {stats.failed_total > 0 && (
                  <span className="text-sm font-normal text-muted-foreground ml-1">/ {stats.failed_total}</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Фильтры */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Пользователь</label>
              <Input
                placeholder="Логин"
                value={filterUser}
                onChange={(e) => { setFilterUser(e.target.value); setPage(0); }}
                className="w-36 h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Событие</label>
              <Select value={filterType} onValueChange={(v) => { setFilterType(v === 'all' ? '' : v); setPage(0); }}>
                <SelectTrigger className="w-40 h-9">
                  <SelectValue placeholder="Все" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  <SelectItem value="login_success">Вход</SelectItem>
                  <SelectItem value="login_failed">Ошибка входа</SelectItem>
                  <SelectItem value="refresh">Продление</SelectItem>
                  <SelectItem value="logout">Выход</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Дата от</label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setPage(0); }}
                className="w-36 h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Дата до</label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setPage(0); }}
                className="w-36 h-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleFilterReset} className="h-9">
              Сбросить
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Таблица */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            События
            <Badge variant="outline" className="ml-1 tabular-nums">{total}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Время</TableHead>
                <TableHead className="w-36">Событие</TableHead>
                <TableHead>Пользователь</TableHead>
                <TableHead>IP адрес</TableHead>
                <TableHead>Браузер</TableHead>
                <TableHead>Детали</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Нет событий
                  </TableCell>
                </TableRow>
              ) : (
                events.map((event, i) => (
                  <TableRow key={`${event.timestamp}-${i}`}>
                    <TableCell className="text-sm tabular-nums">{formatTimestamp(event.timestamp)}</TableCell>
                    <TableCell>{getEventBadge(event.event_type)}</TableCell>
                    <TableCell className="font-medium">{event.username}</TableCell>
                    <TableCell className="text-sm font-mono">{event.ip_address || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{parseUserAgent(event.user_agent)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{event.details || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Показано {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} из {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Назад
            </Button>
            <span className="text-sm tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              Далее
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionAudit;
