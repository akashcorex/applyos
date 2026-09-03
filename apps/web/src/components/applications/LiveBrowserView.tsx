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
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    canvas.width <= 0 ||
    canvas.height <= 0
  ) {
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
  const controlModeRef = useRef(controlMode);
  const [connected, setConnected] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    controlModeRef.current = controlMode;
  }, [controlMode]);

  const clearRetry = () => {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
  };

  const closeSocket = () => {
    const ws = wsRef.current;
    if (!ws) return;
    ws.onopen = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    try {
      ws.close();
    } catch {
      // ignore
    }
    wsRef.current = null;
  };

  const connect = useCallback(async () => {
    clearRetry();
    closeSocket();

    if (!browserSessionReady) {
      setError(null);
      setConnected(false);
      setHasFrame(false);
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
        setConnected(false);
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
        if (!canvas) return;

        let buffer: ArrayBuffer | null = null;
        if (event.data instanceof ArrayBuffer) {
          buffer = event.data;
        } else if (event.data instanceof Blob) {
          void event.data.arrayBuffer().then((ab) => {
            paintFrame(canvas, ab);
          });
          return;
        }
        if (!buffer) return;
        paintFrame(canvas, buffer);
      };
    } catch {
      setError('Could not connect to live browser');
      setConnected(false);
      retryRef.current = setTimeout(() => void connect(), 3000);
    }
  }, [applicationId, browserSessionReady]);

  const paintFrame = (canvas: HTMLCanvasElement, buffer: ArrayBuffer) => {
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return;
      }
      if (canvas.width !== img.width || canvas.height !== img.height) {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      setHasFrame(true);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  useEffect(() => {
    void connect();
    return () => {
      clearRetry();
      closeSocket();
    };
  }, [connect]);

  useEffect(() => {
    if (controlMode === 'human_control') {
      canvasRef.current?.focus();
    }
  }, [controlMode, hasFrame]);

  const sendInput = (message: Record<string, unknown>) => {
    if (controlModeRef.current !== 'human_control') return;
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

  const interactive = controlMode === 'human_control' && hasFrame;

  return (
    <div className="relative flex h-full min-h-[420px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-black dark:border-[#22242a]">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs text-slate-300">
        <span>
          {connected
            ? hasFrame
              ? 'Live'
              : 'Connected — waiting for video…'
            : 'Connecting…'}
        </span>
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
        <div className="relative flex-1 overflow-hidden bg-[#111]">
          {!hasFrame ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-sm text-slate-400">
              {connected
                ? 'Waiting for browser frames…'
                : 'Connecting to live browser…'}
            </div>
          ) : null}
          <canvas
            ref={canvasRef}
            tabIndex={interactive ? 0 : -1}
            className={`mx-auto block max-h-full max-w-full outline-none ${
              interactive ? 'cursor-crosshair' : 'cursor-default'
            }`}
            onMouseDown={(event) => {
              if (!interactive) return;
              event.preventDefault();
              canvasRef.current?.focus();
              handlePointerClick(event.clientX, event.clientY);
            }}
            onKeyDown={(event) => {
              if (!interactive) return;
              event.preventDefault();
              if (
                event.key.length === 1 &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey
              ) {
                sendInput({ type: 'type', text: event.key });
                return;
              }
              sendInput({ type: 'keydown', key: event.key });
            }}
            onWheel={(event) => {
              if (!interactive) return;
              event.preventDefault();
              event.stopPropagation();
              sendInput({ type: 'scroll', deltaY: event.deltaY });
            }}
          />
        </div>
      )}
    </div>
  );
}
