'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface LiveBrowserViewProps {
  applicationId: string;
  controlMode: string;
  browserSessionReady?: boolean;
}

function mapClickToCanvasPixels(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || canvas.width <= 0 || canvas.height <= 0) {
    return null;
  }

  const x = ((clientX - rect.left) / rect.width) * canvas.width;
  const y = ((clientY - rect.top) / rect.height) * canvas.height;

  return {
    x,
    y,
    viewportWidth: canvas.width,
    viewportHeight: canvas.height,
  };
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

  useEffect(() => {
    if (controlMode === 'human_control') {
      canvasRef.current?.focus();
    }
  }, [controlMode]);

  const sendInput = (message: Record<string, unknown>) => {
    if (controlMode !== 'human_control') return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const handlePointerClick = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mapped = mapClickToCanvasPixels(canvas, clientX, clientY);
    if (!mapped) return;
    sendInput({
      type: 'click',
      x: mapped.x,
      y: mapped.y,
      viewportWidth: mapped.viewportWidth,
      viewportHeight: mapped.viewportHeight,
    });
  };

  return (
    <div className="relative flex h-full min-h-[420px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-black dark:border-[#22242a]">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs text-slate-300">
        <span>{connected ? 'Live' : 'Connecting…'}</span>
        <span>
          {controlMode === 'human_control'
            ? 'You have control — click to focus fields, then type'
            : 'AI is in control'}
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
            tabIndex={controlMode === 'human_control' ? 0 : -1}
            className="mx-auto block max-w-full cursor-crosshair outline-none"
            onMouseDown={(event) => {
              if (controlMode !== 'human_control') return;
              event.preventDefault();
              handlePointerClick(event.clientX, event.clientY);
              canvasRef.current?.focus();
            }}
            onKeyDown={(event) => {
              if (controlMode !== 'human_control') return;
              event.preventDefault();
              if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                sendInput({ type: 'type', text: event.key });
                return;
              }
              sendInput({ type: 'keydown', key: event.key });
            }}
            onWheel={(event) => {
              if (controlMode !== 'human_control') return;
              event.preventDefault();
              sendInput({ type: 'scroll', deltaY: event.deltaY });
            }}
          />
        </div>
      )}
    </div>
  );
}
