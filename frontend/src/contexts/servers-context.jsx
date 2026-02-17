import { createContext, useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { SERVERS_REFRESH_INTERVAL } from '@/lib/constants';
import { useAuth } from '@/hooks/use-auth';

export const ServersContext = createContext(null);

export function ServersProvider({ children }) {
  const { token } = useAuth();
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(SERVERS_REFRESH_INTERVAL);
  const [timeLeft, setTimeLeft] = useState(SERVERS_REFRESH_INTERVAL / 1000);
  const [paused, setPaused] = useState(false);

  const fetchServers = useCallback(async () => {
    if (!token) {
      setServers([]);
      setLoading(false);
      return;
    }
    try {
      const response = await api.get('/servers');
      setServers(response.data);
    } catch {
      // ошибки авторизации обрабатываются interceptor'ом
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setServers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchServers();
    const interval = setInterval(() => {
      if (!paused) {
        fetchServers();
        setTimeLeft(refreshInterval / 1000);
      }
    }, refreshInterval);
    const timer = setInterval(() => {
      if (!paused) setTimeLeft(prev => (prev > 0 ? prev - 1 : refreshInterval / 1000));
    }, 1000);
    return () => { clearInterval(interval); clearInterval(timer); };
  }, [token, refreshInterval, paused, fetchServers]);

  return (
    <ServersContext.Provider value={{
      servers, loading, timeLeft, refreshInterval,
      setRefreshInterval: (ms) => { setRefreshInterval(ms); setTimeLeft(ms / 1000); },
      setPaused, refresh: fetchServers,
    }}>
      {children}
    </ServersContext.Provider>
  );
}
