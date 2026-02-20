import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { formatTimestamp } from '@/lib/format';
import { LS_USERNAME } from '@/lib/constants';
import LoadingSpinner from './LoadingSpinner';
import PageHeader from './PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const INITIAL_FORM = { login: '', password: '', role: 'viewer', email: '' };

function extractError(err) {
  const detail = err.response?.data?.detail;
  if (!detail) return err.message;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(d => d.msg?.replace(/^Value error, /, '') || d.msg || JSON.stringify(d)).join('; ');
  return JSON.stringify(detail);
}

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);

  const currentUser = localStorage.getItem(LS_USERNAME);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (err) {
      setError('Ошибка загрузки: ' + (extractError(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async () => {
    try {
      await api.post('/users', { ...formData, email: formData.email.trim() || null });
      setShowAddDialog(false);
      setFormData(INITIAL_FORM);
      toast.success('Пользователь создан');
      fetchUsers();
    } catch (err) {
      setError('Ошибка создания: ' + (extractError(err)));
    }
  };

  const handleUpdate = async () => {
    try {
      const data = { role: formData.role, email: formData.email.trim() || null };
      if (formData.password) data.password = formData.password;
      await api.put(`/users/${editingUser.login}`, data);
      setShowEditDialog(false);
      setEditingUser(null);
      setFormData(INITIAL_FORM);
      toast.success('Пользователь обновлён');
      fetchUsers();
    } catch (err) {
      setError('Ошибка обновления: ' + (extractError(err)));
    }
  };

  const handleDelete = async (login) => {
    try {
      await api.delete(`/users/${login}`);
      setUsers(users.filter(u => u.login !== login));
      toast.success('Пользователь удалён');
    } catch (err) {
      setError('Ошибка удаления: ' + (extractError(err)));
    }
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setFormData({ login: user.login, password: '', role: user.role, email: user.email || '' });
    setShowEditDialog(true);
  };

  const getRoleBadge = (role) => {
    if (role === 'admin') return <Badge variant="destructive" className="text-[11px] px-1.5 py-0">Админ</Badge>;
    if (role === 'operator') return <Badge variant="warning" className="text-[11px] px-1.5 py-0">Оператор</Badge>;
    return <Badge variant="secondary" className="text-[11px] px-1.5 py-0">Просмотр</Badge>;
  };

  if (loading) return <LoadingSpinner text="Загрузка пользователей..." />;

  return (
    <div className="space-y-3">
      {/* Заголовок + статистика + кнопка */}
      <div className="flex items-center justify-between">
        <PageHeader title="Пользователи" breadcrumbs={[{ label: 'Пользователи' }]} />
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Всего <strong className="text-foreground tabular-nums">{users.length}</strong></span>
            <span className="text-muted-foreground">Админов <strong className="text-status-danger tabular-nums">{users.filter(u => u.role === 'admin').length}</strong></span>
            <span className="text-muted-foreground">Операторов <strong className="text-status-warning tabular-nums">{users.filter(u => u.role === 'operator').length}</strong></span>
          </div>
          <Button size="sm" onClick={() => { setFormData(INITIAL_FORM); setError(null); setShowAddDialog(true); }} className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" />Добавить
          </Button>
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {/* Таблица */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs h-8">Логин</TableHead>
                <TableHead className="text-xs h-8">Роль</TableHead>
                <TableHead className="text-xs h-8">Email</TableHead>
                <TableHead className="text-xs h-8">Создан</TableHead>
                <TableHead className="text-xs h-8">Последний вход</TableHead>
                <TableHead className="text-xs h-8">Статус</TableHead>
                <TableHead className="text-xs h-8 w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(user => (
                <TableRow key={user.login}>
                  <TableCell className="text-sm font-medium py-1.5">
                    {user.login}
                    {user.login === currentUser && <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0">Вы</Badge>}
                  </TableCell>
                  <TableCell className="py-1.5">{getRoleBadge(user.role)}</TableCell>
                  <TableCell className="text-xs py-1.5">{user.email || '—'}</TableCell>
                  <TableCell className="text-xs py-1.5 tabular-nums">{formatTimestamp(user.created_at)}</TableCell>
                  <TableCell className="text-xs py-1.5 tabular-nums">{formatTimestamp(user.last_login)}</TableCell>
                  <TableCell className="py-1.5">
                    <Badge variant={user.is_active ? 'success' : 'destructive'} className="text-[11px] px-1.5 py-0">
                      {user.is_active ? 'Активен' : 'Заблокирован'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1.5">
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(user)} aria-label="Редактировать">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                            disabled={user.login === currentUser || user.login === 'admin'} aria-label="Удалить">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Удалить пользователя?</AlertDialogTitle>
                            <AlertDialogDescription>Удалить <strong>{user.login}</strong>? Это действие необратимо.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(user.login)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Удалить</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Новый пользователь</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Логин *</Label>
                <Input value={formData.login} onChange={(e) => setFormData({ ...formData, login: e.target.value })} placeholder="login" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Пароль *</Label>
                <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="min 8 символов" className={`h-8 text-sm ${formData.password && formData.password.length < 8 ? 'border-destructive' : ''}`} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Роль *</Label>
                <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Просмотр</SelectItem>
                    <SelectItem value="operator">Оператор</SelectItem>
                    <SelectItem value="admin">Администратор</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="необязательно" className="h-8 text-sm" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAddDialog(false)}>Отмена</Button>
            <Button size="sm" onClick={handleCreate} disabled={!formData.login.trim() || !formData.password || formData.password.length < 8}>Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Редактировать: {formData.login}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Новый пароль</Label>
              <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Пусто = не меняется" className={`h-8 text-sm ${formData.password && formData.password.length < 8 ? 'border-destructive' : ''}`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Роль</Label>
                <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })} disabled={editingUser?.login === 'admin'}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Просмотр</SelectItem>
                    <SelectItem value="operator">Оператор</SelectItem>
                    <SelectItem value="admin">Администратор</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email" className="h-8 text-sm" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowEditDialog(false)}>Отмена</Button>
            <Button size="sm" onClick={handleUpdate} disabled={formData.password && formData.password.length < 8}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default UserManagement;
