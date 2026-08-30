'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@applyso/ui/button';
import { analytics } from '@applyso/analytics';

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
        className="h-7 w-7 rounded-[6px] border-[#26282e] bg-[#18191c] text-[#8a8f9d]"
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
      className="h-7 w-7 rounded-[6px] border-[#26282e] bg-[#18191c] text-[#8a8f9d] hover:text-[#f1f3f9] hover:bg-[#222429] transition-all cursor-pointer group"
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {isDark ? (
        <Sun className="h-3.5 w-3.5 text-amber-400/90 transition-transform group-hover:rotate-45" />
      ) : (
        <Moon className="h-3.5 w-3.5 text-indigo-400 transition-transform group-hover:-rotate-12" />
      )}
    </Button>
  );
}
