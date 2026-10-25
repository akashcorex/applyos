'use client';

import * as React from 'react';

import { analytics } from '@applyso/analytics';
import { Button } from '@applyso/ui/button';
import { Moon, Sun } from '@applyso/ui/icons';

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
        className="h-8 w-8 rounded-[8px] [&_svg]:size-4"
      >
        <Moon className="size-4" />
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
      className="h-8 w-8 rounded-[8px] cursor-pointer group [&_svg]:size-4"
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {isDark ? (
        <Sun className="fine-hover-sun size-4 transition-transform duration-150 ease-out-strong" />
      ) : (
        <Moon className="fine-hover-moon size-4 transition-transform duration-150 ease-out-strong" />
      )}
    </Button>
  );
}
