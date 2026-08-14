"use client";

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useDebug, type DebugEntry } from '@/components/DebugProvider';
import { FiBug, FiX, FiCopy, FiTrash2, FiChevronDown, FiChevronRight, FiAlertTriangle, FiActivity, FiServer } from 'react-icons/fi';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusColor(status?: number): string {
  if (!status) return 'text-neutral-400';
  if (status < 300) return 'text-emerald-400';
  if (status < 400) return 'text-amber-400';
  return 'text-red-400';
}

function durationColor(ms?: number): string {
  if (!ms) return 'text-neutral-500';
  if (ms < 200) return 'text-emerald-500';
  if (ms < 1000) return 'text-amber-500';
  return 'text-red-500';
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

// ─── Entry Row ───────────────────────────────────────────────────────────────

function EntryRow({ entry }: { entry: DebugEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono hover:bg-white/5 transition-colors text-left"
      >
        {expanded ? <FiChevronDown size={10} className="shrink-0 text-neutral-500" /> : <FiChevronRight size={10} className="shrink-0 text-neutral-500" />}

        <span className="text-neutral-600 w-[60px] shrink-0">{formatTime(entry.timestamp)}</span>

        {entry.type === 'error' && !entry.method && (
          <FiAlertTriangle size={10} className="text-red-400 shrink-0" />
        )}

        {entry.method && (
          <span className="text-blue-400 w-[36px] shrink-0 text-right">{entry.method}</span>
        )}

        <span className="text-neutral-300 truncate flex-1 min-w-0">
          {entry.url || entry.detail || entry.error || '—'}
        </span>

        {entry.status != null && (
          <span className={`${statusColor(entry.status)} w-[28px] text-right shrink-0`}>{entry.status}</span>
        )}

        {entry.durationMs != null && (
          <span className={`${durationColor(entry.durationMs)} w-[48px] text-right shrink-0`}>{entry.durationMs}ms</span>
        )}

        {entry.responseSize != null && entry.responseSize > 0 && (
          <span className="text-neutral-600 w-[44px] text-right shrink-0">{formatBytes(entry.responseSize)}</span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-2 text-[10px] font-mono space-y-1">
          {entry.error && (
            <div className="text-red-400">⚠ {entry.error}</div>
          )}
          {entry.stack && entry.stack.length > 0 && (
            <div className="text-neutral-600 pl-2 border-l border-red-500/30 space-y-0.5">
              {entry.stack.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
          {entry.debugPayload && (
            <details className="group">
              <summary className="text-amber-400 cursor-pointer hover:text-amber-300">
                _debug payload
              </summary>
              <pre className="text-neutral-500 mt-1 pl-2 border-l border-amber-500/30 whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
                {JSON.stringify(entry.debugPayload, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Environment Panel ───────────────────────────────────────────────────────

function EnvSection({ envData }: { envData: Record<string, boolean> | null }) {
  if (!envData) return <div className="text-neutral-600 text-[10px] px-3 py-2 font-mono">Loading...</div>;

  return (
    <div className="px-3 py-2 space-y-0.5 text-[10px] font-mono">
      {Object.entries(envData).map(([key, present]) => (
        <div key={key} className="flex items-center gap-2">
          <span className={present ? 'text-emerald-500' : 'text-red-500'}>
            {present ? '✅' : '❌'}
          </span>
          <span className={present ? 'text-neutral-400' : 'text-red-400'}>{key}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function DebugPanel() {
  const { isDebug, entries, clearLog } = useDebug();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'api' | 'errors' | 'env'>('api');
  const [envData, setEnvData] = useState<Record<string, boolean> | null>(null);
  const [envLoaded, setEnvLoaded] = useState(false);

  // Fetch env snapshot when env tab is first opened
  const loadEnv = () => {
    if (envLoaded) return;
    setEnvLoaded(true);
    fetch('/api/debug/env?debug=1')
      .then(r => r.json())
      .then(d => setEnvData(d._debug?.env || d.env || null))
      .catch(() => setEnvData(null));
  };

  const apiEntries = useMemo(() => entries.filter(e => e.type === 'api'), [entries]);
  const errorEntries = useMemo(() => entries.filter(e => e.type === 'error'), [entries]);

  const copyAll = () => {
    const text = entries.map(e => {
      const parts = [formatTime(e.timestamp)];
      if (e.method) parts.push(e.method);
      if (e.url) parts.push(e.url);
      if (e.status) parts.push(`${e.status}`);
      if (e.durationMs) parts.push(`${e.durationMs}ms`);
      if (e.error) parts.push(`ERROR: ${e.error}`);
      if (e.debugPayload) parts.push(`DEBUG: ${JSON.stringify(e.debugPayload)}`);
      return parts.join(' | ');
    }).join('\n');
    navigator.clipboard.writeText(text);
  };

  if (!isDebug) return null;

  // Minimized badge
  if (!isOpen) {
    return createPortal(
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-[999] flex items-center gap-2 px-3 py-2 rounded-full bg-neutral-900/95 border border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:scale-105 active:scale-95 transition-all text-xs font-bold text-amber-400 backdrop-blur-xl"
      >
        <FiBug size={14} />
        <span className="font-mono">DEBUG</span>
        {errorEntries.length > 0 && (
          <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {errorEntries.length}
          </span>
        )}
        {apiEntries.length > 0 && errorEntries.length === 0 && (
          <span className="text-neutral-500 font-mono text-[10px]">{entries.length}</span>
        )}
      </button>,
      document.body
    );
  }

  // Full panel
  return createPortal(
    <div className="fixed bottom-4 left-4 z-[1001] w-[480px] max-h-[520px] flex flex-col bg-neutral-950/98 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.8)] overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-neutral-900/90 shrink-0">
        <div className="flex items-center gap-2">
          <FiBug size={14} className="text-amber-400" />
          <span className="text-xs font-black uppercase text-white tracking-wider">Debug Mode</span>
          <span className="text-[10px] font-mono text-neutral-500">{entries.length} entries</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={copyAll} title="Copy all" className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-neutral-400 hover:text-white">
            <FiCopy size={12} />
          </button>
          <button onClick={clearLog} title="Clear" className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-neutral-400 hover:text-white">
            <FiTrash2 size={12} />
          </button>
          <button onClick={() => setIsOpen(false)} title="Minimize" className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-neutral-400 hover:text-white">
            <FiX size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 shrink-0">
        {([
          { key: 'api', label: 'API Calls', icon: FiActivity, count: apiEntries.length },
          { key: 'errors', label: 'Errors', icon: FiAlertTriangle, count: errorEntries.length },
          { key: 'env', label: 'Environment', icon: FiServer, count: 0 },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              if (tab.key === 'env') loadEnv();
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              activeTab === tab.key
                ? 'text-amber-400 border-b-2 border-amber-400 bg-white/5'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <tab.icon size={11} />
            {tab.label}
            {tab.count > 0 && (
              <span className={`min-w-[16px] h-[16px] rounded-full text-[9px] font-bold flex items-center justify-center px-1 ${
                tab.key === 'errors' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-neutral-400'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === 'api' && (
          apiEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-600">
              <FiActivity size={24} className="mb-2 opacity-40" />
              <span className="text-xs">No API calls captured yet</span>
              <span className="text-[10px] mt-1">Navigate or interact to see requests</span>
            </div>
          ) : (
            apiEntries.map(entry => <EntryRow key={entry.id} entry={entry} />)
          )
        )}

        {activeTab === 'errors' && (
          errorEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-600">
              <FiAlertTriangle size={24} className="mb-2 opacity-40" />
              <span className="text-xs">No errors captured</span>
            </div>
          ) : (
            errorEntries.map(entry => <EntryRow key={entry.id} entry={entry} />)
          )
        )}

        {activeTab === 'env' && (
          <EnvSection envData={envData} />
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-white/5 bg-neutral-900/50 shrink-0">
        <div className="flex items-center justify-between text-[9px] font-mono text-neutral-600">
          <span>?debug=1 • Admin only • sessionStorage persisted</span>
          <button
            onClick={() => {
              sessionStorage.removeItem('titan_debug_mode');
              window.location.reload();
            }}
            className="text-red-500/60 hover:text-red-400 transition-colors"
          >
            Exit Debug
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
