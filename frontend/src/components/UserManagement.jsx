import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatTimestamp } from '@/lib/format';
import { LS_USERNAME } from '@/lib/constants';
import LoadingSpinner from './LoadingSpinner';
import PageHeader from './PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, ArrowLeft, Users, Eye } from 'lucide-react';
import { toast } from 'sonner';

const INITIAL_FORM = { login: '', password: '', role: 'viewer', email: '' };

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
      setError('Ошибка загрузки: ' + (err.response?.data?.detail || err.message));
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
      setError('Ошибка создания: ' + (err.response?.data?.detail || err.message));
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
      setError('Ошибка обновления: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (login) => {
    try {
      await api.delete(`/users/${login}`);
      setUsers(users.filter(u => u.login !== login));
      toast.success('Пользователь удалён');
    } catch (err) {
      setError('Ошибка удаления: ' + (err.response?.data?.detail || err.message));
    }
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setFormData({ login: user.login, password: '', role: user.role, email: user.email || '' });
    setShowEditDialog(true);
  };

  const getRoleBadge = (role) => {
    if (role === 'admin') return <Badge variant="destructive">Администратор</Badge>;
    if (role === 'operator') return <Badge variant="warning">Оператор</Badge>;
    return <Badge variant="secondary">Просмотр</Badge>;
  };

  if (loading) return <LoadingSpinner text="Загрузка пользователей..." />;

  return (
    <div className="space-y-4">
      <PageHeader title="Управление пользователями" breadcrumbs={[
        { label: 'Пользователи' },
      ]} />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold tabular-nums">{users.length}</div><p className="text-xs text-muted-foreground">Всего</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-status-danger tabular-nums">{users.filter(u => u.role === 'admin').length}</div><p className="text-xs text-muted-foreground">Админов</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-status-warning tabular-nums">{users.filter(u => u.role === 'operator').length}</div><p className="text-xs text-muted-foreground">Операторов</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-status-info tabular-nums">{users.filter(u => u.role === 'viewer').length}</div><p className="text-xs text-muted-foreground">Просмотр</p></CardContent></Card>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Пользователи</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.history.back()}><ArrowLeft className="h-4 w-4 mr-1" />Назад</Button>
            <Button size="sm" onClick={() => { setFormData(INITIAL_FORM); setError(null); setShowAddDialog(true); }}><Plus className="h-4 w-4 mr-1" />Добавить</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Логин</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Создан</TableHead>
                <TableHead>Последний вход</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(user => (
                <TableRow key={user.login}>
                  <TableCell className="font-medium">
                    {user.login}
                    {user.login === currentUser && <Badge variant="outline" className="ml-2 text-xs">Вы</Badge>}
                  </TableCell>
                  <TableCell>{getRoleBadge(user.role)}</TableCell>
                  <TableCell className="text-sm">{user.email || '—'}</TableCell>
                  <TableCell className="text-sm">{formatTimestamp(user.created_at)}</TableCell>
                  <TableCell className="text-sm">{formatTimestamp(user.last_login)}</TableCell>
                  <TableCell>
                    <Badge variant={user.is_active ? 'success' : 'destructive'}>
                      {user.is_active ? 'Активен' : 'Заблокирован'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(user)} aria-label="Редактировать">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                            disabled={user.login === currentUser || user.login === 'admin'} aria-label="Удалить">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Удалить пользователя?</AlertDialogTitle>
                            <AlertDialogDescription>Удалить пользователя <strong>{user.login}</strong>? Это действие необратимо.</AlertDialogDescription>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый пользователь</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Логин *</Label>
              <Input value={formData.login} onChange={(e) => setFormData({ ...formData, login: e.target.value })} placeholder="Введите логин" />
            </div>
            <div className="space-y-2">
              <Label>Пароль *</Label>
              <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Минимум 8 символов" />
              {formData.password && formData.password.length < 8 && (
                <p className="text-xs text-destructive">Минимум 8 символов (сейчас: {formData.password.length})</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Роль *</Label>
              <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Просмотр</SelectItem>
                  <SelectItem value="operator">Оператор</SelectItem>
                  <SelectItem value="admin">Администратор</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email@example.com (необязательно)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={!formData.login.trim() || !formData.password || formData.password.length < 8}>Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать пользователя</DialogTitle>
            <DialogDescription>Редактирование {formData.login}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Логин</Label>
              <Input value={formData.login} disabled />
            </div>
            <div className="space-y-2">
              <Label>Новый пароль</Label>
              <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Оставьте пустым если не меняете" />
              {formData.password && formData.password.length < 8 && (
                <p className="text-xs text-destructive">Минимум 8 символов</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Роль</Label>
              <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })} disabled={editingUser?.login === 'admin'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Просмотр</SelectItem>
                  <SelectItem value="operator">Оператор</SelectItem>
                  <SelectItem value="admin">Администратор</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email@example.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Отмена</Button>
            <Button onClick={handleUpdate} disabled={formData.password && formData.password.length < 8}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default UserManagement;
