import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { formatBytes, formatUptime } from '@/lib/format';
import { DEFAULT_SSH_PORT, DEFAULT_PG_PORT, DEFAULT_SSH_AUTH_TYPE } from '@/lib/constants';
import { useServers } from '@/hooks/use-servers';
import { isValidServerName, isValidHostname, isValidPort } from '@/lib/validation';
import ServerListSkeleton from './skeletons/ServerListSkeleton';
import EmptyState from './EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Plus, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Server, Loader2, KeyRound, Lock, Search, Settings,
} from 'lucide-react';
import { toast } from 'sonner';

const INITIAL_SERVER = {
  name: '', host: '', user: '', password: '', port: DEFAULT_PG_PORT,
  ssh_user: '', ssh_password: '', ssh_port: DEFAULT_SSH_PORT,
  ssh_auth_type: DEFAULT_SSH_AUTH_TYPE, ssh_key_id: '', ssh_key_passphrase: '',
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

  useEffect(() => { setPaused(showAddModal); }, [showAddModal, setPaused]);
  useEffect(() => { api.get('/ssh-keys').then(res => setSSHKeys(res.data)).catch(() => {}); }, []);

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
    if (!freeSpace || !totalSpace) return { percent: 0, color: 'bg-status-danger' };
    const usedPercent = ((totalSpace - freeSpace) / totalSpace) * 100;
    const color = usedPercent < 70 ? 'bg-status-active' : usedPercent < 85 ? 'bg-status-warning' : 'bg-status-danger';
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
      <TableHead className="cursor-pointer select-none hover:bg-muted/50 text-xs h-8" onClick={() => handleSort(field)}>
        <div className="flex items-center gap-1">
          {children}
          <Icon className={`h-2.5 w-2.5 ${active ? 'text-foreground' : 'text-muted-foreground'}`} />
        </div>
      </TableHead>
    );
  };

  if (loading) return <ServerListSkeleton />;

  const onlineCount = servers.filter(s => getServerStatus(s).variant === 'success').length;
  const errorCount = servers.filter(s => getServerStatus(s).variant === 'destructive').length;
  const warningCount = servers.filter(s => getServerStatus(s).variant === 'warning').length;

  return (
    <div className="space-y-3">
      {/* Фильтры + поиск + обновление — одна строка */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-7 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все ({servers.length})</SelectItem>
            <SelectItem value="online">Активные ({onlineCount})</SelectItem>
            <SelectItem value="error">Ошибки ({errorCount})</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Поиск..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-7 h-7 text-sm"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${timeLeft <= 3 ? 'bg-status-warning animate-pulse' : 'bg-status-active animate-pulse'}`} />
            <span className="text-[11px] text-muted-foreground tabular-nums">{timeLeft}с</span>
          </div>
          <Select value={String(refreshInterval)} onValueChange={(v) => setRefreshInterval(Number(v))}>
            <SelectTrigger className="w-20 h-7 text-xs">
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
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => window.location.reload()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={() => { setErrorMessage(''); setShowAddModal(true); setSSHTestResult(null); }}>
            <Plus className="h-3 w-3 mr-1" />Добавить
          </Button>
        </div>
      </div>

      {errorMessage && (
        <Alert variant="destructive"><AlertDescription>{errorMessage}</AlertDescription></Alert>
      )}

      {/* Таблица серверов */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader field="name">Сервер</SortHeader>
                  <SortHeader field="host">IP</SortHeader>
                  <SortHeader field="version">PG</SortHeader>
                  <SortHeader field="connections">Соед.</SortHeader>
                  <SortHeader field="free_space">Диск</SortHeader>
                  <SortHeader field="uptime">Uptime</SortHeader>
                  <SortHeader field="status">Статус</SortHeader>
                  <TableHead className="text-xs h-8">SSH</TableHead>
                  <TableHead className="text-xs h-8 w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredServers.map(server => {
                  const status = getServerStatus(server);
                  const disk = getDiskInfo(server.free_space, server.total_space);

                  return (
                    <TableRow key={server.name}>
                      <TableCell className="py-1.5">
                        <Link to={`/server/${server.name}`} className="text-sm font-medium text-primary hover:underline">
                          {server.name}
                        </Link>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{server.host}</code>
                      </TableCell>
                      <TableCell className="text-xs py-1.5">{server.version || '—'}</TableCell>
                      <TableCell className="text-xs py-1.5 tabular-nums">
                        {server.connections ? (
                          <>
                            <span className="text-status-active font-medium">{server.connections.active || 0}</span>
                            <span className="text-muted-foreground">/{server.connections.idle || 0}</span>
                          </>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="py-1.5">
                        {server.total_space ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="min-w-[100px]">
                                <div className="text-[11px]">
                                  <span className={disk.percent > 85 ? 'text-status-danger font-medium' : disk.percent > 70 ? 'text-status-warning font-medium' : 'text-status-active font-medium'}>
                                    {formatBytes(server.free_space)}
                                  </span>
                                  <span className="text-muted-foreground">/{formatBytes(server.total_space)}</span>
                                </div>
                                <div className="h-1 w-full bg-muted rounded-full overflow-hidden mt-0.5">
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
                      <TableCell className="text-xs text-muted-foreground py-1.5">{formatUptime(server.uptime_hours)}</TableCell>
                      <TableCell className="py-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant={status.variant} className="text-[11px] px-1.5 py-0">{status.text}</Badge>
                          </TooltipTrigger>
                          <TooltipContent>{status.tooltip}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{server.ssh_auth_type === 'key' ? <KeyRound className="h-3 w-3" /> : <Lock className="h-3 w-3" />}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {server.ssh_auth_type === 'key' && server.ssh_key_info ? `Ключ: ${server.ssh_key_info.name}` : 'Пароль'}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => navigate(`/server/${server.name}/edit`)}>
                          <Settings className="h-3 w-3 mr-1" />Управление
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
                        <EmptyState icon={Server} title="Нет добавленных серверов" description="Добавьте первый сервер" actionLabel="Добавить сервер" onAction={() => { setErrorMessage(''); setShowAddModal(true); }} />
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {filteredServers.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 border-t text-xs text-muted-foreground">
              <span>{filteredServers.length} из {servers.length}</span>
              <Separator orientation="vertical" className="h-3" />
              <Badge variant="success" className="text-[10px] px-1 py-0">{onlineCount}</Badge>
              {errorCount > 0 && <Badge variant="destructive" className="text-[10px] px-1 py-0">{errorCount}</Badge>}
              {warningCount > 0 && <Badge variant="warning" className="text-[10px] px-1 py-0">{warningCount}</Badge>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Диалог добавления сервера */}
      <Dialog open={showAddModal} onOpenChange={(open) => { if (!open) { setShowAddModal(false); setSSHTestResult(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Добавить сервер</DialogTitle>
          </DialogHeader>
          {errorMessage && (
            <Alert variant="destructive"><AlertDescription>{errorMessage}</AlertDescription></Alert>
          )}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Название *</Label>
                <Input value={newServer.name} onChange={(e) => setNewServer({ ...newServer, name: e.target.value })} className="h-8 text-sm" />
                {newServer.name && !isValidServerName(newServer.name) && (
                  <p className="text-[11px] text-destructive">Буквы, цифры, дефис, _</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Хост *</Label>
                <Input value={newServer.host} onChange={(e) => setNewServer({ ...newServer, host: e.target.value })} className="h-8 text-sm" />
                {newServer.host && !isValidHostname(newServer.host) && (
                  <p className="text-[11px] text-destructive">Некорректный адрес</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-5 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Пользователь PG *</Label>
                <Input value={newServer.user} onChange={(e) => setNewServer({ ...newServer, user: e.target.value })} className="h-8 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Пароль PG *</Label>
                <Input type="password" value={newServer.password} onChange={(e) => setNewServer({ ...newServer, password: e.target.value })} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Порт</Label>
                <Input type="number" value={newServer.port} onChange={(e) => setNewServer({ ...newServer, port: parseInt(e.target.value) })} className="h-8 text-sm" />
              </div>
            </div>

            <Separator className="my-1" />

            <div className="grid grid-cols-5 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Пользователь SSH</Label>
                <Input value={newServer.ssh_user} onChange={(e) => setNewServer({ ...newServer, ssh_user: e.target.value })} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Порт SSH</Label>
                <Input type="number" value={newServer.ssh_port} onChange={(e) => setNewServer({ ...newServer, ssh_port: parseInt(e.target.value) })} className="h-8 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Аутентификация</Label>
                <RadioGroup value={newServer.ssh_auth_type} onValueChange={(v) => setNewServer({ ...newServer, ssh_auth_type: v })} className="flex gap-3 h-8 items-center">
                  <div className="flex items-center space-x-1"><RadioGroupItem value="password" id="ssh-pw" /><Label htmlFor="ssh-pw" className="text-xs font-normal cursor-pointer">Пароль</Label></div>
                  <div className="flex items-center space-x-1"><RadioGroupItem value="key" id="ssh-k" /><Label htmlFor="ssh-k" className="text-xs font-normal cursor-pointer">Ключ</Label></div>
                </RadioGroup>
              </div>
            </div>

            {newServer.ssh_auth_type === 'password' ? (
              <div className="space-y-1">
                <Label className="text-xs">Пароль SSH</Label>
                <Input type="password" value={newServer.ssh_password} onChange={(e) => setNewServer({ ...newServer, ssh_password: e.target.value })} className="h-8 text-sm" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">SSH-ключ</Label>
                  <Select value={newServer.ssh_key_id || ''} onValueChange={(v) => setNewServer({ ...newServer, ssh_key_id: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Выберите..." /></SelectTrigger>
                    <SelectContent>
                      {sshKeys.map(key => (
                        <SelectItem key={key.id} value={key.id}>{key.name} ({key.key_type.toUpperCase()})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {sshKeys.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">Нет ключей. <Link to="/ssh-keys" className="text-primary">Создать</Link></p>
                  )}
                </div>
                {newServer.ssh_key_id && sshKeys.find(k => k.id === newServer.ssh_key_id)?.has_passphrase && (
                  <div className="space-y-1">
                    <Label className="text-xs">Пароль от ключа</Label>
                    <Input type="password" value={newServer.ssh_key_passphrase} onChange={(e) => setNewServer({ ...newServer, ssh_key_passphrase: e.target.value })} className="h-8 text-sm" />
                  </div>
                )}
              </div>
            )}

            {newServer.name && (
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleTestSSH(newServer)} disabled={testingSSH}>
                  {testingSSH ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}Тест SSH
                </Button>
                {sshTestResult && (
                  <span className={`text-xs ${sshTestResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                    {sshTestResult.message}
                  </span>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowAddModal(false); setSSHTestResult(null); }}>Отмена</Button>
            <Button size="sm" onClick={handleSaveAdd} disabled={
              !newServer.name || !isValidServerName(newServer.name) ||
              !newServer.host || !isValidHostname(newServer.host) ||
              !newServer.user || !newServer.password ||
              !isValidPort(newServer.port)
            }>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ServerList;
