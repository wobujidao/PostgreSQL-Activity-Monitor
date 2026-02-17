import { useState } from 'react';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, AlertCircle, Sun, Moon, Circle } from 'lucide-react';

function Login({ onLogin, error: parentError, backendStatus }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (!username.trim() || !password) {
      setLocalError('Пожалуйста, заполните все поля');
      return;
    }
    setLoading(true);
    await onLogin(username, password);
    setLoading(false);
  };

  const error = parentError || localError;
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="absolute top-4 right-4 text-white/60 hover:text-white hover:bg-white/10 h-9 w-9"
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
      </Button>
      <Card className="w-full max-w-md border-0 shadow-2xl bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center pb-2 pt-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">PostgreSQL Monitor</h1>
          <p className="text-sm text-muted-foreground">Система мониторинга активности баз</p>
        </CardHeader>

        <CardContent className="px-8">
          {backendStatus === 'unavailable' && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Сервер мониторинга недоступен</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Логин</Label>
              <Input
                id="username"
                type="text"
                placeholder="Введите ваш логин"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                placeholder="Введите ваш пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading || backendStatus === 'unavailable'}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Вход...
                </>
              ) : (
                'Войти в систему'
              )}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex-col gap-2 pb-6">
          <div className="flex items-center gap-1.5 text-xs">
            <Circle className={`h-2 w-2 fill-current ${backendStatus === 'available' ? 'text-emerald-500' : backendStatus === 'unavailable' ? 'text-red-500' : 'text-yellow-500'}`} />
            <span className="text-muted-foreground">
              Бэкенд: {backendStatus === 'available' ? 'доступен' : backendStatus === 'unavailable' ? 'недоступен' : 'проверка...'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">PostgreSQL Activity Monitor v2.2</p>
        </CardFooter>
      </Card>
    </div>
  );
}

export default Login;
