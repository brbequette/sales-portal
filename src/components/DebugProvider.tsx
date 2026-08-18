"use client";

import React, { Suspense, createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useZoho } from '@/components/ZohoProvider';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DebugEntry {
  id: string;
  timestamp: Date;
  type: 'api' | 'error' | 'info';
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  responseSize?: number;
  error?: string;
  stack?: string[];
  debugPayload?: Record<string, any>;
  detail?: string;
}

interface DebugContextValue {
  isDebug: boolean;
  entries: DebugEntry[];
  debugLog: (entry: Omit<DebugEntry, 'id' | 'timestamp'>) => void;
  clearLog: () => void;
}

const DebugContext = createContext<DebugContextValue>({
  isDebug: false,
  entries: [],
  debugLog: () => {},
  clearLog: () => {},
});

export const useDebug = () => useContext(DebugContext);

// ─── Provider ────────────────────────────────────────────────────────────────

const DEBUG_SESSION_KEY = 'titan_debug_mode';
const MAX_ENTRIES = 200;

function isAdminRole(role?: string): boolean {
  if (!role) return false;
  return role.toLowerCase().includes('admin') || role === 'ADMIN';
}

function DebugProviderInner({ children }: { children: React.ReactNode }) {
  const { zohoContext: user } = useZoho();
  const isAdmin = isAdminRole(user?.role);
  const searchParams = useSearchParams();
  const [isDebug, setIsDebug] = useState(false);
  const [entries, setEntries] = useState<DebugEntry[]>([]);
  const interceptorInstalledRef = useRef(false);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  // Resolve debug mode from URL param or sessionStorage
  useEffect(() => {
    if (!isAdmin) {
      setIsDebug(false);
      return;
    }

    const urlDebug = searchParams?.get('debug') === '1';
    const sessionDebug = typeof window !== 'undefined' &&
      sessionStorage.getItem(DEBUG_SESSION_KEY) === '1';

    if (urlDebug) {
      sessionStorage.setItem(DEBUG_SESSION_KEY, '1');
      setIsDebug(true);
    } else if (sessionDebug) {
      setIsDebug(true);
    } else {
      setIsDebug(false);
    }
  }, [isAdmin, searchParams]);

  // Add a debug log entry
  const debugLog = useCallback((entry: Omit<DebugEntry, 'id' | 'timestamp'>) => {
    const newEntry: DebugEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date(),
    };
    setEntries(prev => {
      const next = [newEntry, ...prev];
      return next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next;
    });
  }, []);

  const clearLog = useCallback(() => setEntries([]), []);

  // ── Fetch Interceptor ──────────────────────────────────────────────────────
  // Monkey-patches global fetch to log all API calls to the debug panel.
  // Only installed once, only when debug mode is active.
  useEffect(() => {
    if (!isDebug || interceptorInstalledRef.current) return;
    interceptorInstalledRef.current = true;

    const originalFetch = window.fetch;

    window.fetch = async function debugFetch(input, init) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

      // Only intercept API calls, not static assets
      if (!url.startsWith('/api/') && !url.includes('/api/')) {
        return originalFetch(input, init);
      }

      const method = init?.method || 'GET';
      const startTime = performance.now();

      try {
        const response = await originalFetch(input, init);
        const durationMs = Math.round(performance.now() - startTime);

        // Clone so we can read the body without consuming it
        const clone = response.clone();
        let debugPayload: Record<string, any> | undefined;
        let responseSize = 0;

        try {
          const text = await clone.text();
          responseSize = text.length;
          const json = JSON.parse(text);
          if (json._debug) {
            debugPayload = json._debug;
          }
        } catch {}

        // Log the API call
        const entry: Omit<DebugEntry, 'id' | 'timestamp'> = {
          type: response.ok ? 'api' : 'error',
          method: method.toUpperCase(),
          url: url.split('?')[0], // strip query params for readability
          status: response.status,
          durationMs,
          responseSize,
          debugPayload,
        };

        if (!response.ok) {
          try {
            const errClone = response.clone();
            const errJson = await errClone.json();
            entry.error = errJson.error || errJson.message || `HTTP ${response.status}`;
          } catch {
            entry.error = `HTTP ${response.status}`;
          }
        }

        // Use the callback form to avoid stale closure
        setEntries(prev => {
          const newEntry: DebugEntry = {
            ...entry,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date(),
          };
          const next = [newEntry, ...prev];
          return next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next;
        });

        return response;
      } catch (error: any) {
        const durationMs = Math.round(performance.now() - startTime);

        setEntries(prev => {
          const newEntry: DebugEntry = {
            type: 'error',
            method: method.toUpperCase(),
            url: url.split('?')[0],
            durationMs,
            error: error?.message || 'Network error',
            stack: error?.stack?.split('\n').slice(0, 5).map((l: string) => l.trim()),
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date(),
          };
          const next = [newEntry, ...prev];
          return next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next;
        });

        throw error;
      }
    } as typeof fetch;

    // Cleanup: restore original fetch on unmount
    return () => {
      window.fetch = originalFetch;
      interceptorInstalledRef.current = false;
    };
  }, [isDebug]);

  return (
    <DebugContext.Provider value={{ isDebug, entries, debugLog, clearLog }}>
      {children}
    </DebugContext.Provider>
  );
}

export function DebugProvider({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={children}>
      <DebugProviderInner>{children}</DebugProviderInner>
    </Suspense>
  );
}
