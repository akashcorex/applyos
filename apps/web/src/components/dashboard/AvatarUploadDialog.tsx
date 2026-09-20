'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Loader2, Trash2, UploadCloud, X } from 'lucide-react';

import { Button } from '@applyso/ui/button';

import { UserAvatar } from './UserAvatar';

const VIEW = 300; // crop viewport px
const OUTPUT = 512; // exported avatar px
const MAX_BYTES = 2 * 1024 * 1024;

interface AvatarUploadDialogProps {
  name: string;
  email: string;
  image?: string | null;
  cacheBust?: number;
  onClose: () => void;
  /** Called after a successful upload/remove so the parent can refresh. */
  onChanged: () => void;
}

type CropState = {
  url: string;
  width: number;
  height: number;
  zoom: number;
  offset: { x: number; y: number };
};

function coverScale(state: { width: number; height: number; zoom: number }) {
  return Math.max(VIEW / state.width, VIEW / state.height) * state.zoom;
}

function clampOffset(
  offset: { x: number; y: number },
  state: { width: number; height: number; zoom: number },
) {
  const scale = coverScale(state);
  const rw = state.width * scale;
  const rh = state.height * scale;
  return {
    x: Math.min(0, Math.max(VIEW - rw, offset.x)),
    y: Math.min(0, Math.max(VIEW - rh, offset.y)),
  };
}

export function AvatarUploadDialog({
  name,
  email,
  image,
  cacheBust,
  onClose,
  onChanged,
}: AvatarUploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasCustomImage = Boolean(image && !image.startsWith('http'));

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose, busy]);

  useEffect(() => {
    return () => {
      if (crop) URL.revokeObjectURL(crop.url);
    };
  }, [crop]);

  const loadFile = useCallback((file: File) => {
    setError(null);
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setError('Use a PNG, JPEG or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES * 4) {
      // Raw input can exceed 2 MB — we re-encode to WebP before upload — but
      // keep a sane ceiling so huge photos don't hang the tab.
      setError('That image is very large — pick one under 8 MB.');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const next = {
        url,
        width: img.naturalWidth,
        height: img.naturalHeight,
        zoom: 1,
        offset: { x: 0, y: 0 },
      };
      const scale = coverScale(next);
      next.offset = clampOffset(
        {
          x: (VIEW - next.width * scale) / 2,
          y: (VIEW - next.height * scale) / 2,
        },
        next,
      );
      setCrop((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return next;
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError('Could not read that image.');
    };
    img.src = url;
  }, []);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!crop) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: crop.offset.x,
      baseY: crop.offset.y,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setCrop((current) =>
      current
        ? {
            ...current,
            offset: clampOffset(
              {
                x: drag.baseX + (event.clientX - drag.startX),
                y: drag.baseY + (event.clientY - drag.startY),
              },
              current,
            ),
          }
        : current,
    );
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  async function exportAndUpload() {
    if (!crop) return;
    setBusy('upload');
    setError(null);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = crop.url;
      });
      const scale = coverScale(crop);
      const sourceSize = VIEW / scale;
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no-canvas');
      // Re-encoding through canvas strips EXIF metadata as a side effect.
      ctx.drawImage(
        img,
        -crop.offset.x / scale,
        -crop.offset.y / scale,
        sourceSize,
        sourceSize,
        0,
        0,
        OUTPUT,
        OUTPUT,
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.92),
      );
      if (!blob) throw new Error('encode-failed');
      if (blob.size > MAX_BYTES) {
        setError('Cropped image is still over 2 MB — zoom out a little.');
        return;
      }
      const body = new FormData();
      body.append('file', blob, 'avatar.webp');
      const res = await fetch('/api/profiles/avatar', {
        method: 'POST',
        body,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Upload failed — try again.');
        return;
      }
      onChanged();
      onClose();
    } catch {
      setError('Upload failed — try again.');
    } finally {
      setBusy(null);
    }
  }

  async function removeAvatar() {
    setBusy('remove');
    setError(null);
    try {
      const res = await fetch('/api/profiles/avatar', { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? 'Could not remove photo.');
        return;
      }
      onChanged();
      onClose();
    } catch {
      setError('Could not remove photo.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profile photo"
        className="w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-background shadow-2xl dark:border-[#22242a]"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Profile photo</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={busy !== null}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          {!crop ? (
            <div className="flex flex-col items-center gap-4">
              <UserAvatar
                name={name}
                email={email}
                image={image}
                size={96}
                cacheBust={cacheBust}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-border p-4 text-xs font-medium text-slate-600 dark:text-[#c5c8d2] transition-colors hover:border-slate-300 hover:border-muted-foreground/40 hover:bg-slate-50/60 dark:hover:bg-[#18191c]"
              >
                <UploadCloud className="h-4 w-4 text-slate-400" />
                Choose a photo
                <span className="font-mono text-[11px] text-slate-400">
                  PNG · JPEG · WebP
                </span>
              </button>
              {hasCustomImage ? (
                <button
                  type="button"
                  onClick={() => void removeAvatar()}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-red-500 hover:underline disabled:opacity-60"
                >
                  {busy === 'remove' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  Remove photo
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div
                className="relative mx-auto touch-none overflow-hidden rounded-full border border-border"
                style={{ width: VIEW, height: VIEW, cursor: 'grab' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL for cropping */}
                <img
                  src={crop.url}
                  alt="Crop preview"
                  draggable={false}
                  className="absolute max-w-none select-none"
                  style={{
                    width: crop.width * coverScale(crop),
                    height: crop.height * coverScale(crop),
                    transform: `translate(${crop.offset.x}px, ${crop.offset.y}px)`,
                  }}
                />
              </div>
              <label className="flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
                Zoom
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={crop.zoom}
                  onChange={(event) =>
                    setCrop((current) => {
                      if (!current) return current;
                      const zoom = Number(event.target.value);
                      const next = { ...current, zoom };
                      return { ...next, offset: clampOffset(next.offset, next) };
                    })
                  }
                  className="h-1 flex-1 accent-cyan-500"
                />
              </label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={busy !== null}
                  onClick={() => void exportAndUpload()}
                >
                  {busy === 'upload' ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    'Save photo'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => setCrop(null)}
                >
                  Back
                </Button>
              </div>
            </div>
          )}

          {error ? <p className="text-[11px] text-red-500">{error}</p> : null}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) loadFile(file);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
