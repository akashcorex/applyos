'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface LiveBrowserViewProps {
  applicationId: string;
  controlMode: string;
  browserSessionReady?: boolean;
}

export function LiveBrowserView({
  applicationId,
  controlMode,
  browserSessionReady = true,
}: LiveBrowserViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!browserSessionReady) {
      setError(null);
      setConnected(false);
      return;
    }

    setError(null);
    try {
      const res = await fetch(
        `/api/applications/${encodeURIComponent(applicationId)}/browser-token`,
        { method: 'POST' },
      );
      const data = (await res.json()) as { wsUrl?: string; error?: string };
      if (!res.ok || !data.wsUrl) {
        const message = data.error || 'Browser session not ready';
        setError(message);
        if (res.status === 409 || message.includes('not ready')) {
          retryRef.current = setTimeout(() => void connect(), 2000);
        }
        return;
      }

      const ws = new WebSocket(data.wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
      };
      ws.onclose = () => {
        setConnected(false);
        if (browserSessionReady) {
          retryRef.current = setTimeout(() => void connect(), 3000);
        }
      };
      ws.onerror = () => {
        setError('Live browser connection failed');
        setConnected(false);
      };
      ws.onmessage = (event) => {
        const canvas = canvasRef.current;
        if (!canvas || !(event.data instanceof ArrayBuffer)) return;
        const blob = new Blob([event.data], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
        };
        img.src = url;
      };
    } catch {
      setError('Could not connect to live browser');
      retryRef.current = setTimeout(() => void connect(), 3000);
    }
  }, [applicationId, browserSessionReady]);

  useEffect(() => {
    void connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const sendInput = (message: Record<string, unknown>) => {
    if (controlMode !== 'human_control') return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  return (
    <div className="relative flex h-full min-h-[420px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-black dark:border-[#22242a]">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs text-slate-300">
        <span>{connected ? 'Live' : 'Connecting…'}</span>
        <span>
          {controlMode === 'human_control' ? 'You have control' : 'AI is in control'}
        </span>
      </div>
      {error && !connected ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-amber-400">
          {error}
        </div>
      ) : (
        <div className="relative flex-1 overflow-auto bg-[#111]">
          <canvas
            ref={canvasRef}
            className="mx-auto max-w-full cursor-crosshair"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              sendInput({
                type: 'click',
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
                viewportWidth: rect.width,
                viewportHeight: rect.height,
              });
            }}
            onWheel={(event) => {
              sendInput({ type: 'scroll', deltaY: event.deltaY });
            }}
          />
        </div>
      )}
    </div>
  );
}
