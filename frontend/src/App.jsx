import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate, useLocation } from 'react-router-dom';
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
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AlertCircle, Loader2 } from 'lucide-react';
import { formatTimeLeft } from '@/lib/format';
import { ServersProvider } from '@/contexts/servers-context';
import AppSidebar from './components/AppSidebar';
import CommandPalette from './components/CommandPalette';
import Login from './components/Login';
import ServerList from './components/ServerList';
import ServerDetails from './components/ServerDetails';
import ServerEdit from './components/ServerEdit';
import DatabaseDetails from './components/DatabaseDetails';
import UserManagement from './components/UserManagement';
import SSHKeyManagement from './components/SSHKeyManagement';
import SessionAudit from './components/SessionAudit';
import Settings from './components/Settings';
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from './components/ErrorBoundary';

function AppContent() {
  const {
    token, userRole, backendStatus,
    showSessionModal,
    timeLeft, isRefreshing, error,
    login, logout, refreshToken,
    setShowSessionModal,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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
        <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--sidebar-background))]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-sidebar-foreground/60">Подключение к серверу...</p>
          </div>
        </div>
      );
    }
    return <Login onLogin={login} error={error} backendStatus={backendStatus} />;
  }

  return (
    <SidebarProvider>
      <AppSidebar onSearchOpen={() => setCommandOpen(true)} />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        <div className="flex-1 px-6 py-4">
          <Routes>
            <Route exact path="/" element={<ServerList />} />
            <Route path="/server/:name" element={<ServerDetails />} />
            <Route path="/server/:serverName/edit" element={<ServerEdit />} />
            <Route path="/server/:name/db/:db_name" element={<DatabaseDetails />} />
            <Route path="/users" element={userRole === 'admin' ? <UserManagement /> : <Navigate to="/" />} />
            <Route path="/ssh-keys" element={(userRole === 'admin' || userRole === 'operator') ? <SSHKeyManagement /> : <Navigate to="/" />} />
            <Route path="/audit" element={userRole === 'admin' ? <SessionAudit /> : <Navigate to="/" />} />
            <Route path="/settings" element={userRole === 'admin' ? <Settings /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </SidebarInset>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <ScrollToTop />

      {/* Session expiration dialog */}
      <Dialog open={showSessionModal} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-status-warning" />
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

    </SidebarProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
