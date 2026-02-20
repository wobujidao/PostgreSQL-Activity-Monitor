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
  ChevronLeft, ChevronRight, RotateCcw, Search, Loader2,
  Info, AlertTriangle, XCircle,
} from 'lucide-react';

const PAGE_SIZE = 50;

const LEVEL_CONFIG = {
  info: { label: 'Info', icon: Info, variant: 'secondary' },
  warning: { label: 'Warning', icon: AlertTriangle, variant: 'warning' },
  error: { label: 'Error', icon: XCircle, variant: 'destructive' },
};

const SOURCE_LABELS = {
  collector_stats: 'Статистика',
  collector_sizes: 'Размеры',
  collector_db_info: 'Синхронизация БД',
  maintenance: 'Обслуживание',
  system: 'Система',
};

function SystemLogs() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  const [filterLevel, setFilterLevel] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [appliedFilters, setAppliedFilters] = useState({
    level: '', source: '', search: '', date_from: '', date_to: '',
  });
  const [initialLoad, setInitialLoad] = useState(true);

  const applyFilters = useCallback(() => {
    setAppliedFilters({
      level: filterLevel,
      source: filterSource,
      search: filterSearch.trim(),
      date_from: filterDateFrom,
      date_to: filterDateTo,
    });
    setPage(0);
  }, [filterLevel, filterSource, filterSearch, filterDateFrom, filterDateTo]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') applyFilters();
  };

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/logs/stats');
      setStats(res.data);
    } catch { /* ignore */ }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (appliedFilters.level) params.level = appliedFilters.level;
      if (appliedFilters.source) params.source = appliedFilters.source;
      if (appliedFilters.search) params.search = appliedFilters.search;
      if (appliedFilters.date_from) params.date_from = appliedFilters.date_from;
      if (appliedFilters.date_to) params.date_to = appliedFilters.date_to;

      const res = await api.get('/logs', { params });
      setLogs(res.data.items);
      setTotal(res.data.total);
    } catch { /* ignore */ }
    finally { setLoading(false); setInitialLoad(false); }
  }, [page, appliedFilters]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const hasFilters = appliedFilters.level || appliedFilters.source || appliedFilters.search || appliedFilters.date_from || appliedFilters.date_to;
  const hasPendingChanges = filterLevel !== appliedFilters.level
    || filterSource !== appliedFilters.source
    || filterSearch.trim() !== appliedFilters.search
    || filterDateFrom !== appliedFilters.date_from
    || filterDateTo !== appliedFilters.date_to;

  const handleFilterReset = () => {
    setFilterLevel('');
    setFilterSource('');
    setFilterSearch('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setAppliedFilters({ level: '', source: '', search: '', date_from: '', date_to: '' });
    setPage(0);
  };

  const getLevelBadge = (level) => {
    const cfg = LEVEL_CONFIG[level] || { label: level, variant: 'outline' };
    const Icon = cfg.icon;
    return (
      <Badge variant={cfg.variant} className="gap-1 text-[11px] px-1.5 py-0">
        {Icon && <Icon className="h-2.5 w-2.5" />}
        {cfg.label}
      </Badge>
    );
  };

  if (initialLoad) return <LoadingSpinner text="Загрузка логов..." />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <PageHeader title="Системные логи" breadcrumbs={[{ label: 'Логи' }]} />
        {stats && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Всего <strong className="text-foreground tabular-nums">{stats.total}</strong></span>
            {stats.errors_today > 0 && (
              <span className="text-muted-foreground">Ошибок сегодня <strong className="text-status-danger tabular-nums">{stats.errors_today}</strong></span>
            )}
            {stats.warnings_today > 0 && (
              <span className="text-muted-foreground">Предупреждений <strong className="text-status-warning tabular-nums">{stats.warnings_today}</strong></span>
            )}
          </div>
        )}
      </div>

      {/* Фильтры */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Поиск..."
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-40 h-7 text-sm"
        />
        <Select value={filterLevel || 'all'} onValueChange={(v) => setFilterLevel(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-28 h-7 text-sm">
            <SelectValue placeholder="Уровень" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все уровни</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSource || 'all'} onValueChange={(v) => setFilterSource(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40 h-7 text-sm">
            <SelectValue placeholder="Источник" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все источники</SelectItem>
            <SelectItem value="collector_stats">Статистика</SelectItem>
            <SelectItem value="collector_sizes">Размеры</SelectItem>
            <SelectItem value="collector_db_info">Синхронизация БД</SelectItem>
            <SelectItem value="maintenance">Обслуживание</SelectItem>
            <SelectItem value="system">Система</SelectItem>
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
                <TableHead className="text-xs h-8 w-36">Время</TableHead>
                <TableHead className="text-xs h-8 w-20">Уровень</TableHead>
                <TableHead className="text-xs h-8 w-32">Источник</TableHead>
                <TableHead className="text-xs h-8">Сообщение</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">
                    Нет записей
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log, i) => (
                  <TableRow key={`${log.timestamp}-${i}`} className={log.level === 'error' ? 'bg-destructive/5' : log.level === 'warning' ? 'bg-warning/5' : ''}>
                    <TableCell className="text-xs tabular-nums py-1.5">{formatTimestamp(log.timestamp)}</TableCell>
                    <TableCell className="py-1.5">{getLevelBadge(log.level)}</TableCell>
                    <TableCell className="text-xs py-1.5">{SOURCE_LABELS[log.source] || log.source}</TableCell>
                    <TableCell className="text-xs py-1.5">
                      <div>{log.message}</div>
                      {log.details && (
                        <div className="text-muted-foreground mt-0.5 max-w-lg truncate" title={log.details}>
                          {log.details}
                        </div>
                      )}
                    </TableCell>
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

export default SystemLogs;
