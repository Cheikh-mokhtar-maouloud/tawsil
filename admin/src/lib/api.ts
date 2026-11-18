"use client";

import { useCallback, useEffect, useState } from "react";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
const TOKEN_KEY = "tawsil_admin_token";
const ADMIN_KEY = "tawsil_admin";

export type AdminRole = "admin" | "support" | "accountant";
export type Admin = { id: number; username: string; name: string; role: AdminRole };

export const auth = {
  token: () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY)),
  admin: (): Admin | null => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(localStorage.getItem(ADMIN_KEY) || "null");
    } catch {
      return null;
    }
  },
  save: (token: string, admin: Admin) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = auth.token();
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: options.method || "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, `تعذر الاتصال بالخادم (${API_URL}). تأكد أنه يعمل.`);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/admin/login")) {
    auth.clear();
    window.location.href = "/login";
  }
  if (!res.ok) throw new ApiError(res.status, data.error || "حدث خطأ");
  return data as T;
}

/** يجلب بيانات ويعيد تحميلها عند الطلب */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

export const mediaSrc = (url: string | null | undefined) => (!url ? "" : /^https?:/.test(url) ? url : API_URL + url);
