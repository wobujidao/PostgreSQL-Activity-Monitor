import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { AuthProvider } from '@/contexts/auth-context';
import { useAuth } from '@/hooks/use-auth';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Home, User, Users, KeyRound, LogOut, Shield, AlertCircle, Lock, Loader2, ChevronDown, Sun, Moon, Search } from 'lucide-react';
import { useTheme } from 'next-themes';
import { formatTimeLeft } from '@/lib/format';
import { ServersProvider } from '@/contexts/servers-context';
import CommandPalette from './components/CommandPalette';
import Login from './components/Login';
import ServerList from './components/ServerList';
import ServerDetails from './components/ServerDetails';
import ServerEdit from './components/ServerEdit';
import DatabaseDetails from './components/DatabaseDetails';
import UserManagement from './components/UserManagement';
import SSHKeyManagement from './components/SSHKeyManagement';
import ScrollToTop from './components/ScrollToTop';

function AppContent() {
  const {
    token, currentUser, userRole, backendStatus,
    showSessionModal, showRefreshLoginModal,
    timeLeft, isRefreshing, error,
    refreshPassword, setRefreshPassword,
    login, logout, refreshToken,
    setShowSessionModal, setShowRefreshLoginModal,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const isHome = location.pathname === '/';
  const [commandOpen, setCommandOpen] = useState(false);

  // Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!token) {
    if (backendStatus === 'checking') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-cyan-400" />
            <p className="text-sm text-white/60">Подключение к серверу...</p>
          </div>
        </div>
      );
    }
    return <Login onLogin={login} error={error} backendStatus={backendStatus} />;
  }

  const roleLabel = userRole === 'admin' ? 'Администратор' : userRole === 'operator' ? 'Оператор' : 'Просмотр';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-slate-900 text-white">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 no-underline text-white hover:text-white/90">
            <Shield className="h-5 w-5 text-cyan-400" />
            <span className="font-semibold hidden sm:inline">PostgreSQL Activity Monitor</span>
            <span className="font-semibold sm:hidden">PAM</span>
            <Badge variant={backendStatus === 'available' ? 'success' : 'destructive'}
              className={`ml-2 text-xs ${backendStatus === 'available' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : ''}`}>
              {backendStatus === 'available' ? 'Online' : 'Offline'}
            </Badge>
          </Link>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className={`text-white hover:text-white hover:bg-white/10 ${isHome ? 'border-b-2 border-cyan-400 rounded-b-none' : ''}`}
            >
              <Home className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Главная</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCommandOpen(true)}
              className="text-white/60 hover:text-white hover:bg-white/10 hidden md:flex items-center gap-2"
            >
              <Search className="h-4 w-4" />
              <span className="text-xs">Поиск...</span>
              <kbd className="ml-1 pointer-events-none inline-flex h-5 items-center gap-1 rounded border border-white/20 bg-white/10 px-1.5 font-mono text-[10px] font-medium">
                Ctrl+K
              </kbd>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="text-white hover:text-white hover:bg-white/10 h-8 w-8"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10">
                  <Avatar className="h-6 w-6 mr-1">
                    <AvatarFallback className="text-[10px] bg-cyan-600 text-white">
                      {currentUser?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline">{currentUser}</span>
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div>{currentUser}</div>
                  <div className="text-xs font-normal text-muted-foreground">{roleLabel}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {userRole === 'admin' && (
                  <DropdownMenuItem onClick={() => navigate('/users')}>
                    <Users className="mr-2 h-4 w-4" />
                    Управление пользователями
                  </DropdownMenuItem>
                )}
                {(userRole === 'admin' || userRole === 'operator') && (
                  <DropdownMenuItem onClick={() => navigate('/ssh-keys')}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    SSH-ключи
                  </DropdownMenuItem>
                )}
                {(userRole === 'admin' || userRole === 'operator') && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Выход
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Routes>
          <Route exact path="/" element={<ServerList />} />
          <Route path="/server/:name" element={<ServerDetails />} />
          <Route path="/server/:serverName/edit" element={<ServerEdit />} />
          <Route path="/server/:name/db/:db_name" element={<DatabaseDetails />} />
          <Route path="/users" element={userRole === 'admin' ? <UserManagement /> : <Navigate to="/" />} />
          <Route path="/ssh-keys" element={(userRole === 'admin' || userRole === 'operator') ? <SSHKeyManagement /> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <ScrollToTop />

      {/* Session expiration dialog */}
      <Dialog open={showSessionModal} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Сессия истекает
            </DialogTitle>
            <DialogDescription>
              Время вашей сессии подходит к концу
            </DialogDescription>
          </DialogHeader>
          <div className="text-center py-4">
            <div className="text-4xl font-bold tabular-nums">{formatTimeLeft(timeLeft)}</div>
            <p className="text-sm text-muted-foreground mt-2">Хотите продлить сессию или выйти?</p>
          </div>
          <DialogFooter className="flex gap-2 sm:justify-center">
            <Button onClick={refreshToken} disabled={isRefreshing}>
              {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Продолжить
            </Button>
            <Button variant="destructive" onClick={logout}>
              Выйти
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password refresh dialog */}
      <Dialog open={showRefreshLoginModal} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Продление сессии
            </DialogTitle>
            <DialogDescription>
              Введите пароль для пользователя <strong>{currentUser}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              type="password"
              placeholder="Пароль"
              value={refreshPassword}
              onChange={(e) => setRefreshPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && refreshToken()}
            />
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter className="flex gap-2 sm:justify-center">
            <Button onClick={refreshToken} disabled={isRefreshing || !refreshPassword}>
              {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Войти
            </Button>
            <Button variant="destructive" onClick={logout}>
              Выйти
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <ServersProvider>
          <TooltipProvider>
            <AppContent />
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </ServersProvider>
      </AuthProvider>
    </Router>
  );
}
