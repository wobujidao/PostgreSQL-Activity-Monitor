import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { formatTimestamp } from '@/lib/format';
import { LS_USER_ROLE } from '@/lib/constants';
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
import { Plus, Pencil, Trash2, Download, Eye, Upload, Loader2, Copy } from 'lucide-react';
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
    <div className="space-y-3">
      {/* Заголовок + статистика + кнопки */}
      <div className="flex items-center justify-between">
        <PageHeader title="SSH-ключи" breadcrumbs={[{ label: 'SSH-ключи' }]} />
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Всего <strong className="text-foreground tabular-nums">{keys.length}</strong></span>
            <span className="text-muted-foreground">RSA <strong className="text-status-info tabular-nums">{keys.filter(k => k.key_type === 'rsa').length}</strong></span>
            <span className="text-muted-foreground">Ed25519 <strong className="text-status-active tabular-nums">{keys.filter(k => k.key_type === 'ed25519').length}</strong></span>
          </div>
          {userRole === 'admin' && (
            <div className="flex gap-1.5">
              <Button size="sm" onClick={() => { setModalMode('generate'); setShowModal(true); }} className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" />Создать
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setModalMode('import'); setShowModal(true); }} className="h-7 text-xs">
                <Upload className="h-3 w-3 mr-1" />Импорт
              </Button>
            </div>
          )}
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {/* Таблица */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs h-8">Название</TableHead>
                <TableHead className="text-xs h-8">Тип</TableHead>
                <TableHead className="text-xs h-8">Fingerprint</TableHead>
                <TableHead className="text-xs h-8">Создан</TableHead>
                <TableHead className="text-xs h-8">Автор</TableHead>
                <TableHead className="text-xs h-8 text-center">Серв.</TableHead>
                <TableHead className="text-xs h-8 w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map(key => {
                const dupes = keys.filter(k => k.fingerprint === key.fingerprint && k.id !== key.id);
                return (
                  <TableRow key={key.id} className={dupes.length > 0 ? 'bg-status-warning/5' : ''}>
                    <TableCell className="py-1.5">
                      <span className="text-sm font-medium">{key.name}</span>
                      {key.description && <span className="text-xs text-muted-foreground ml-2">{key.description}</span>}
                      {dupes.length > 0 && <div className="text-[11px] text-status-warning">Дубликат: {dupes.map(k => k.name).join(', ')}</div>}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Badge variant={key.key_type === 'rsa' ? 'default' : 'secondary'} className="text-[11px] px-1.5 py-0">{key.key_type.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell className="py-1.5"><code className="text-[11px]">{key.fingerprint}</code></TableCell>
                    <TableCell className="text-xs py-1.5 tabular-nums">{formatTimestamp(key.created_at)}</TableCell>
                    <TableCell className="text-xs py-1.5">{key.created_by}</TableCell>
                    <TableCell className="text-center py-1.5">
                      {key.servers_count > 0 ? <Badge className="text-[11px] px-1.5 py-0">{key.servers_count}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex gap-0.5">
                        {userRole === 'admin' && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingKey(key); setEditFormData({ name: key.name, description: key.description || '' }); setShowEditDialog(true); }} aria-label="Редактировать">
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setSelectedKey(key); setShowDetailsDialog(true); }} aria-label="Просмотр">
                          <Eye className="h-3 w-3" />
                        </Button>
                        {userRole === 'admin' && (
                          <>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDownload(key)} aria-label="Скачать">
                              <Download className="h-3 w-3" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" disabled={key.servers_count > 0} aria-label="Удалить">
                                  <Trash2 className="h-3 w-3" />
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
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-sm">Нет SSH-ключей</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Generate/Import dialog */}
      <Dialog open={showModal} onOpenChange={(open) => { if (!open) { setShowModal(false); resetForms(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{modalMode === 'generate' ? 'Генерация SSH-ключа' : 'Импорт SSH-ключа'}</DialogTitle>
          </DialogHeader>
          <Tabs value={modalMode} onValueChange={setModalMode}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="generate">Сгенерировать</TabsTrigger>
              <TabsTrigger value="import">Импортировать</TabsTrigger>
            </TabsList>
            <TabsContent value="generate" className="space-y-3 mt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Название *</Label>
                  <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="prod-servers-key" className="h-8 text-sm" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Тип ключа</Label>
                  <RadioGroup value={keyType} onValueChange={setKeyType} className="flex gap-4">
                    <div className="flex items-center space-x-1.5"><RadioGroupItem value="rsa" id="kt-rsa" /><Label htmlFor="kt-rsa" className="text-sm font-normal cursor-pointer">RSA</Label></div>
                    <div className="flex items-center space-x-1.5"><RadioGroupItem value="ed25519" id="kt-ed" /><Label htmlFor="kt-ed" className="text-sm font-normal cursor-pointer">Ed25519</Label></div>
                  </RadioGroup>
                </div>
                {keyType === 'rsa' && (
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Размер</Label>
                    <Select value={keySize} onValueChange={setKeySize}>
                      <SelectTrigger className="h-8 text-sm w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2048">2048 бит</SelectItem>
                        <SelectItem value="3072">3072 бит</SelectItem>
                        <SelectItem value="4096">4096 бит</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Пароль</Label>
                  <Input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="Опционально" className="h-8 text-sm" />
                </div>
                {passphrase ? (
                  <div className="space-y-1">
                    <Label className="text-xs">Подтверждение</Label>
                    <Input type="password" value={confirmPassphrase} onChange={(e) => setConfirmPassphrase(e.target.value)} className={`h-8 text-sm ${confirmPassphrase && passphrase !== confirmPassphrase ? 'border-destructive' : ''}`} />
                  </div>
                ) : <div />}
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Описание</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Назначение ключа" className="h-8 text-sm" />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="import" className="space-y-3 mt-3">
              <div className="space-y-1">
                <Label className="text-xs">Название *</Label>
                <Input value={importKeyName} onChange={(e) => setImportKeyName(e.target.value)} placeholder="legacy-server-key" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Приватный ключ *</Label>
                  <Label className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    <Input type="file" accept=".pem,.key,id_rsa,id_ed25519" onChange={handleFileUpload} className="hidden" />
                    <Upload className="h-3 w-3 inline mr-1" />Файл
                  </Label>
                </div>
                <textarea className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={privateKey} onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Пароль от ключа</Label>
                  <Input type="password" value={importPassphrase} onChange={(e) => setImportPassphrase(e.target.value)} placeholder="Если есть" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Описание</Label>
                  <Input value={importDescription} onChange={(e) => setImportDescription(e.target.value)} placeholder="Назначение" className="h-8 text-sm" />
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowModal(false); resetForms(); }}>Отмена</Button>
            {modalMode === 'generate' ? (
              <Button size="sm" onClick={handleGenerate} disabled={isGenerating || !keyName.trim() || (passphrase && passphrase !== confirmPassphrase)}>
                {isGenerating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}Сгенерировать
              </Button>
            ) : (
              <Button size="sm" onClick={handleImport} disabled={isImporting || !importKeyName.trim() || !privateKey.trim()}>
                {isImporting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}Импортировать
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Редактировать ключ</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Название *</Label><Input value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Описание</Label><Input value={editFormData.description} onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })} className="h-8 text-sm" /></div>
            {editingKey && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>{editingKey.key_type.toUpperCase()} | {formatTimestamp(editingKey.created_at)}</div>
                <div className="font-mono truncate">{editingKey.fingerprint}</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowEditDialog(false)}>Отмена</Button>
            <Button size="sm" onClick={handleUpdate} disabled={!editFormData.name.trim()}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Детали SSH-ключа</DialogTitle></DialogHeader>
          {selectedKey && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{selectedKey.name}</span>
                <Badge variant={selectedKey.key_type === 'rsa' ? 'default' : 'secondary'} className="text-[11px] px-1.5 py-0">{selectedKey.key_type.toUpperCase()}</Badge>
                {selectedKey.has_passphrase && <Badge variant="outline" className="text-[11px] px-1.5 py-0">С паролем</Badge>}
              </div>
              {selectedKey.description && <p className="text-sm text-muted-foreground">{selectedKey.description}</p>}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fingerprint</Label>
                <div className="flex items-center gap-1">
                  <code className="text-xs flex-1 bg-muted px-2 py-1 rounded font-mono truncate">{selectedKey.fingerprint}</code>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(selectedKey.fingerprint)} aria-label="Копировать"><Copy className="h-3 w-3" /></Button>
                </div>
              </div>
              {userRole === 'admin' && selectedKey.public_key && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Публичный ключ</Label>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => copyToClipboard(selectedKey.public_key)}><Copy className="h-3 w-3 mr-1" />Копировать</Button>
                  </div>
                  <pre className="text-[11px] bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap break-all font-mono max-h-32">{selectedKey.public_key}</pre>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatTimestamp(selectedKey.created_at)} ({selectedKey.created_by}) | Серверов: {selectedKey.servers_count || 0}</span>
                {userRole === 'admin' && (
                  <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => handleDownload(selectedKey)}><Download className="h-3 w-3 mr-1" />Скачать .pub</Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SSHKeyManagement;
