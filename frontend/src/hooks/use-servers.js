import { useContext } from 'react';
import { ServersContext } from '@/contexts/servers-context';

export function useServers() {
  const context = useContext(ServersContext);
  if (!context) {
    throw new Error('useServers must be used within a ServersProvider');
  }
  return context;
}
