import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatBytesGB } from '@/lib/format';
import LoadingSpinner from './LoadingSpinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Save, ArrowLeft, Trash2, Loader2, KeyRound, Lock, AlertTriangle } from 'lucide-react';
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [serversRes, keysRes] = await Promise.all([api.get('/servers'), api.get('/ssh-keys')]);
        const s = serversRes.data.find(s => s.name === serverName);
        if (!s) throw new Error('Сервер не найден');
        setServer({ ...s, password: '', ssh_password: '', ssh_auth_type: s.ssh_auth_type || 'password', ssh_key_id: s.ssh_key_id || '', ssh_key_passphrase: '', stats_db: s.stats_db || '' });
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

  const update = (field, value) => setServer(prev => ({ ...prev, [field]: value }));

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
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <h1 className="text-2xl font-bold">Редактирование сервера</h1>
        <nav className="text-sm text-muted-foreground mt-1">
          <Link to="/" className="hover:text-foreground">Главная</Link>
          <span className="mx-1">/</span>
          <Link to="/" className="hover:text-foreground">Серверы</Link>
          <span className="mx-1">/</span>
          <span>{serverName}</span>
        </nav>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main settings */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Основные настройки</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Название сервера</Label>
                <Input value={server.name} disabled />
                <p className="text-xs text-muted-foreground">Название нельзя изменить</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Хост</Label>
                  <Input value={server.host} onChange={(e) => update('host', e.target.value)} placeholder="192.168.1.100" />
                </div>
                <div className="space-y-2">
                  <Label>Порт PG</Label>
                  <Input type="number" value={server.port} onChange={(e) => update('port', parseInt(e.target.value))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>База для статистики</Label>
                <Input value={server.stats_db} onChange={(e) => update('stats_db', e.target.value)} placeholder="stats_db (опционально)" />
              </div>
              <Separator />
              <h4 className="font-medium">Учетные данные PostgreSQL</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Пользователь</Label>
                  <Input value={server.user} onChange={(e) => update('user', e.target.value)} placeholder="postgres" />
                </div>
                <div className="space-y-2">
                  <Label>Пароль</Label>
                  <Input type="password" value={server.password} onChange={(e) => update('password', e.target.value)} placeholder="Не меняется если пусто" autoComplete="new-password" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Настройки SSH</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Пользователь SSH</Label>
                  <Input value={server.ssh_user} onChange={(e) => update('ssh_user', e.target.value)} placeholder="root" />
                </div>
                <div className="space-y-2">
                  <Label>Порт SSH</Label>
                  <Input type="number" value={server.ssh_port} onChange={(e) => update('ssh_port', parseInt(e.target.value))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Метод аутентификации</Label>
                <RadioGroup value={server.ssh_auth_type} onValueChange={(v) => update('ssh_auth_type', v)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="password" id="edit-ssh-pw" />
                    <Label htmlFor="edit-ssh-pw" className="font-normal">По паролю</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="key" id="edit-ssh-key" />
                    <Label htmlFor="edit-ssh-key" className="font-normal">По SSH-ключу</Label>
                  </div>
                </RadioGroup>
              </div>

              {server.ssh_auth_type === 'password' ? (
                <div className="space-y-2">
                  <Label>Пароль SSH</Label>
                  <Input type="password" value={server.ssh_password} onChange={(e) => update('ssh_password', e.target.value)} placeholder="Не меняется если пусто" autoComplete="new-password" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>SSH-ключ</Label>
                    <Select value={server.ssh_key_id} onValueChange={(v) => update('ssh_key_id', v)}>
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
                    {selectedKey && (
                      <p className="text-xs text-muted-foreground">Fingerprint: <code>{selectedKey.fingerprint}</code></p>
                    )}
                  </div>
                  {selectedKey?.has_passphrase && (
                    <div className="space-y-2">
                      <Label>Пароль от ключа</Label>
                      <Input type="password" value={server.ssh_key_passphrase} onChange={(e) => update('ssh_key_passphrase', e.target.value)} autoComplete="new-password" />
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={handleTestSSH} disabled={testingSSH}>
                  {testingSSH ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  Тест SSH
                </Button>
                {sshTestResult && (
                  <Alert variant={sshTestResult.success ? 'default' : 'destructive'} className="mt-3">
                    <AlertDescription>{sshTestResult.success ? '✅ ' : '❌ '}{sshTestResult.message}</AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Информация</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Статус</span>
                <Badge variant={server.status === 'ok' ? 'default' : 'destructive'}>
                  {server.status === 'ok' ? 'Активен' : 'Недоступен'}
                </Badge>
              </div>
              {server.version && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PostgreSQL</span>
                  <span>{server.version}</span>
                </div>
              )}
              {server.uptime_hours != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uptime</span>
                  <span>{Math.floor(server.uptime_hours / 24)} дней</span>
                </div>
              )}
              {server.free_space && server.total_space && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Диск</span>
                  <span>{formatBytesGB(server.free_space)} / {formatBytesGB(server.total_space)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Действия</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Сохранить
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                К списку
              </Button>
            </CardContent>
          </Card>

          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Опасная зона
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Удаление сервера приведет к потере всей истории мониторинга. Это действие необратимо.
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="w-full">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Удалить сервер
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить сервер?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Вы уверены что хотите удалить сервер <strong>{serverName}</strong>? Это действие нельзя отменить.
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default ServerEdit;
