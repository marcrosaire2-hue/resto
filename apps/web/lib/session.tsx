'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import type { MeResponse } from '@plateforme/contracts';
import { api, ApiError } from './api';

interface SessionState {
  me: MeResponse | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setMe: (me: MeResponse | null) => void;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setMe(await api<MeResponse>('/auth/me'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return <Ctx.Provider value={{ me, loading, refresh, setMe }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession hors de SessionProvider');
  return v;
}
