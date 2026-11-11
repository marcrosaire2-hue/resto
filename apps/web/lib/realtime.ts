'use client';
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Connexion temps réel unique (cookie de session). En production, /socket.io est servi sur le même domaine. */
export function getSocket(): Socket {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;
    socket = io(url, { path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function resetSocket() {
  socket?.disconnect();
  socket = null;
}

/**
 * S'abonne à un flux (commande, restaurant) et appelle `onChange` à chaque événement
 * ET à chaque reconnexion (l'état est alors rechargé depuis l'API, source de vérité).
 * Un rechargement périodique de secours couvre les réseaux qui bloquent les WebSockets.
 */
export function useLive(sub: { type: 'order' | 'restaurant' | 'user' | 'ops'; id: string } | null, events: string[], onChange: () => void, fallbackMs = 30_000) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = sub ? `${sub.type}:${sub.id}` : null;
  useEffect(() => {
    if (!sub) return;
    const s = getSocket();
    // « user » : salon personnel rejoint automatiquement à la connexion (notifications).
    const join = () => { if (sub.type !== 'user') s.emit('subscribe', sub); };
    const handler = () => cb.current();
    const onReconnect = () => { join(); cb.current(); };
    if (s.connected) join();
    s.on('connect', onReconnect);
    events.forEach((e) => s.on(e, handler));
    const timer = setInterval(() => cb.current(), fallbackMs);
    return () => {
      s.off('connect', onReconnect);
      events.forEach((e) => s.off(e, handler));
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
