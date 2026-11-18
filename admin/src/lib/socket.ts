"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL, auth } from "./api";

let socket: Socket | null = null;

export function getSocket() {
  if (!socket && typeof window !== "undefined" && auth.token()) {
    socket = io(API_URL, { auth: { token: auth.token() }, transports: ["websocket"] });
  }
  return socket;
}

export function closeSocket() {
  socket?.close();
  socket = null;
}

/** يستمع لحدث مباشر من الخادم (طلب جديد، شكوى، موقع موصّل...) */
export function useSocketEvent<T = unknown>(event: string, handler: (data: T) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const h = (d: T) => ref.current(d);
    s.on(event, h);
    return () => {
      s.off(event, h);
    };
  }, [event]);
}
