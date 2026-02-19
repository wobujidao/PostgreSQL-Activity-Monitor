import { useState, useEffect, useRef, useCallback } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, LineController, TimeScale, Filler, Title, Tooltip as ChartTooltip, Legend } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { chartOptions, makeDataset, CHART_COLORS, gradientPlugin, DATE_RANGES } from '@/lib/chart-config';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import PageHeader from './PageHeader';
import { formatTimestamp } from '@/lib/format';
import { DB_STATS_REFRESH_INTERVAL } from '@/lib/constants';
import LoadingSpinner from './LoadingSpinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, RefreshCw, Database, Activity, HardDrive, GitCommit } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, TimeScale, Filler, Title, ChartTooltip, Legend);

function DatabaseDetails() {
  const { name, db_name } = useParams();
  const navigate = useNavigate();
  const [dbStats, setDbStats] = useState(null);
  const [dbHistory, setDbHistory] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [startDate, setStartDate] = useState(new Date(Date.now() - 7 * 86400000));
  const [endDate, setEndDate] = useState(new Date());
  const [dateRangeLabel, setDateRangeLabel] = useState('7 дней');
  const connectionsChartRef = useRef(null);
  const sizeChartRef = useRef(null);
  const commitsChartRef = useRef(null);
  const connectionsCanvasRef = useRef(null);
  const sizeCanvasRef = useRef(null);
  const commitsCanvasRef = useRef(null);

  const fetchDbStats = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, historyRes] = await Promise.all([
        api.get(`/server/${name}/db/${db_name}`),
        api.get(`/server/${name}/db/${db_name}/stats`, {
          params: { start_date: startDate.toISOString(), end_date: endDate.toISOString() },
        }),
      ]);
      setDbStats(statsRes.data);
      setDbHistory(historyRes.data);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError('Ошибка загрузки: ' + (err.response?.data?.detail || err.message));
      setDbStats(null);
      setDbHistory(null);
    } finally {
      setLoading(false);
    }
  }, [name, db_name, startDate, endDate]);

  useEffect(() => {
    fetchDbStats();
    const interval = setInterval(fetchDbStats, DB_STATS_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchDbStats]);

  // Charts
  useEffect(() => {
    if (!dbHistory?.timeline || !connectionsCanvasRef.current || !sizeCanvasRef.current || !commitsCanvasRef.current) return;

    connectionsChartRef.current?.destroy();
    sizeChartRef.current?.destroy();
    commitsChartRef.current?.destroy();

    const rangeDays = Math.max(1, Math.round((endDate - startDate) / 86400000));

    connectionsChartRef.current = new ChartJS(connectionsCanvasRef.current.getContext('2d'), {
      type: 'line',
      data: { datasets: [makeDataset('Подключения', dbHistory.timeline.map(d => ({ x: new Date(d.ts), y: d.connections })), CHART_COLORS.connections)] },
      options: chartOptions('Количество', { days: rangeDays }),
      plugins: [gradientPlugin],
    });

    sizeChartRef.current = new ChartJS(sizeCanvasRef.current.getContext('2d'), {
      type: 'line',
      data: { datasets: [makeDataset('Размер (МБ)', dbHistory.timeline.map(d => ({ x: new Date(d.ts), y: d.size_mb })), CHART_COLORS.size)] },
      options: chartOptions('МБ', { days: rangeDays }),
      plugins: [gradientPlugin],
    });

    commitsChartRef.current = new ChartJS(commitsCanvasRef.current.getContext('2d'), {
      type: 'line',
      data: { datasets: [makeDataset('Коммиты', dbHistory.timeline.map(d => ({ x: new Date(d.ts), y: d.commits })), CHART_COLORS.commits)] },
      options: chartOptions('Транзакций', { days: rangeDays }),
      plugins: [gradientPlugin],
    });

    return () => {
      connectionsChartRef.current?.destroy();
      sizeChartRef.current?.destroy();
      commitsChartRef.current?.destroy();
    };
  }, [dbHistory, db_name, startDate, endDate]);

  const setDateRange = (days, label) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(start);
    setEndDate(end);
    setDateRangeLabel(label);
  };

  return (
    <div className="space-y-4">
      <PageHeader title={`База данных: ${db_name}`} breadcrumbs={[
        { label: 'Серверы', href: '/' },
        { label: name, href: `/server/${name}` },
        { label: db_name },
      ]} />

      {/* Info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <HardDrive className="h-4 w-4" />
              <span className="text-xs">Размер базы</span>
            </div>
            <div className="text-lg font-semibold">
              {dbStats?.size_mb ? `${(dbStats.size_mb / 1024).toFixed(1)} ГБ` : 'N/A'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Activity className="h-4 w-4" />
              <span className="text-xs">Подключения</span>
            </div>
            <div className="text-lg font-semibold">{dbStats?.connections ?? 'N/A'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <GitCommit className="h-4 w-4" />
              <span className="text-xs">Транзакций</span>
            </div>
            <div className="text-lg font-semibold">{dbHistory?.total_commits?.toLocaleString() ?? 'N/A'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Database className="h-4 w-4" />
              <span className="text-xs">Создана</span>
            </div>
            <div className="text-lg font-semibold">{dbHistory?.creation_time ? formatTimestamp(dbHistory.creation_time) : 'N/A'}</div>
          </CardContent>
        </Card>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {/* Date range + refresh */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Период:</span>
            <Select value={dateRangeLabel} onValueChange={(v) => {
              const days = DATE_RANGES[v];
              if (days) setDateRange(days, v);
            }}>
              <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(DATE_RANGES).map(label => (
                  <SelectItem key={label} value={label}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-3 ml-auto">
              {lastUpdated && (
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[hsl(var(--status-active))] animate-pulse" />
                  {lastUpdated.toLocaleTimeString('ru-RU')}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={fetchDbStats} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Обновить
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingSpinner text="Загрузка статистики базы..." subtext="Анализ данных" />
      ) : dbStats && dbHistory ? (
        <div className="space-y-4">
          {/* Stats table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Статистика базы данных</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground">Размер (МБ)</TableCell>
                    <TableCell>{dbStats.size_mb?.toFixed(2) ?? 'N/A'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground">Активные подключения</TableCell>
                    <TableCell>{dbStats.connections ?? 'N/A'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground">Выполненные коммиты</TableCell>
                    <TableCell>{dbStats.commits?.toLocaleString() ?? 'N/A'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground">Последнее обновление</TableCell>
                    <TableCell>{formatTimestamp(dbStats.last_update)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground">Время создания</TableCell>
                    <TableCell>{formatTimestamp(dbHistory.creation_time)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground">Всего подключений (период)</TableCell>
                    <TableCell>{dbHistory.total_connections?.toLocaleString() ?? 'N/A'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground">Макс. подключений</TableCell>
                    <TableCell>{dbHistory.max_connections ?? 'N/A'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground">Мин. подключений</TableCell>
                    <TableCell>{dbHistory.min_connections ?? 'N/A'}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Charts */}
          {dbHistory.timeline?.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Подключения</CardTitle></CardHeader>
                <CardContent><canvas ref={connectionsCanvasRef} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Размер базы</CardTitle></CardHeader>
                <CardContent><canvas ref={sizeCanvasRef} /></CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-sm">Коммиты</CardTitle></CardHeader>
                <CardContent><canvas ref={commitsCanvasRef} /></CardContent>
              </Card>
            </div>
          ) : (
            <Alert>
              <AlertDescription>Нет данных для отображения графиков за выбранный период</AlertDescription>
            </Alert>
          )}
        </div>
      ) : (
        <Alert><AlertDescription>Ожидание данных...</AlertDescription></Alert>
      )}
    </div>
  );
}

export default DatabaseDetails;
