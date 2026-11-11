'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from './api';

/** Chargement d'une ressource GET avec états chargement / erreur / introuvable. */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: ApiError | null }>({ data: null, loading: !!path, error: null });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    // Rafraîchissement : on garde les données affichées (pas de clignotement) ; « loading » ne vaut vrai qu'au premier chargement.
    setState((s) => ({ ...s, loading: s.data === null, error: null }));
    api<T>(path)
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((e) => alive && setState({ data: null, loading: false, error: e instanceof ApiError ? e : new ApiError(0, 'ERROR', 'Erreur inattendue.') }));
    return () => { alive = false; };
  }, [path, nonce]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}

export const fcfa = (n: number) => `${new Intl.NumberFormat('fr-FR').format(n)} FCFA`;
