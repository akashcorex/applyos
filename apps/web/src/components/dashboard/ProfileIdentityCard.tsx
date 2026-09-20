'use client';

import { useEffect, useRef, useState } from 'react';

import { ProfileIdentityForm } from './ProfileIdentityForm';
import { ProfileIdentityRead } from './ProfileIdentityRead';

import type { ProfileIdentityValues } from './profile-identity-helpers';
import type { ProfileIdentityPatch } from './profile-types';

interface ProfileIdentityCardProps extends ProfileIdentityValues {
  saving: boolean;
  saved: boolean;
  error: string | null;
  openEditSignal?: number;
  onChange: (patch: ProfileIdentityPatch) => void;
  onSave: () => void;
}

/**
 * Thin orchestrator: owns the read/edit toggle, delegates rendering to
 * ProfileIdentityRead / ProfileIdentityForm. Shared display helpers live
 * in profile-identity-helpers.
 */
export function ProfileIdentityCard(props: ProfileIdentityCardProps) {
  const { saving, saved, error, onChange, onSave, openEditSignal, ...values } =
    props;

  const [editing, setEditing] = useState(false);
  const firstSignal = useRef(openEditSignal ?? 0);
  useEffect(() => {
    const signal = openEditSignal ?? 0;
    if (signal !== 0 && signal !== firstSignal.current) {
      firstSignal.current = signal;
      setEditing(true);
    }
  }, [openEditSignal]);

  // Single edit mode: one Edit button controls all sections, one Save/Cancel.
  if (editing) {
    return (
      <ProfileIdentityForm
        values={values}
        saving={saving}
        saved={saved}
        error={error}
        onChange={onChange}
        onSave={onSave}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <ProfileIdentityRead values={values} onEdit={() => setEditing(true)} />
  );
}
