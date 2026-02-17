import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { formatBytes, formatUptime } from '@/lib/format';
import { DEFAULT_SSH_PORT, DEFAULT_PG_PORT, DEFAULT_SSH_AUTH_TYPE } from '@/lib/constants';
import { useServers } from '@/hooks/use-servers';
import { isValidServerName, isValidHostname, isValidPort } from '@/lib/validation';
import ServerListSkeleton from './skeletons/ServerListSkeleton';
import EmptyState from './EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Plus, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Server, Loader2, KeyRound, Lock, Search, Filter, Settings,
} from 'lucide-react';
import { toast } from 'sonner';

const INITIAL_SERVER = {
  name: '', host: '', user: '', password: '', port: DEFAULT_PG_PORT,
  ssh_user: '', ssh_password: '', ssh_port: DEFAULT_SSH_PORT,
  ssh_auth_type: DEFAULT_SSH_AUTH_TYPE, ssh_key_id: '', ssh_key_passphrase: '', stats_db: '',
};

function ServerList() {
  const navigate = useNavigate();
  const { servers, loading, timeLeft, refreshInterval, setRefreshInterval, setPaused, refresh } = useServers();
  const [sshKeys, setSSHKeys] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newServer, setNewServer] = useState(INITIAL_SERVER);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [testingSSH, setTestingSSH] = useState(false);
  const [sshTestResult, setSSHTestResult] = useState(null);

  useEffect(() => {
    setPaused(showAddModal);
  }, [showAddModal, setPaused]);

  useEffect(() => {
    api.get('/ssh-keys').then(res => setSSHKeys(res.data)).catch(() => {});
  }, []);

  const handleSaveAdd = async () => {
    try {
      const response = await api.post('/servers', newServer);
      if (response.data.status !== "ok" && response.data.status !== undefined) {
        setErrorMessage(`Ошибка: ${response.data.status}`);
      } else {
        setNewServer(INITIAL_SERVER);
        setShowAddModal(false);
        setSSHTestResult(null);
        toast.success('Сервер добавлен');
        refresh();
      }
    } catch (error) {
      setErrorMessage('Ошибка при добавлении: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleTestSSH = async (server) => {
    setTestingSSH(true);
    setSSHTestResult(null);
    try {
      const response = await api.post(`/servers/${server.name}/test-ssh`);
      setSSHTestResult(response.data);
    } catch (error) {
      setSSHTestResult({ success: false, message: error.response?.data?.detail || error.message });
    } finally {
      setTestingSSH(false);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getServerStatus = (server) => {
    if (!server.status || server.status === 'failed' || server.status.includes?.('error')) {
      return { variant: 'destructive', text: 'Недоступен', tooltip: 'Не удается подключиться к серверу' };
    }
    if (server.status === 'ok' || server.status.includes?.('ok')) {
      const total = (server.connections?.active || 0) + (server.connections?.idle || 0);
      if (total > 50) return { variant: 'warning', text: 'Нагрузка', tooltip: `Высокая нагрузка: ${total} соединений` };
      return { variant: 'success', text: 'Активен', tooltip: `Работает нормально. Соединений: ${total}` };
    }
    return { variant: 'secondary', text: 'Неизвестно', tooltip: 'Статус неизвестен' };
  };

  const getDiskInfo = (freeSpace, totalSpace) => {
    if (!freeSpace || !totalSpace) return { percent: 0, color: 'bg-red-500' };
    const usedPercent = ((totalSpace - freeSpace) / totalSpace) * 100;
    const color = usedPercent < 70 ? 'bg-green-500' : usedPercent < 85 ? 'bg-amber-500' : 'bg-red-500';
    return { percent: usedPercent, color };
  };

  const getSortValue = (server, field) => {
    switch (field) {
      case 'name': return server.name || '';
      case 'host': return server.host || '';
      case 'version': return server.version || '';
      case 'connections': return (server.connections?.active || 0) + (server.connections?.idle || 0);
      case 'free_space': return server.free_space || 0;
      case 'uptime': return server.uptime_hours || 0;
      case 'status': return getServerStatus(server).text;
      default: return '';
    }
  };

  const filteredServers = servers
    .filter(server => {
      const matchesSearch = server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           server.host.toLowerCase().includes(searchTerm.toLowerCase());
      if (statusFilter === 'all') return matchesSearch;
      if (statusFilter === 'online') return matchesSearch && getServerStatus(server).variant === 'success';
      if (statusFilter === 'error') return matchesSearch && getServerStatus(server).variant === 'destructive';
      return matchesSearch;
    })
    .sort((a, b) => {
      const aVal = getSortValue(a, sortField);
      const bVal = getSortValue(b, sortField);
      const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal;
      return sortDirection === 'asc' ? cmp : -cmp;
    });

  const SortHeader = ({ field, children }) => {
    const active = sortField === field;
    const Icon = active ? (sortDirection === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort(field)}>
        <div className="flex items-center gap-1">
          {children}
          <Icon className={`h-3 w-3 ${active ? 'text-foreground' : 'text-muted-foreground'}`} />
        </div>
      </TableHead>
    );
  };

  if (loading) {
    return <ServerListSkeleton />;
  }

  const onlineCount = servers.filter(s => getServerStatus(s).variant === 'success').length;
  const errorCount = servers.filter(s => getServerStatus(s).variant === 'destructive').length;
  const warningCount = servers.filter(s => getServerStatus(s).variant === 'warning').length;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все серверы</SelectItem>
                  <SelectItem value="online">Активные</SelectItem>
                  <SelectItem value="error">С ошибками</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по имени или IP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <Select value={String(refreshInterval)} onValueChange={(v) => setRefreshInterval(Number(v))}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5000">5 сек</SelectItem>
                  <SelectItem value="10000">10 сек</SelectItem>
                  <SelectItem value="15000">15 сек</SelectItem>
                  <SelectItem value="30000">30 сек</SelectItem>
                  <SelectItem value="60000">1 мин</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${timeLeft <= 3 ? 'bg-amber-500 animate-pulse' : 'bg-green-500 animate-pulse'}`} />
                <span className="text-xs text-muted-foreground tabular-nums">{timeLeft}с</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Server table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Серверы PostgreSQL
          </CardTitle>
          <Button size="sm" onClick={() => { setErrorMessage(''); setShowAddModal(true); setSSHTestResult(null); }}>
            <Plus className="h-4 w-4 mr-1" />
            Добавить
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {errorMessage && (
            <Alert variant="destructive" className="mx-6 mb-4">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader field="name">Сервер</SortHeader>
                  <SortHeader field="host">IP адрес</SortHeader>
                  <SortHeader field="version">Версия PG</SortHeader>
                  <SortHeader field="connections">Соединения</SortHeader>
                  <SortHeader field="free_space">Диск</SortHeader>
                  <SortHeader field="uptime">Uptime</SortHeader>
                  <SortHeader field="status">Статус</SortHeader>
                  <TableHead>SSH</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredServers.map(server => {
                  const status = getServerStatus(server);
                  const disk = getDiskInfo(server.free_space, server.total_space);
                  const freePercent = disk.percent ? (100 - disk.percent).toFixed(1) : 0;

                  return (
                    <TableRow key={server.name}>
                      <TableCell className="font-medium">
                        <Link to={`/server/${server.name}`} className="text-primary hover:underline">
                          {server.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{server.host}</code>
                      </TableCell>
                      <TableCell className="text-sm">{server.version || '—'}</TableCell>
                      <TableCell className="text-sm">
                        {server.connections ? (
                          <span>
                            <span className="text-green-600 dark:text-green-400 font-medium">{server.connections.active || 0}</span>
                            {' / '}
                            <span className="text-muted-foreground">{server.connections.idle || 0}</span>
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {server.total_space ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="space-y-1 min-w-[140px]">
                                <div className="text-xs">
                                  <span className={disk.percent > 85 ? 'text-red-600 dark:text-red-400 font-medium' : disk.percent > 70 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-green-600 dark:text-green-400 font-medium'}>
                                    {formatBytes(server.free_space)}
                                  </span>
                                  <span className="text-muted-foreground"> / {formatBytes(server.total_space)}</span>
                                </div>
                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${disk.color}`} style={{ width: `${disk.percent}%` }} />
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              Использовано: {disk.percent.toFixed(1)}% ({formatBytes(server.total_space - server.free_space)})
                            </TooltipContent>
                          </Tooltip>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatUptime(server.uptime_hours)}</TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant={status.variant}>
                              {status.text}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>{status.tooltip}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm">
                              {server.ssh_auth_type === 'key' ? <KeyRound className="h-4 w-4 inline" /> : <Lock className="h-4 w-4 inline" />}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {server.ssh_auth_type === 'key' && server.ssh_key_info
                              ? `Ключ: ${server.ssh_key_info.name}`
                              : 'Пароль'}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => navigate(`/server/${server.name}/edit`)}>
                          <Settings className="h-3 w-3 mr-1" />
                          Управление
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredServers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      {searchTerm || statusFilter !== 'all' ? (
                        <EmptyState icon={Search} title="Серверы не найдены" description="Попробуйте изменить условия поиска" />
                      ) : (
                        <EmptyState icon={Server} title="Нет добавленных серверов" description="Добавьте первый сервер для мониторинга" actionLabel="Добавить сервер" onAction={() => { setErrorMessage(''); setShowAddModal(true); }} />
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {filteredServers.length > 0 && (
            <div className="flex items-center gap-3 px-6 py-3 border-t text-sm text-muted-foreground">
              <span>Итого: {filteredServers.length} из {servers.length}</span>
              <Separator orientation="vertical" className="h-4" />
              <Badge variant="success" className="text-xs">{onlineCount} активных</Badge>
              {errorCount > 0 && <Badge variant="destructive" className="text-xs">{errorCount} с ошибками</Badge>}
              {warningCount > 0 && <Badge variant="warning" className="text-xs">{warningCount} нагрузка</Badge>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add server dialog */}
      <Dialog open={showAddModal} onOpenChange={(open) => { if (!open) { setShowAddModal(false); setSSHTestResult(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Добавить сервер</DialogTitle>
            <DialogDescription>Укажите параметры подключения к PostgreSQL и SSH</DialogDescription>
          </DialogHeader>
          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Название *</Label>
                <Input value={newServer.name} onChange={(e) => setNewServer({ ...newServer, name: e.target.value })} />
                {newServer.name && !isValidServerName(newServer.name) && (
                  <p className="text-xs text-destructive">Только буквы, цифры, дефис и подчёркивание</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Хост *</Label>
                <Input value={newServer.host} onChange={(e) => setNewServer({ ...newServer, host: e.target.value })} />
                {newServer.host && !isValidHostname(newServer.host) && (
                  <p className="text-xs text-destructive">Некорректный IP-адрес или hostname</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>База для статистики</Label>
              <Input value={newServer.stats_db} onChange={(e) => setNewServer({ ...newServer, stats_db: e.target.value })} placeholder="stats_db (опционально)" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Пользователь PG *</Label>
                <Input value={newServer.user} onChange={(e) => setNewServer({ ...newServer, user: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Пароль PG *</Label>
                <Input type="password" value={newServer.password} onChange={(e) => setNewServer({ ...newServer, password: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Порт PG</Label>
              <Input type="number" value={newServer.port} onChange={(e) => setNewServer({ ...newServer, port: parseInt(e.target.value) })} className="w-32" />
              {newServer.port && !isValidPort(newServer.port) && (
                <p className="text-xs text-destructive">Порт: 1-65535</p>
              )}
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Пользователь SSH</Label>
                <Input value={newServer.ssh_user} onChange={(e) => setNewServer({ ...newServer, ssh_user: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Порт SSH</Label>
                <Input type="number" value={newServer.ssh_port} onChange={(e) => setNewServer({ ...newServer, ssh_port: parseInt(e.target.value) })} className="w-32" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>SSH Аутентификация</Label>
              <RadioGroup value={newServer.ssh_auth_type} onValueChange={(v) => setNewServer({ ...newServer, ssh_auth_type: v })} className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="password" id="ssh-password" />
                  <Label htmlFor="ssh-password" className="font-normal">По паролю</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="key" id="ssh-key" />
                  <Label htmlFor="ssh-key" className="font-normal">По SSH-ключу</Label>
                </div>
              </RadioGroup>
            </div>

            {newServer.ssh_auth_type === 'password' ? (
              <div className="space-y-2">
                <Label>Пароль SSH</Label>
                <Input type="password" value={newServer.ssh_password} onChange={(e) => setNewServer({ ...newServer, ssh_password: e.target.value })} />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>SSH-ключ</Label>
                  <Select value={newServer.ssh_key_id || ''} onValueChange={(v) => setNewServer({ ...newServer, ssh_key_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите ключ..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sshKeys.map(key => (
                        <SelectItem key={key.id} value={key.id}>
                          {key.name} ({key.key_type.toUpperCase()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {sshKeys.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Нет доступных ключей. <Link to="/ssh-keys" className="text-primary">Управление ключами</Link>
                    </p>
                  )}
                </div>
                {newServer.ssh_key_id && sshKeys.find(k => k.id === newServer.ssh_key_id)?.has_passphrase && (
                  <div className="space-y-2">
                    <Label>Пароль от ключа</Label>
                    <Input type="password" value={newServer.ssh_key_passphrase} onChange={(e) => setNewServer({ ...newServer, ssh_key_passphrase: e.target.value })} />
                  </div>
                )}
              </div>
            )}

            {newServer.name && (
              <div className="space-y-2">
                <Button variant="outline" size="sm" onClick={() => handleTestSSH(newServer)} disabled={testingSSH}>
                  {testingSSH ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  Тест SSH
                </Button>
                {sshTestResult && (
                  <Alert variant={sshTestResult.success ? 'default' : 'destructive'} className="mt-2">
                    <AlertDescription>{sshTestResult.success ? '✅ ' : '❌ '}{sshTestResult.message}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddModal(false); setSSHTestResult(null); }}>
              Отмена
            </Button>
            <Button onClick={handleSaveAdd} disabled={
              !newServer.name || !isValidServerName(newServer.name) ||
              !newServer.host || !isValidHostname(newServer.host) ||
              !newServer.user || !newServer.password ||
              !isValidPort(newServer.port)
            }>
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ServerList;
