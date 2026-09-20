'use client';

import * as React from 'react';

import { Moon, Sun } from 'lucide-react';

import { analytics } from '@applyso/analytics';
import { Button } from '@applyso/ui/button';

import { useTheme } from '@/components/theme-provider';

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  function toggleTheme() {
    const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    analytics.track(
      'theme_toggled',
      { theme: nextTheme },
      { feature: 'system' },
    );
    setTheme(nextTheme);
  }

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        aria-label="Toggle theme"
        className="h-7 w-7 rounded-[6px]"
      >
        <Moon className="h-3.5 w-3.5" />
      </Button>
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="outline"
      size="icon"
      type="button"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      onClick={toggleTheme}
      className="h-7 w-7 rounded-[6px] transition-all cursor-pointer group"
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {isDark ? (
        <Sun className="h-3.5 w-3.5 transition-transform group-hover:rotate-45" />
      ) : (
        <Moon className="h-3.5 w-3.5 transition-transform group-hover:-rotate-12" />
      )}
    </Button>
  );
}
