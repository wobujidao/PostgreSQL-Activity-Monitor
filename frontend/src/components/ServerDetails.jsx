import { useState, useEffect, useRef, useCallback } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, LineController, TimeScale, Title, Tooltip as ChartTooltip, Legend } from 'chart.js';
import 'chartjs-adapter-date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { formatBytesGB, formatTimestamp } from '@/lib/format';
import { DEFAULT_CRITERIA, LS_CRITERIA, LS_USER_ROLE, ITEMS_PER_PAGE } from '@/lib/constants';
import ServerDetailsSkeleton from './skeletons/ServerDetailsSkeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination';
import { Separator } from '@/components/ui/separator';
import {
  ArrowUpDown, ArrowUp, ArrowDown, Loader2, Download, RefreshCw,
  Database, Activity, Settings, AlertTriangle, CheckCircle, XCircle, MinusCircle,
} from 'lucide-react';
import { toast } from 'sonner';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, TimeScale, Title, ChartTooltip, Legend);

const loadCriteria = () => {
  try {
    const saved = localStorage.getItem(LS_CRITERIA);
    return saved ? JSON.parse(saved) : { ...DEFAULT_CRITERIA };
  } catch { return { ...DEFAULT_CRITERIA }; }
};
const saveCriteria = (c) => localStorage.setItem(LS_CRITERIA, JSON.stringify(c));

function ServerDetails() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [serverData, setServerData] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [hideDeleted] = useState(true);
  const [showNoConnections, setShowNoConnections] = useState(false);
  const [showStaticConnections, setShowStaticConnections] = useState(false);
  const [showUnchangedConnections, setShowUnchangedConnections] = useState(false);
  const [startDate, setStartDate] = useState(new Date(Date.now() - 7 * 86400000));
  const [endDate, setEndDate] = useState(new Date());
  const [selectedDateRange, setSelectedDateRange] = useState(7);
  const [sortColumn, setSortColumn] = useState('size');
  const [sortDirection, setSortDirection] = useState('desc');
  const [nameFilter, setNameFilter] = useState('');
  const [nameFilterType, setNameFilterType] = useState('contains');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState('overview');
  const [analysisFilter, setAnalysisFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [criteria, setCriteria] = useState(loadCriteria());
  const [criteriaChanged, setCriteriaChanged] = useState(false);
  const connectionsChartRef = useRef(null);
  const sizeChartRef = useRef(null);
  const connectionsCanvasRef = useRef(null);
  const sizeCanvasRef = useRef(null);
  const isMounted = useRef(true);

  const userRole = localStorage.getItem(LS_USER_ROLE) || 'viewer';
  const canEditCriteria = userRole === 'admin' || userRole === 'operator';

  // --- Helpers ---
  const getAggregatedTimeline = useCallback(() => {
    if (!stats?.connection_timeline) return [];
    const map = new Map();
    stats.connection_timeline.forEach(e => {
      if (!map.has(e.ts)) map.set(e.ts, { connections: 0, size_gb: 0 });
      const a = map.get(e.ts);
      a.connections += e.connections || 0;
      a.size_gb += e.size_gb || 0;
    });
    return Array.from(map.entries()).map(([ts, d]) => ({ ts, ...d }));
  }, [stats]);

  const getDatabaseConnections = useCallback((dbName) => {
    if (!stats?.connection_timeline) return [];
    return stats.connection_timeline.filter(e => e.datname === dbName).map(e => e.connections);
  }, [stats]);

  const getDatabaseSize = useCallback((dbName) => {
    if (!stats?.connection_timeline) return null;
    const last = stats.connection_timeline.filter(e => e.datname === dbName && e.size_gb > 0).slice(-1)[0];
    return last?.size_gb ?? null;
  }, [stats]);

  const hasUnchangedConnections = useCallback((dbName) => {
    const conns = getDatabaseConnections(dbName);
    if (conns.length < 2) return false;
    return new Set(conns).size === 1 && conns[0] > 0;
  }, [getDatabaseConnections]);

  const formatSize = (sizeGb) => {
    if (sizeGb == null) return 'N/A';
    if (sizeGb < 1) return `${(sizeGb * 1024).toFixed(0)} МБ`;
    return `${sizeGb.toFixed(2)} ГБ`;
  };

  const formatCreationTime = (t) => {
    if (!t) return 'N/A';
    return new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
  };

  // --- Analysis ---
  const analyzeDatabases = useCallback(() => {
    if (!stats?.databases) return null;
    const now = new Date();
    const analyzed = stats.databases.map(db => {
      const timeline = stats.connection_timeline?.filter(e => e.datname === db.name) || [];
      const lastEntry = timeline[timeline.length - 1];
      const lastActivity = lastEntry?.ts;
      const daysSince = lastActivity ? Math.floor((now - new Date(lastActivity).getTime()) / 86400000) : Infinity;

      let isStatic = false, hasUnchanged = false, avgConn = 0;
      if (timeline.length > 10) {
        const last10 = timeline.slice(-10).map(e => e.connections || 0);
        const uniq = new Set(last10);
        isStatic = uniq.size === 1 && last10[0] > 0;
        hasUnchanged = isStatic;
        avgConn = last10.reduce((a, b) => a + b, 0) / last10.length;
      } else if (timeline.length > 0) {
        const conns = timeline.map(e => e.connections || 0);
        hasUnchanged = new Set(conns).size === 1 && conns[0] > 0;
        avgConn = conns.reduce((a, b) => a + b, 0) / conns.length;
      }

      let status = 'healthy', reason = '';
      if (daysSince >= criteria.deadDays) { status = 'dead'; reason = `Нет активности ${daysSince} дней`; }
      else if (isStatic && daysSince >= criteria.staticConnectionsDays) { status = 'static'; reason = `Статичные подключения (${avgConn.toFixed(0)}) более ${criteria.staticConnectionsDays} дней`; }
      else if (avgConn > 0 && avgConn < criteria.lowActivityThreshold) { status = 'warning'; reason = `Низкая активность (среднее: ${avgConn.toFixed(1)})`;  }

      return { ...db, status, reason, daysSinceActivity: daysSince, avgConnections: avgConn, sizeGB: timeline.find(e => e.size_gb > 0)?.size_gb || 0, isStatic, hasUnchangedConnections: hasUnchanged, lastActivity };
    });
    return {
      all: analyzed,
      dead: analyzed.filter(d => d.status === 'dead'),
      static: analyzed.filter(d => d.status === 'static'),
      warning: analyzed.filter(d => d.status === 'warning'),
      healthy: analyzed.filter(d => d.status === 'healthy'),
      unchanged: analyzed.filter(d => d.hasUnchangedConnections),
    };
  }, [stats, criteria]);

  const dbAnalysis = analyzeDatabases();

  // --- Fetch ---
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [serversRes, statsRes] = await Promise.all([
        api.get('/servers'),
        api.get(`/server/${name}/stats`, { params: { start_date: startDate.toISOString(), end_date: endDate.toISOString() } }),
      ]);
      const server = serversRes.data.find(s => s.name === name);
      if (!server) throw new Error(`Сервер ${name} не найден`);
      if (isMounted.current) {
        setServerData(server);
        setStats(statsRes.data);
        setError(null);
      }
    } catch (err) {
      if (isMounted.current) setError(err.response?.data?.detail || err.message);
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, [name, startDate, endDate]);

  useEffect(() => {
    isMounted.current = true;
    const timer = setTimeout(fetchData, 500);
    return () => { isMounted.current = false; clearTimeout(timer); };
  }, [fetchData]);

  // --- Charts ---
  useEffect(() => {
    if (!stats || !connectionsCanvasRef.current || !sizeCanvasRef.current) return;
    connectionsChartRef.current?.destroy();
    sizeChartRef.current?.destroy();
    connectionsChartRef.current = null;
    sizeChartRef.current = null;

    const timeline = getAggregatedTimeline();
    const chartOpts = (title, yLabel) => ({
      responsive: true,
      plugins: { legend: { position: 'top' }, title: { display: true, text: title } },
      scales: {
        x: { type: 'time', time: { unit: 'day', tooltipFormat: 'dd.MM.yyyy HH:mm' }, title: { display: true, text: 'Дата и время' } },
        y: { type: 'linear', title: { display: true, text: yLabel } },
      },
      animation: false,
    });

    connectionsChartRef.current = new ChartJS(connectionsCanvasRef.current.getContext('2d'), {
      type: 'line',
      data: { datasets: [{ label: 'Общие подключения', data: timeline.map(d => ({ x: new Date(d.ts), y: d.connections })), fill: false, borderColor: 'rgba(75, 192, 192, 1)', tension: 0.1 }] },
      options: chartOpts(`Подключения к серверу ${name}`, 'Количество подключений'),
    });
    sizeChartRef.current = new ChartJS(sizeCanvasRef.current.getContext('2d'), {
      type: 'line',
      data: { datasets: [{ label: 'Общий размер (ГБ)', data: timeline.filter(d => d.size_gb > 0).map(d => ({ x: new Date(d.ts), y: d.size_gb })), fill: false, borderColor: 'rgba(153, 102, 255, 1)', tension: 0.1 }] },
      options: chartOpts(`Размер баз ${name}`, 'Размер (ГБ)'),
    });

    return () => { connectionsChartRef.current?.destroy(); sizeChartRef.current?.destroy(); };
  }, [stats, activeTab, name, getAggregatedTimeline]);

  // --- Sorting, filtering, pagination ---
  const handleSort = (col) => {
    setSortDirection(sortColumn === col && sortDirection === 'asc' ? 'desc' : 'asc');
    setSortColumn(col);
    setCurrentPage(1);
  };

  const setDateRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(start);
    setEndDate(end);
    setSelectedDateRange(days);
  };

  const filterByName = (dbName) => {
    const n = dbName.toLowerCase(), f = nameFilter.toLowerCase();
    if (nameFilterType === 'starts') return n.startsWith(f);
    if (nameFilterType === 'not_contains') return !n.includes(f);
    if (nameFilterType === 'ends') return n.endsWith(f);
    return n.includes(f);
  };

  // --- Criteria ---
  const handleCriteriaChange = (field, value) => {
    setCriteria(prev => ({ ...prev, [field]: parseInt(value) || 0 }));
    setCriteriaChanged(true);
  };
  const handleSaveCriteria = () => { saveCriteria(criteria); setCriteriaChanged(false); toast.success('Критерии сохранены'); };
  const handleResetCriteria = () => { setCriteria({ ...DEFAULT_CRITERIA }); saveCriteria({ ...DEFAULT_CRITERIA }); setCriteriaChanged(false); toast.success('Критерии сброшены'); };

  // --- Export ---
  const exportDatabases = () => {
    if (!dbAnalysis) return;
    let data = [], fileName = 'all_databases';
    if (showNoConnections) {
      data = filteredDatabases.filter(db => { const c = getDatabaseConnections(db.name); return c.length === 0 || c.every(v => v === 0); });
      fileName = 'no_connections_databases';
    } else if (showStaticConnections) {
      data = dbAnalysis.dead;
      fileName = 'inactive_databases';
    } else {
      data = filteredDatabases;
    }
    if (!data.length) { toast.error('Нет данных для экспорта'); return; }

    const csv = [
      ['База данных', 'Размер (ГБ)', 'Подключения', 'Дней без активности', 'Последняя активность', 'Дата создания', 'Статус'],
      ...data.map(db => {
        const conns = getDatabaseConnections(db.name);
        const analysis = dbAnalysis?.all.find(a => a.name === db.name);
        return [
          db.name, (getDatabaseSize(db.name) || 0).toFixed(2),
          conns.length > 0 ? conns[conns.length - 1] : 0,
          analysis?.daysSinceActivity === Infinity ? 'Никогда' : (analysis?.daysSinceActivity || 'N/A'),
          analysis?.lastActivity ? new Date(analysis.lastActivity).toLocaleDateString('ru-RU') : 'Никогда',
          db.creation_time ? new Date(db.creation_time).toLocaleDateString('ru-RU') : 'Неизвестно',
          db.exists ? 'Активна' : 'Удалена',
        ];
      })
    ].map(r => r.join(',')).join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}_${name}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // --- Sort icon ---
  const SortIcon = ({ col }) => {
    if (sortColumn !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-40" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />;
  };

  // --- Render ---
  if (error && !serverData) return <Alert variant="destructive"><AlertDescription>Ошибка: {error}</AlertDescription></Alert>;
  if (!serverData || !stats) return <ServerDetailsSkeleton />;

  const allDatabases = stats.databases;
  const filteredDatabases = allDatabases.filter(db => {
    const conns = getDatabaseConnections(db.name);
    const nameMatch = !nameFilter || filterByName(db.name);
    return nameMatch
      && (!hideDeleted || db.exists)
      && (!showNoConnections || (conns.length === 0 || conns.every(c => c === 0)))
      && (!showStaticConnections || (conns.length > 0 && conns.every(c => c === conns[0] && c > 0)))
      && (!showUnchangedConnections || hasUnchangedConnections(db.name));
  }).sort((a, b) => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    if (sortColumn === 'name') return dir * a.name.localeCompare(b.name);
    if (sortColumn === 'size') return dir * ((getDatabaseSize(a.name) || 0) - (getDatabaseSize(b.name) || 0));
    if (sortColumn === 'status') return dir * ((a.exists ? 1 : 0) - (b.exists ? 1 : 0));
    if (sortColumn === 'creation_time') return dir * ((a.creation_time ? new Date(a.creation_time).getTime() : 0) - (b.creation_time ? new Date(b.creation_time).getTime() : 0));
    return 0;
  });

  const totalFilteredSize = filteredDatabases.reduce((sum, db) => sum + (getDatabaseSize(db.name) || 0), 0);
  const totalPages = Math.ceil(filteredDatabases.length / ITEMS_PER_PAGE);
  const paginatedDatabases = filteredDatabases.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const freePercent = serverData.free_space && serverData.total_space
    ? (serverData.free_space / serverData.total_space * 100).toFixed(1) : 0;

  const getStatusBadge = (status) => {
    const map = { dead: ['destructive', 'Неактивна'], static: ['outline', 'Статичная'], warning: ['secondary', 'Низкая активность'], healthy: ['default', 'Активна'] };
    const [variant, label] = map[status] || ['secondary', status];
    return <Badge variant={variant}>{label}</Badge>;
  };

  const getAnalysisData = () => {
    if (!dbAnalysis) return [];
    const m = { all: dbAnalysis.all, dead: dbAnalysis.dead, warning: dbAnalysis.warning, static: dbAnalysis.static, healthy: dbAnalysis.healthy };
    return m[analysisFilter] || dbAnalysis.all;
  };

  const getTileColor = (status) => {
    const m = { dead: 'bg-red-100 border-red-300 dark:bg-red-950 dark:border-red-800', static: 'bg-blue-100 border-blue-300 dark:bg-blue-950 dark:border-blue-800', warning: 'bg-amber-100 border-amber-300 dark:bg-amber-950 dark:border-amber-800', healthy: 'bg-green-100 border-green-300 dark:bg-green-950 dark:border-green-800' };
    return m[status] || 'bg-muted border-border';
  };

  // Pagination helper
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Сервер: {name}</h1>
        <nav className="text-sm text-muted-foreground mt-1">
          <Link to="/" className="hover:text-foreground">Главная</Link>
          <span className="mx-1">/</span>
          <Link to="/" className="hover:text-foreground">Серверы</Link>
          <span className="mx-1">/</span>
          <span>{name}</span>
        </nav>
      </div>

      {/* Server info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">IP адрес</p>
            <div className="text-lg font-semibold">{serverData.host}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Версия PostgreSQL</p>
            <div className="text-lg font-semibold">{serverData.version || 'N/A'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Подключения</p>
            <div className="text-lg font-semibold">
              {serverData.connections ? `${serverData.connections.active || 0} / ${(serverData.connections.active || 0) + (serverData.connections.idle || 0)}` : 'N/A'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Свободно на диске</p>
            <div className={`text-lg font-semibold ${parseFloat(freePercent) < 10 ? 'text-destructive' : ''}`}>
              {serverData.free_space && serverData.total_space
                ? `${formatBytesGB(serverData.free_space)} / ${formatBytesGB(serverData.total_space)} (${freePercent}%)`
                : 'N/A'}
            </div>
          </CardContent>
        </Card>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {/* Date range picker */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Период:</span>
            {[{ d: 1, l: '24ч' }, { d: 7, l: '7д' }, { d: 30, l: '30д' }, { d: 90, l: '90д' }].map(({ d, l }) => (
              <Button key={d} variant={selectedDateRange === d ? 'default' : 'outline'} size="sm" onClick={() => setDateRange(d)} disabled={isLoading}>
                {l}
              </Button>
            ))}
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <DatePicker selected={startDate} onChange={d => { setStartDate(d); setSelectedDateRange(null); }} selectsStart startDate={startDate} endDate={endDate} className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm" dateFormat="dd.MM.yyyy" disabled={isLoading} />
              <span className="text-muted-foreground">—</span>
              <DatePicker selected={endDate} onChange={d => { setEndDate(d); setSelectedDateRange(null); }} selectsEnd startDate={startDate} endDate={endDate} minDate={startDate} className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm" dateFormat="dd.MM.yyyy" disabled={isLoading} />
            </div>
            {isLoading && (
              <div className="flex items-center gap-2 ml-auto text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Обновление...
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${isLoading ? 'opacity-50' : ''}`}>
        <Card>
          <CardHeader><CardTitle className="text-sm">Подключения к серверу</CardTitle></CardHeader>
          <CardContent><canvas ref={connectionsCanvasRef} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Размер баз данных</CardTitle></CardHeader>
          <CardContent><canvas ref={sizeCanvasRef} /></CardContent>
        </Card>
      </div>

      {/* Database filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Поиск:</span>
              <Select value={nameFilterType} onValueChange={setNameFilterType}>
                <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Содержит</SelectItem>
                  <SelectItem value="starts">Начинается с</SelectItem>
                  <SelectItem value="ends">Заканчивается на</SelectItem>
                  <SelectItem value="not_contains">Не содержит</SelectItem>
                </SelectContent>
              </Select>
              <Input className="w-44 h-8" placeholder="Имя базы..." value={nameFilter} onChange={e => { setNameFilter(e.target.value); setCurrentPage(1); }} />
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Показать:</span>
              <Select value={`${showNoConnections ? 'no-conn' : ''}${showStaticConnections ? 'static' : ''}` || 'all'} onValueChange={v => { setShowNoConnections(v === 'no-conn'); setShowStaticConnections(v === 'static'); setShowUnchangedConnections(false); setCurrentPage(1); }}>
                <SelectTrigger className="w-[200px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все базы</SelectItem>
                  <SelectItem value="no-conn">Только активные</SelectItem>
                  <SelectItem value="static">Неактивные {'>'} {criteria.deadDays} дней</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant={showNoConnections ? 'default' : 'outline'} size="sm" onClick={() => { setShowNoConnections(!showNoConnections); if (!showNoConnections) { setShowStaticConnections(false); setShowUnchangedConnections(false); } setCurrentPage(1); }}>
              Без подключений
            </Button>
            <Button variant={showUnchangedConnections ? 'default' : 'outline'} size="sm" onClick={() => { setShowUnchangedConnections(!showUnchangedConnections); if (!showUnchangedConnections) { setShowNoConnections(false); setShowStaticConnections(false); } setCurrentPage(1); }}>
              Статичные
            </Button>
            <Button variant="outline" size="sm" onClick={exportDatabases} className="ml-auto">
              <Download className="h-4 w-4 mr-1" />Экспорт
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filtered summary */}
      {filteredDatabases.length > 0 && (showNoConnections || showStaticConnections || showUnchangedConnections || nameFilter) && (
        <div className="flex items-center gap-4 px-4 py-2 bg-muted/50 rounded-lg text-sm">
          <span className="text-muted-foreground">Отфильтровано:</span>
          <span className="font-semibold">{filteredDatabases.length}</span>
          <Separator orientation="vertical" className="h-4" />
          <span className="text-muted-foreground">Суммарный размер:</span>
          <span className="font-semibold">{totalFilteredSize.toFixed(2)} ГБ</span>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-1"><Database className="h-4 w-4" />Обзор</TabsTrigger>
          <TabsTrigger value="analysis" className="gap-1">
            <Activity className="h-4 w-4" />Анализ
            {dbAnalysis && dbAnalysis.dead.length > 0 && (
              <Badge variant="destructive" className="ml-1 text-xs px-1.5">{dbAnalysis.dead.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1"><Settings className="h-4 w-4" />Критерии</TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Базы данных (всего: {allDatabases.length}, показано: {filteredDatabases.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>База данных <SortIcon col="name" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('size')}>Размер <SortIcon col="size" /></TableHead>
                    <TableHead>Подключения</TableHead>
                    <TableHead>Последняя активность</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('creation_time')}>Создана <SortIcon col="creation_time" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('status')}>Статус <SortIcon col="status" /></TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDatabases.map(db => {
                    const conns = getDatabaseConnections(db.name);
                    const isInactive = conns.length === 0 || conns.every(c => c === 0);
                    const isUnchanged = hasUnchangedConnections(db.name);
                    const lastAct = stats.connection_timeline?.filter(e => e.datname === db.name).slice(-1)[0]?.ts;

                    return (
                      <TableRow key={db.name} className={isInactive ? 'bg-amber-50 dark:bg-amber-950/20' : isUnchanged ? 'bg-blue-50 dark:bg-blue-950/20' : ''}>
                        <TableCell>
                          <Link to={`/server/${name}/db/${db.name}`} className="text-primary hover:underline font-medium">
                            {db.name}
                          </Link>
                        </TableCell>
                        <TableCell className="font-semibold">{formatSize(getDatabaseSize(db.name))}</TableCell>
                        <TableCell>
                          <span className={isInactive ? 'text-destructive' : isUnchanged ? 'text-amber-600' : 'text-green-600'}>
                            {conns.length > 0 ? conns[conns.length - 1] : 0}
                            {isUnchanged && <span className="text-xs ml-1">(стат.)</span>}
                          </span>
                        </TableCell>
                        <TableCell className={`text-sm ${isInactive ? 'text-destructive' : ''}`}>
                          {lastAct ? formatTimestamp(lastAct) : 'Никогда'}
                        </TableCell>
                        <TableCell className="text-sm">{formatCreationTime(db.creation_time)}</TableCell>
                        <TableCell>
                          <Badge variant={db.exists ? 'default' : 'destructive'}>
                            {db.exists ? 'Активна' : 'Удалена'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => navigate(`/server/${name}/db/${db.name}`)}>
                            Анализ
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious href="#" onClick={e => { e.preventDefault(); if (currentPage > 1) setCurrentPage(currentPage - 1); }} className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''} />
                  </PaginationItem>
                  {getPageNumbers().map(p => (
                    <PaginationItem key={p}>
                      <PaginationLink href="#" onClick={e => { e.preventDefault(); setCurrentPage(p); }} isActive={p === currentPage}>
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext href="#" onClick={e => { e.preventDefault(); if (currentPage < totalPages) setCurrentPage(currentPage + 1); }} className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </TabsContent>

        {/* Analysis tab */}
        <TabsContent value="analysis">
          {dbAnalysis && (
            <div className="space-y-6">
              {/* Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-red-200 dark:border-red-900">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-red-600">
                      <XCircle className="h-4 w-4" />
                      <span className="text-xs">Неактивные {'>'} {criteria.deadDays}д</span>
                    </div>
                    <div className="text-3xl font-bold text-red-600 mt-1">{dbAnalysis.dead.length}</div>
                    <p className="text-xs text-muted-foreground">{dbAnalysis.dead.reduce((s, d) => s + d.sizeGB, 0).toFixed(1)} ГБ</p>
                  </CardContent>
                </Card>
                <Card className="border-amber-200 dark:border-amber-900">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs">Низкая активность</span>
                    </div>
                    <div className="text-3xl font-bold text-amber-600 mt-1">{dbAnalysis.warning.length}</div>
                    <p className="text-xs text-muted-foreground">{'<'} {criteria.lowActivityThreshold} подключений</p>
                  </CardContent>
                </Card>
                <Card className="border-blue-200 dark:border-blue-900">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-blue-600">
                      <MinusCircle className="h-4 w-4" />
                      <span className="text-xs">Статичные</span>
                    </div>
                    <div className="text-3xl font-bold text-blue-600 mt-1">{dbAnalysis.static.length}</div>
                    <p className="text-xs text-muted-foreground">Без изменений {'>'} {criteria.staticConnectionsDays}д</p>
                  </CardContent>
                </Card>
                <Card className="border-green-200 dark:border-green-900">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-xs">Активные</span>
                    </div>
                    <div className="text-3xl font-bold text-green-600 mt-1">{dbAnalysis.healthy.length}</div>
                    <p className="text-xs text-muted-foreground">Используются регулярно</p>
                  </CardContent>
                </Card>
              </div>

              {/* Activity map */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <CardTitle className="text-sm">Карта активности баз данных</CardTitle>
                  <Select value={analysisFilter} onValueChange={setAnalysisFilter}>
                    <SelectTrigger className="w-[200px] h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все базы ({dbAnalysis.all.length})</SelectItem>
                      <SelectItem value="dead">Неактивные ({dbAnalysis.dead.length})</SelectItem>
                      <SelectItem value="warning">Низкая активность ({dbAnalysis.warning.length})</SelectItem>
                      <SelectItem value="static">Статичные ({dbAnalysis.static.length})</SelectItem>
                      <SelectItem value="healthy">Активные ({dbAnalysis.healthy.length})</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    {getAnalysisData().map(db => (
                      <div
                        key={db.name}
                        className={`p-2 rounded-md border cursor-pointer hover:shadow-md transition-shadow ${getTileColor(db.status)}`}
                        title={db.reason}
                        onClick={() => navigate(`/server/${name}/db/${db.name}`)}
                      >
                        <div className="text-xs font-medium truncate">{db.name}</div>
                        <div className="text-[10px] text-muted-foreground">{db.sizeGB.toFixed(1)} ГБ</div>
                        <div className="text-[10px] text-muted-foreground">
                          {db.daysSinceActivity === Infinity ? 'Никогда' : `${db.daysSinceActivity}д`}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Settings tab */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Критерии определения неактивных баз</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Считать базу неактивной если нет подключений (дней)</Label>
                <Input type="number" className="max-w-xs" value={criteria.deadDays} onChange={e => handleCriteriaChange('deadDays', e.target.value)} min="1" max="365" disabled={!canEditCriteria} />
                <p className="text-xs text-muted-foreground">Базы без подключений более указанного количества дней считаются неактивными</p>
              </div>
              <div className="space-y-2">
                <Label>Считать подключения статичными если нет изменений (дней)</Label>
                <Input type="number" className="max-w-xs" value={criteria.staticConnectionsDays} onChange={e => handleCriteriaChange('staticConnectionsDays', e.target.value)} min="1" max="90" disabled={!canEditCriteria} />
                <p className="text-xs text-muted-foreground">База с постоянным числом подключений без изменений</p>
              </div>
              <div className="space-y-2">
                <Label>Порог низкой активности (подключений)</Label>
                <Input type="number" className="max-w-xs" value={criteria.lowActivityThreshold} onChange={e => handleCriteriaChange('lowActivityThreshold', e.target.value)} min="1" max="20" disabled={!canEditCriteria} />
                <p className="text-xs text-muted-foreground">Среднее количество подключений для предупреждения о низкой активности</p>
              </div>

              {canEditCriteria ? (
                <div className="flex gap-2">
                  <Button onClick={handleSaveCriteria} disabled={!criteriaChanged}>Сохранить</Button>
                  <Button variant="outline" onClick={handleResetCriteria}>Сбросить по умолчанию</Button>
                </div>
              ) : (
                <Alert>
                  <AlertDescription>Только администраторы и операторы могут изменять критерии анализа</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ServerDetails;
