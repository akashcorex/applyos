'use client';

import { useState } from 'react';

import { DitherAvatar } from '@/components/dither-kit/avatar';

import { avatarSrc } from './profile-tiers';

interface UserAvatarProps {
  name: string;
  /** Seed for the generated fallback — email preferred (stable). */
  email?: string;
  /** user.image: external OAuth URL or an uploaded-photo filename. */
  image?: string | null;
  size: number;
  /** Bump to bust the uploaded-photo cache after a new upload. */
  cacheBust?: number;
  className?: string;
}

/**
 * The one avatar used everywhere: uploaded photo → OAuth image → generated
 * dither glyph. Broken images degrade to the generated glyph automatically.
 */
export function UserAvatar({
  name,
  email,
  image,
  size,
  cacheBust,
  className,
}: UserAvatarProps) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : avatarSrc(image, cacheBust);
  const seed = email || name;

  if (!src) {
    return (
      <DitherAvatar
        name={seed}
        size={size}
        bloom="high"
        className={className}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- dynamic user photo
    <img
      src={src}
      alt={`${name} avatar`}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`rounded-full object-cover ${className ?? ''}`}
      style={{ width: size, height: size }}
    />
  );
}
