import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Shop, User } from '../types';
const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}>({} as never);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const cache = useQueryClient();
  const reload = async () => {
    const r = await api.get('/auth/me');
    setUser(r.data.data);
  };
  useEffect(() => {
    let active = true;
    api
      .get('/auth/me')
      .catch(async () => {
        await api.post('/auth/refresh');
        return api.get('/auth/me');
      })
      .then((r) => {
        if (active) setUser(r.data.data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    const expired = () => {
      setUser(null);
      cache.clear();
    };
    window.addEventListener('session-expired', expired);
    return () => {
      active = false;
      window.removeEventListener('session-expired', expired);
    };
  }, [cache]);
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        reload,
        signIn: async (email, password) => {
          const r = await api.post('/auth/login', { email, password });
          cache.clear();
          setUser(r.data.data);
        },
        signOut: async () => {
          await api.post('/auth/logout');
          setUser(null);
          cache.clear();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
export function useShop() {
  const { user } = useAuth();
  return useQuery<Shop>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data.data,
    enabled: !!user,
    staleTime: 60000,
  });
}
