import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import PageHeader from './PageHeader';
import LoadingSpinner from './LoadingSpinner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Timer, Database, Save, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const SETTING_GROUPS = [
  {
    title: 'Интервалы коллектора',
    icon: Timer,
    fields: [
      { key: 'collect_interval', label: 'Сбор статистики', unit: 'сек', min: 60, max: 86400, default: '10 мин' },
      { key: 'size_update_interval', label: 'Размеры БД', unit: 'сек', min: 300, max: 86400, default: '30 мин' },
      { key: 'db_check_interval', label: 'Проверка новых БД', unit: 'сек', min: 300, max: 86400, default: '10 мин' },
    ],
  },
  {
    title: 'Хранение данных',
    icon: Database,
    fields: [
      { key: 'retention_months', label: 'Статистика', unit: 'мес', min: 1, max: 120, default: '12' },
      { key: 'audit_retention_days', label: 'Аудит', unit: 'дней', min: 7, max: 3650, default: '90' },
      { key: 'logs_retention_days', label: 'Логи', unit: 'дней', min: 7, max: 3650, default: '30' },
    ],
  },
];

function formatInterval(seconds) {
  if (seconds < 60) return `${seconds} сек`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get('/settings');
      setSettings(res.data);
      const initial = {};
      for (const [key, info] of Object.entries(res.data)) {
        initial[key] = info.value;
      }
      setFormData(initial);
    } catch {
      toast.error('Не удалось загрузить настройки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const hasChanges = Object.keys(formData).some(
    key => settings[key] && formData[key] !== settings[key].value
  );

  const getError = (field) => {
    const val = Number(formData[field.key]);
    if (isNaN(val) || formData[field.key] === '') return null;
    if (val < field.min) return `min ${field.min}`;
    if (val > field.max) return `max ${field.max}`;
    return null;
  };

  const hasErrors = SETTING_GROUPS.flatMap(g => g.fields).some(f => getError(f));

  const handleSave = async () => {
    const updates = {};
    for (const [key, value] of Object.entries(formData)) {
      if (settings[key] && value !== settings[key].value) {
        updates[key] = Number(value);
      }
    }
    if (Object.keys(updates).length === 0) return;
    setSaving(true);
    try {
      const res = await api.put('/settings', updates);
      setSettings(res.data);
      const updated = {};
      for (const [key, info] of Object.entries(res.data)) {
        updated[key] = info.value;
      }
      setFormData(updated);
      toast.success('Настройки сохранены');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const initial = {};
    for (const [key, info] of Object.entries(settings)) {
      initial[key] = info.value;
    }
    setFormData(initial);
  };

  if (loading) return <LoadingSpinner text="Загрузка настроек..." />;

  return (
    <div className="space-y-3 max-w-xl">
      <div className="flex items-center justify-between">
        <PageHeader title="Настройки" breadcrumbs={[{ label: 'Настройки' }]} />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleReset} disabled={!hasChanges}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />Сбросить
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || hasErrors || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Сохранить
          </Button>
        </div>
      </div>

      {SETTING_GROUPS.map((group) => {
        const Icon = group.icon;
        return (
          <Card key={group.title}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-1.5 mb-3 text-sm font-medium text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {group.title}
              </div>
              <div className="space-y-2.5">
                {group.fields.map((field) => {
                  const error = getError(field);
                  const val = formData[field.key] || '';
                  return (
                    <div key={field.key} className="grid grid-cols-[1fr_100px_auto] gap-2 items-center">
                      <Label htmlFor={field.key} className="text-xs truncate" title={field.label}>
                        {field.label}
                        <span className="text-muted-foreground ml-1 font-normal">({field.default})</span>
                      </Label>
                      <Input
                        id={field.key}
                        type="number"
                        min={field.min}
                        max={field.max}
                        value={val}
                        onChange={(e) => handleChange(field.key, e.target.value)}
                        className={`h-7 text-sm ${error ? 'border-destructive' : ''}`}
                      />
                      <span className="text-[11px] text-muted-foreground w-14 text-right">
                        {error
                          ? <span className="text-destructive">{error}</span>
                          : field.unit === 'сек' && val && Number(val) >= 60
                            ? formatInterval(Number(val))
                            : field.unit
                        }
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
