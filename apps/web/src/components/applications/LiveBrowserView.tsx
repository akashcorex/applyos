'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface LiveBrowserViewProps {
  applicationId: string;
  controlMode: string;
  onControlModeChange?: (mode: string) => void;
}

export function LiveBrowserView({
  applicationId,
  controlMode,
}: LiveBrowserViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(
        `/api/applications/${encodeURIComponent(applicationId)}/browser-token`,
        { method: 'POST' },
      );
      const data = (await res.json()) as { wsUrl?: string; error?: string };
      if (!res.ok || !data.wsUrl) {
        setError(data.error || 'Browser session not ready');
        return;
      }

      const ws = new WebSocket(data.wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => setConnected(false);
      ws.onerror = () => setError('Live browser connection failed');
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
    }
  }, [applicationId]);

  useEffect(() => {
    void connect();
    return () => {
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
      {error ? (
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
