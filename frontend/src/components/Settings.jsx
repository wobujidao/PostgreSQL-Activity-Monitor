import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import PageHeader from './PageHeader';
import LoadingSpinner from './LoadingSpinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Timer, Database, Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

const SETTING_GROUPS = [
  {
    title: 'Интервалы коллектора',
    description: 'Частота сбора данных с серверов PostgreSQL',
    icon: Timer,
    fields: [
      {
        key: 'collect_interval', label: 'Сбор статистики', unit: 'сек',
        min: 60, max: 86400,
        hint: 'Основной сбор (подключения, транзакции, диск). По умолчанию: 600 сек (10 мин)',
      },
      {
        key: 'size_update_interval', label: 'Обновление размеров БД', unit: 'сек',
        min: 300, max: 86400,
        hint: 'Тяжёлый запрос, может занимать до 2 мин. По умолчанию: 1800 сек (30 мин)',
      },
      {
        key: 'db_check_interval', label: 'Проверка новых/удалённых БД', unit: 'сек',
        min: 300, max: 86400,
        hint: 'Синхронизация списка баз данных. По умолчанию: 1800 сек (30 мин)',
      },
    ],
  },
  {
    title: 'Хранение данных',
    description: 'Сроки хранения исторических данных и аудита',
    icon: Database,
    fields: [
      {
        key: 'retention_months', label: 'Хранение статистики', unit: 'мес',
        min: 1, max: 120,
        hint: 'Партиции старше этого срока удаляются. По умолчанию: 12 мес',
      },
      {
        key: 'audit_retention_days', label: 'Хранение аудита', unit: 'дней',
        min: 7, max: 3650,
        hint: 'Срок хранения записей аудита сессий. По умолчанию: 90 дней',
      },
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
    } catch (err) {
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

  const getValidationError = (field) => {
    const val = Number(formData[field.key]);
    if (isNaN(val) || val === '') return null;
    if (val < field.min) return `Минимум: ${field.min}`;
    if (val > field.max) return `Максимум: ${field.max}`;
    return null;
  };

  const hasErrors = SETTING_GROUPS.flatMap(g => g.fields).some(f => getValidationError(f));

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
      const detail = err.response?.data?.detail || 'Не удалось сохранить настройки';
      toast.error(detail);
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
    <div className="space-y-4">
      <PageHeader title="Настройки" breadcrumbs={[{ label: 'Настройки' }]} />

      {SETTING_GROUPS.map((group) => {
        const Icon = group.icon;
        return (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-5 w-5" />
                {group.title}
              </CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {group.fields.map((field, i) => {
                const error = getValidationError(field);
                const val = formData[field.key] || '';
                return (
                  <div key={field.key}>
                    {i > 0 && <Separator className="mb-4" />}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-3 items-start">
                      <div className="space-y-1">
                        <Label htmlFor={field.key}>{field.label}</Label>
                        <p className="text-xs text-muted-foreground">{field.hint}</p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Input
                            id={field.key}
                            type="number"
                            min={field.min}
                            max={field.max}
                            value={val}
                            onChange={(e) => handleChange(field.key, e.target.value)}
                            className={`w-full ${error ? 'border-destructive' : ''}`}
                          />
                          <span className="text-sm text-muted-foreground whitespace-nowrap min-w-[3rem]">
                            {field.unit}
                          </span>
                        </div>
                        {error && (
                          <p className="text-xs text-destructive">{error}</p>
                        )}
                        {!error && field.unit === 'сек' && val && Number(val) >= 60 && (
                          <p className="text-xs text-muted-foreground">
                            = {formatInterval(Number(val))}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={!hasChanges || hasErrors || saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Сохранение...' : 'Сохранить'}
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={!hasChanges}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Сбросить
        </Button>
      </div>
    </div>
  );
}
