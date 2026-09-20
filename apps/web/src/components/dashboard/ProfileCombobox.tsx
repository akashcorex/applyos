'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { cn } from '@applyso/ui';
import { Input } from '@applyso/ui/input';

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ProfileComboboxProps {
  id?: string;
  value: string;
  items: (string | ComboboxOption)[];
  placeholder?: string;
  emptyText?: string;
  allowCustom?: boolean;
  onChange: (next: string) => void;
}

function normalize(items: (string | ComboboxOption)[]): ComboboxOption[] {
  return items.map((item) =>
    typeof item === 'string' ? { value: item, label: item } : item,
  );
}

/** Display text for a stored value: option label, or a fallback. */
function labelFor(options: ComboboxOption[], value: string): string {
  const match = options.find((option) => option.value === value);
  if (match) return match.label;
  if (/^\d+$/.test(value)) return `${value} years`;
  return value;
}

/**
 * Editable combobox: typable input with a filtered suggestion list.
 * - Typing filters options; Enter/click picks one (commits its value).
 * - Options can carry a separate display label (e.g. ranges like
 *   "1–3 years" that commit a representative value like "2").
 * - With `allowCustom`, any typed text can be committed (blur/Enter).
 */
export function ProfileCombobox({
  id,
  value,
  items,
  placeholder,
  emptyText = 'No items found.',
  allowCustom = true,
  onChange,
}: ProfileComboboxProps) {
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const options = useMemo(() => normalize(items), [items]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(() => labelFor(options, value));
  const [highlight, setHighlight] = useState(-1);

  useEffect(() => {
    setQuery(labelFor(options, value));
  }, [options, value]);

  const currentLabel = labelFor(options, value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    // If the input still shows the selected option's label, the user just
    // opened the list (focus / chevron) without typing — show everything.
    // Otherwise the list stays narrowed to the one selection and the
    // dropdown looks broken.
    if (q === currentLabel.trim().toLowerCase()) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(q) ||
        option.value.toLowerCase().includes(q),
    );
  }, [options, query, currentLabel]);

  const trimmedQuery = query.trim();
  const showCustomOption =
    allowCustom &&
    trimmedQuery !== '' &&
    !options.some(
      (option) =>
        option.label.toLowerCase() === trimmedQuery.toLowerCase() ||
        option.value.toLowerCase() === trimmedQuery.toLowerCase(),
    );

  const optionCount = filtered.length + (showCustomOption ? 1 : 0);

  useEffect(() => {
    if (!open) {
      setHighlight(-1);
      return;
    }
    setHighlight(optionCount > 0 ? 0 : -1);
  }, [open, optionCount]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setQuery(labelFor(options, value));
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [options, value]);

  function commitValue(next: string, display: string) {
    onChange(next.trim());
    setQuery(display);
    setOpen(false);
  }

  /** Commit free-typed text: resolve to an option value on exact match. */
  function commitText(text: string) {
    const trimmed = text.trim();
    const exact = options.find(
      (option) =>
        option.label.toLowerCase() === trimmed.toLowerCase() ||
        option.value.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exact) commitValue(exact.value, exact.label);
    else commitValue(trimmed, trimmed);
  }

  function revert() {
    setQuery(labelFor(options, value));
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (allowCustom) commitText(query);
          else revert();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setHighlight((h) =>
              optionCount === 0 ? -1 : (h + 1) % optionCount,
            );
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlight((h) =>
              optionCount === 0 ? -1 : (h - 1 + optionCount) % optionCount,
            );
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (open && highlight >= 0) {
              if (highlight < filtered.length) {
                const picked = filtered[highlight];
                commitValue(picked.value, picked.label);
              } else if (showCustomOption) {
                commitText(trimmedQuery);
              }
            } else {
              commitText(query);
            }
          } else if (event.key === 'Escape') {
            revert();
          }
        }}
        className="pr-8"
      />
      <button
        type="button"
        aria-label="Toggle suggestions"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 transition-colors hover:text-muted-foreground dark:hover:text-[#f1f3f9]"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={cn('transition-transform', open && 'rotate-180')}
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-[6px] border border-slate-200 bg-white py-1 text-xs shadow-lg dark:border-border dark:bg-card"
        >
          {filtered.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={value === option.value}
            >
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitValue(option.value, option.label)}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  'flex w-full items-center px-3 py-1.5 text-left font-medium text-slate-700 dark:text-[#c6cad4]',
                  highlight === index && 'bg-slate-100 dark:bg-accent',
                  value === option.value && 'text-foreground',
                )}
              >
                {option.label}
              </button>
            </li>
          ))}
          {showCustomOption ? (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitText(trimmedQuery)}
                onMouseEnter={() => setHighlight(filtered.length)}
                className={cn(
                  'flex w-full items-center px-3 py-1.5 text-left font-medium text-muted-foreground',
                  highlight === filtered.length &&
                    'bg-slate-100 dark:bg-accent',
                )}
              >
                Use &ldquo;{trimmedQuery}&rdquo;
              </button>
            </li>
          ) : null}
          {filtered.length === 0 && !showCustomOption ? (
            <li className="px-3 py-1.5 text-slate-400 dark:text-muted-foreground/70">
              {emptyText}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
