import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL, tokenStore } from './api';
import { useAuth } from './auth';

const SocketContext = createContext<Socket | null>(null);

/** اتصال مباشر بالخادم: العروض، الرسائل، الموقع، المكالمات */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!user) return;
    const s = io(API_URL, { auth: { token: tokenStore.get() }, transports: ['websocket'], reconnection: true });
    setSocket(s); // eslint-disable-line react-hooks/set-state-in-effect -- اتصال خارجي يُنشأ بعد الدخول
    return () => {
      s.close();
      setSocket(null);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);

export function useSocketEvent<T = unknown>(event: string, handler: (data: T) => void) {
  const socket = useSocket();
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!socket) return;
    const h = (d: T) => ref.current(d);
    socket.on(event, h);
    return () => {
      socket.off(event, h);
    };
  }, [socket, event]);
}

/** الانضمام لغرفة الطلب (يعاد عند إعادة الاتصال) */
export function useOrderRoom(orderId: number | null) {
  const socket = useSocket();
  useEffect(() => {
    if (!socket || !orderId) return;
    const join = () => socket.emit('order:join', orderId);
    join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      socket.emit('order:leave', orderId);
    };
  }, [socket, orderId]);
}
