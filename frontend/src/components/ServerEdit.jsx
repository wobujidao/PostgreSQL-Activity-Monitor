import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { formatBytesGB } from '@/lib/format';
import LoadingSpinner from './LoadingSpinner';
import PageHeader from './PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { isValidHostname, isValidPort } from '@/lib/validation';
import { Save, ArrowLeft, Trash2, Loader2, Database, Terminal, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

function ServerEdit() {
  const { serverName } = useParams();
  const navigate = useNavigate();
  const [server, setServer] = useState(null);
  const [sshKeys, setSSHKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testingSSH, setTestingSSH] = useState(false);
  const [sshTestResult, setSSHTestResult] = useState(null);
  const [testingPG, setTestingPG] = useState(false);
  const [pgTestResult, setPGTestResult] = useState(null);
  const initialServerRef = useRef(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingNavigate, setPendingNavigate] = useState(null);

  const checkDirty = useCallback((current) => {
    if (!initialServerRef.current || !current) return false;
    const init = initialServerRef.current;
    return ['host', 'port', 'user', 'password', 'ssh_user', 'ssh_port', 'ssh_password', 'ssh_auth_type', 'ssh_key_id', 'ssh_key_passphrase']
      .some(k => String(current[k] ?? '') !== String(init[k] ?? ''));
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [serversRes, keysRes] = await Promise.all([api.get('/servers'), api.get('/ssh-keys')]);
        const s = serversRes.data.find(s => s.name === serverName);
        if (!s) throw new Error('Сервер не найден');
        const initial = { ...s, password: '', ssh_password: '', ssh_auth_type: s.ssh_auth_type || 'password', ssh_key_id: s.ssh_key_id || '', ssh_key_passphrase: '' };
        setServer(initial);
        initialServerRef.current = { ...initial };
        setSSHKeys(keysRes.data);
      } catch (err) {
        setError(err.message || 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [serverName]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/servers/${serverName}`, server);
      setIsDirty(false);
      toast.success('Изменения сохранены');
      setTimeout(() => navigate('/'), 1000);
    } catch (err) {
      setError('Ошибка сохранения: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/servers/${serverName}`);
      toast.success('Сервер удалён');
      navigate('/');
    } catch (err) {
      setError('Ошибка удаления: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleTestPG = async () => {
    setTestingPG(true);
    setPGTestResult(null);
    try {
      const res = await api.post(`/servers/${serverName}/test-pg`);
      setPGTestResult(res.data);
    } catch (err) {
      setPGTestResult({ success: false, message: err.response?.data?.detail || err.message });
    } finally {
      setTestingPG(false);
    }
  };

  const handleTestSSH = async () => {
    setTestingSSH(true);
    setSSHTestResult(null);
    try {
      const res = await api.post(`/servers/${serverName}/test-ssh`);
      setSSHTestResult(res.data);
    } catch (err) {
      setSSHTestResult({ success: false, message: err.response?.data?.detail || err.message });
    } finally {
      setTestingSSH(false);
    }
  };

  const update = (field, value) => {
    setServer(prev => {
      const next = { ...prev, [field]: value };
      setIsDirty(checkDirty(next));
      return next;
    });
  };

  const goBack = () => {
    if (isDirty) {
      setPendingNavigate('/');
      setShowLeaveDialog(true);
    } else {
      navigate('/');
    }
  };

  if (loading) return <LoadingSpinner text="Загрузка данных сервера..." />;

  if (!server) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Сервер не найден.{' '}
          <Button variant="link" className="p-0 h-auto" onClick={() => navigate('/')}>Вернуться к списку</Button>
        </AlertDescription>
      </Alert>
    );
  }

  const selectedKey = server.ssh_key_id ? sshKeys.find(k => k.id === server.ssh_key_id) : null;

  return (
    <div className="space-y-3 max-w-2xl">
      <PageHeader title="Редактирование сервера" breadcrumbs={[
        { label: 'Серверы', href: '/' },
        { label: serverName },
      ]} />

      {/* Инфо-полоска + действия */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <Badge variant={server.status === 'ok' ? 'success' : 'destructive'}>
            {server.status === 'ok' ? 'Активен' : 'Недоступен'}
          </Badge>
          {server.version && <span className="text-muted-foreground">PG {server.version}</span>}
          {server.uptime_hours != null && <span className="text-muted-foreground">{Math.floor(server.uptime_hours / 24)}д uptime</span>}
          {server.free_space && server.total_space && (
            <span className="text-muted-foreground">{formatBytesGB(server.free_space)}/{formatBytesGB(server.total_space)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={goBack}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />Назад
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Сохранить
            {isDirty && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-status-warning inline-block" />}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить сервер?</AlertDialogTitle>
                <AlertDialogDescription>
                  Вы уверены что хотите удалить <strong>{serverName}</strong>? Это действие нельзя отменить.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Удалить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Основная карточка с табами */}
      <Card>
        <Tabs defaultValue="pg">
          <div className="px-4 pt-3">
            <TabsList>
              <TabsTrigger value="pg"><Database className="h-3.5 w-3.5 mr-1.5" />PostgreSQL</TabsTrigger>
              <TabsTrigger value="ssh"><Terminal className="h-3.5 w-3.5 mr-1.5" />SSH</TabsTrigger>
            </TabsList>
          </div>

          <CardContent className="pt-4 pb-4">
            {/* Вкладка PostgreSQL */}
            <TabsContent value="pg" className="mt-0 space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-4 space-y-1">
                  <Label className="text-xs">Сервер</Label>
                  <Input value={server.name} disabled className="h-8 text-sm bg-muted" />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">Хост</Label>
                  <Input value={server.host} onChange={(e) => update('host', e.target.value)} placeholder="192.168.1.100" className="h-8 text-sm" />
                  {server.host && !isValidHostname(server.host) && (
                    <p className="text-[11px] text-destructive">Некорректный адрес</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Порт</Label>
                  <Input type="number" value={server.port} onChange={(e) => update('port', parseInt(e.target.value))} className="h-8 text-sm" />
                  {server.port && !isValidPort(server.port) && (
                    <p className="text-[11px] text-destructive">1-65535</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Пользователь</Label>
                  <Input value={server.user} onChange={(e) => update('user', e.target.value)} placeholder="postgres" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Пароль</Label>
                  <Input type="password" value={server.password} onChange={(e) => update('password', e.target.value)} placeholder="Не меняется если пусто" autoComplete="new-password" className="h-8 text-sm" />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <Button variant="outline" size="sm" onClick={handleTestPG} disabled={testingPG} className="h-7 text-xs">
                  {testingPG ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                  Тест PostgreSQL
                </Button>
                {pgTestResult && (
                  <span className={`text-xs ${pgTestResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                    {pgTestResult.message}
                  </span>
                )}
              </div>
            </TabsContent>

            {/* Вкладка SSH */}
            <TabsContent value="ssh" className="mt-0 space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">Пользователь SSH</Label>
                  <Input value={server.ssh_user} onChange={(e) => update('ssh_user', e.target.value)} placeholder="root" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Порт</Label>
                  <Input type="number" value={server.ssh_port} onChange={(e) => update('ssh_port', parseInt(e.target.value))} className="h-8 text-sm" />
                  {server.ssh_port && !isValidPort(server.ssh_port) && (
                    <p className="text-[11px] text-destructive">1-65535</p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Аутентификация</Label>
                <RadioGroup value={server.ssh_auth_type} onValueChange={(v) => update('ssh_auth_type', v)} className="flex gap-4">
                  <div className="flex items-center space-x-1.5">
                    <RadioGroupItem value="password" id="edit-ssh-pw" />
                    <Label htmlFor="edit-ssh-pw" className="text-sm font-normal cursor-pointer">Пароль</Label>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <RadioGroupItem value="key" id="edit-ssh-key" />
                    <Label htmlFor="edit-ssh-key" className="text-sm font-normal cursor-pointer">SSH-ключ</Label>
                  </div>
                </RadioGroup>
              </div>

              {server.ssh_auth_type === 'password' ? (
                <div className="space-y-1">
                  <Label className="text-xs">Пароль SSH</Label>
                  <Input type="password" value={server.ssh_password} onChange={(e) => update('ssh_password', e.target.value)} placeholder="Не меняется если пусто" autoComplete="new-password" className="h-8 text-sm" />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs">SSH-ключ</Label>
                    <Select value={server.ssh_key_id} onValueChange={(v) => update('ssh_key_id', v)}>
                      <SelectTrigger className="h-8 text-sm">
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
                    {selectedKey && (
                      <p className="text-[11px] text-muted-foreground">Fingerprint: <code>{selectedKey.fingerprint}</code></p>
                    )}
                  </div>
                  {selectedKey?.has_passphrase && (
                    <div className="space-y-1">
                      <Label className="text-xs">Пароль от ключа</Label>
                      <Input type="password" value={server.ssh_key_passphrase} onChange={(e) => update('ssh_key_passphrase', e.target.value)} autoComplete="new-password" className="h-8 text-sm" />
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <Button variant="outline" size="sm" onClick={handleTestSSH} disabled={testingSSH} className="h-7 text-xs">
                  {testingSSH ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                  Тест SSH
                </Button>
                {sshTestResult && (
                  <span className={`text-xs ${sshTestResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                    {sshTestResult.message}
                  </span>
                )}
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      {/* Диалог несохранённых изменений */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Несохранённые изменения</AlertDialogTitle>
            <AlertDialogDescription>
              У вас есть несохранённые изменения. Покинуть страницу?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowLeaveDialog(false); setPendingNavigate(null); }}>Остаться</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowLeaveDialog(false); setIsDirty(false); if (pendingNavigate) navigate(pendingNavigate); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Покинуть
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ServerEdit;
