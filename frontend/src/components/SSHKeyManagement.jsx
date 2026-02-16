import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { formatTimestamp } from '@/lib/format';
import { LS_USER_ROLE } from '@/lib/constants';
import LoadingSpinner from './LoadingSpinner';
import PageHeader from './PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, ArrowLeft, KeyRound, Download, Eye, Upload, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';

function SSHKeyManagement() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('generate');
  const [selectedKey, setSelectedKey] = useState(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: '', description: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Generate form
  const [keyName, setKeyName] = useState('');
  const [keyType, setKeyType] = useState('rsa');
  const [keySize, setKeySize] = useState('2048');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [description, setDescription] = useState('');

  // Import form
  const [importKeyName, setImportKeyName] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [importDescription, setImportDescription] = useState('');

  const userRole = localStorage.getItem(LS_USER_ROLE) || 'viewer';

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await api.get('/ssh-keys');
      setKeys(res.data);
    } catch (err) {
      setError('Ошибка загрузки: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchKeys(); }, []);

  const resetForms = () => {
    setKeyName(''); setKeyType('rsa'); setKeySize('2048'); setPassphrase(''); setConfirmPassphrase(''); setDescription('');
    setImportKeyName(''); setPrivateKey(''); setImportPassphrase(''); setImportDescription('');
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await api.post('/ssh-keys/generate', {
        name: keyName, key_type: keyType, key_size: keyType === 'rsa' ? parseInt(keySize) : null,
        passphrase: passphrase || null, description: description || null,
      });
      setKeys([...keys, res.data]);
      setShowModal(false);
      resetForms();
      toast.success('SSH-ключ сгенерирован');
    } catch (err) {
      setError('Ошибка генерации: ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    setError(null);
    try {
      const res = await api.post('/ssh-keys/import', {
        name: importKeyName, private_key: privateKey,
        passphrase: importPassphrase || null, description: importDescription || null,
      });
      setKeys([...keys, res.data]);
      setShowModal(false);
      resetForms();
      toast.success('SSH-ключ импортирован');
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка импорта');
    } finally {
      setIsImporting(false);
    }
  };

  const handleUpdate = async () => {
    try {
      const res = await api.put(`/ssh-keys/${editingKey.id}`, editFormData);
      setKeys(keys.map(k => k.id === editingKey.id ? res.data : k));
      setShowEditDialog(false);
      toast.success('Ключ обновлён');
    } catch (err) {
      setError('Ошибка обновления: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (keyId) => {
    try {
      await api.delete(`/ssh-keys/${keyId}`);
      setKeys(keys.filter(k => k.id !== keyId));
      toast.success('Ключ удалён');
    } catch (err) {
      setError('Ошибка удаления: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDownload = async (key) => {
    try {
      const res = await api.get(`/ssh-keys/${key.id}/download-public`);
      const blob = new Blob([res.data.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Ошибка загрузки: ' + (err.response?.data?.detail || err.message));
    }
  };

  const copyToClipboard = (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => toast.success('Скопировано'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-999999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast.success('Скопировано');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setPrivateKey(ev.target.result);
      reader.readAsText(file);
    }
  };

  if (loading) return <LoadingSpinner text="Загрузка SSH-ключей..." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Управление SSH-ключами" breadcrumbs={[
        { label: 'SSH-ключи' },
      ]} />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{keys.length}</div><p className="text-xs text-muted-foreground">Всего ключей</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-blue-600">{keys.filter(k => k.key_type === 'rsa').length}</div><p className="text-xs text-muted-foreground">RSA</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-600">{keys.filter(k => k.key_type === 'ed25519').length}</div><p className="text-xs text-muted-foreground">Ed25519</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-purple-600">{keys.reduce((s, k) => s + k.servers_count, 0)}</div><p className="text-xs text-muted-foreground">Используется</p></CardContent></Card>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />SSH-ключи</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.history.back()}><ArrowLeft className="h-4 w-4 mr-1" />Назад</Button>
            {userRole === 'admin' && (
              <>
                <Button size="sm" onClick={() => { setModalMode('generate'); setShowModal(true); }}><Plus className="h-4 w-4 mr-1" />Сгенерировать</Button>
                <Button variant="secondary" size="sm" onClick={() => { setModalMode('import'); setShowModal(true); }}><Upload className="h-4 w-4 mr-1" />Импорт</Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Fingerprint</TableHead>
                <TableHead>Создан</TableHead>
                <TableHead>Автор</TableHead>
                <TableHead>Серверов</TableHead>
                <TableHead>Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map(key => {
                const dupes = keys.filter(k => k.fingerprint === key.fingerprint && k.id !== key.id);
                return (
                  <TableRow key={key.id} className={dupes.length > 0 ? 'bg-amber-50' : ''}>
                    <TableCell>
                      <div className="font-medium">{key.name}</div>
                      {key.description && <div className="text-xs text-muted-foreground">{key.description}</div>}
                      {dupes.length > 0 && <div className="text-xs text-amber-600 mt-1">Дубликат: {dupes.map(k => k.name).join(', ')}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={key.key_type === 'rsa' ? 'default' : 'secondary'}>{key.key_type.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell><code className="text-xs">{key.fingerprint}</code></TableCell>
                    <TableCell className="text-sm">{formatTimestamp(key.created_at)}</TableCell>
                    <TableCell className="text-sm">{key.created_by}</TableCell>
                    <TableCell>
                      {key.servers_count > 0 ? <Badge>{key.servers_count}</Badge> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {userRole === 'admin' && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingKey(key); setEditFormData({ name: key.name, description: key.description || '' }); setShowEditDialog(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedKey(key); setShowDetailsDialog(true); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {userRole === 'admin' && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(key)}>
                              <Download className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={key.servers_count > 0}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Удалить ключ?</AlertDialogTitle>
                                  <AlertDialogDescription>Удалить ключ <strong>{key.name}</strong>?</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(key.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Удалить</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {keys.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Нет SSH-ключей</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Generate/Import dialog */}
      <Dialog open={showModal} onOpenChange={(open) => { if (!open) { setShowModal(false); resetForms(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{modalMode === 'generate' ? 'Генерация SSH-ключа' : 'Импорт SSH-ключа'}</DialogTitle>
          </DialogHeader>
          <Tabs value={modalMode} onValueChange={setModalMode}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="generate">Сгенерировать</TabsTrigger>
              <TabsTrigger value="import">Импортировать</TabsTrigger>
            </TabsList>
            <TabsContent value="generate" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Название *</Label>
                <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="prod-servers-key" />
              </div>
              <div className="space-y-2">
                <Label>Тип ключа</Label>
                <RadioGroup value={keyType} onValueChange={setKeyType} className="flex gap-4">
                  <div className="flex items-center space-x-2"><RadioGroupItem value="rsa" id="kt-rsa" /><Label htmlFor="kt-rsa" className="font-normal">RSA</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="ed25519" id="kt-ed" /><Label htmlFor="kt-ed" className="font-normal">Ed25519 (рекомендуется)</Label></div>
                </RadioGroup>
              </div>
              {keyType === 'rsa' && (
                <div className="space-y-2">
                  <Label>Размер ключа</Label>
                  <Select value={keySize} onValueChange={setKeySize}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2048">2048 бит</SelectItem>
                      <SelectItem value="3072">3072 бит</SelectItem>
                      <SelectItem value="4096">4096 бит</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Пароль (опционально)</Label>
                <Input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="Без пароля если пусто" />
              </div>
              {passphrase && (
                <div className="space-y-2">
                  <Label>Подтвердите пароль</Label>
                  <Input type="password" value={confirmPassphrase} onChange={(e) => setConfirmPassphrase(e.target.value)} />
                  {confirmPassphrase && passphrase !== confirmPassphrase && <p className="text-xs text-destructive">Пароли не совпадают</p>}
                </div>
              )}
              <div className="space-y-2">
                <Label>Описание</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Назначение ключа" />
              </div>
            </TabsContent>
            <TabsContent value="import" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Название *</Label>
                <Input value={importKeyName} onChange={(e) => setImportKeyName(e.target.value)} placeholder="legacy-server-key" />
              </div>
              <div className="space-y-2">
                <Label>Приватный ключ *</Label>
                <textarea className="flex min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={privateKey} onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----" />
              </div>
              <div className="space-y-2">
                <Label>Или загрузите файл</Label>
                <Input type="file" accept=".pem,.key,id_rsa,id_ed25519" onChange={handleFileUpload} />
              </div>
              <div className="space-y-2">
                <Label>Пароль от ключа</Label>
                <Input type="password" value={importPassphrase} onChange={(e) => setImportPassphrase(e.target.value)} placeholder="Если есть" />
              </div>
              <div className="space-y-2">
                <Label>Описание</Label>
                <Input value={importDescription} onChange={(e) => setImportDescription(e.target.value)} placeholder="Назначение ключа" />
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowModal(false); resetForms(); }}>Отмена</Button>
            {modalMode === 'generate' ? (
              <Button onClick={handleGenerate} disabled={isGenerating || !keyName.trim() || (passphrase && passphrase !== confirmPassphrase)}>
                {isGenerating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}Сгенерировать
              </Button>
            ) : (
              <Button onClick={handleImport} disabled={isImporting || !importKeyName.trim() || !privateKey.trim()}>
                {isImporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}Импортировать
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Редактировать SSH-ключ</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Название *</Label><Input value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Описание</Label><Input value={editFormData.description} onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })} /></div>
            {editingKey && (
              <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                <div><strong>Тип:</strong> {editingKey.key_type.toUpperCase()}</div>
                <div><strong>Fingerprint:</strong> <code>{editingKey.fingerprint}</code></div>
                <div><strong>Создан:</strong> {formatTimestamp(editingKey.created_at)}</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Отмена</Button>
            <Button onClick={handleUpdate} disabled={!editFormData.name.trim()}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Детали SSH-ключа</DialogTitle></DialogHeader>
          {selectedKey && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">{selectedKey.name}</h3>
                {selectedKey.description && <p className="text-sm text-muted-foreground">{selectedKey.description}</p>}
              </div>
              <div className="flex gap-2">
                <Badge variant={selectedKey.key_type === 'rsa' ? 'default' : 'secondary'}>{selectedKey.key_type.toUpperCase()}</Badge>
                {selectedKey.has_passphrase && <Badge variant="outline">С паролем</Badge>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fingerprint</Label>
                <div className="flex items-center gap-2">
                  <code className="text-sm flex-1 bg-muted px-2 py-1 rounded">{selectedKey.fingerprint}</code>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(selectedKey.fingerprint)}><Copy className="h-4 w-4" /></Button>
                </div>
              </div>
              {userRole === 'admin' && selectedKey.public_key && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Публичный ключ</Label>
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(selectedKey.public_key)}><Copy className="h-3 w-3 mr-1" />Копировать</Button>
                  </div>
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all font-mono">{selectedKey.public_key}</pre>
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                Создан: {formatTimestamp(selectedKey.created_at)} ({selectedKey.created_by}) | Серверов: {selectedKey.servers_count || 0}
              </div>
              {userRole === 'admin' && (
                <Button variant="outline" onClick={() => handleDownload(selectedKey)}><Download className="h-4 w-4 mr-2" />Скачать публичный ключ</Button>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SSHKeyManagement;
