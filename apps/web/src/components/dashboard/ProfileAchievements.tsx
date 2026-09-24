'use client';

import {
  Award,
  Briefcase,
  CalendarCheck,
  Check,
  FileText,
  Flame,
  SlidersHorizontal,
  UserCheck,
} from '@applyso/ui/icons';
import type { ProfileProgression } from '@applyso/validation';

const ACHIEVEMENT_ICON: Record<string, typeof FileText> = {
  'first-upload': FileText,
  'identity-complete': UserCheck,
  'preferences-set': SlidersHorizontal,
  'profile-ready': Check,
  'first-application': Briefcase,
  'job-hunter': Flame,
  'interview-ready': CalendarCheck,
  'offer-earned': Award,
  consistent: Flame,
};

/**
 * Achievement grid — earned state comes from real backend domain events via
 * the progression engine, never from frontend counters.
 */
export function ProfileAchievements({
  progression,
}: {
  progression: ProfileProgression;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {progression.achievements.map((achievement) => {
        const Icon = ACHIEVEMENT_ICON[achievement.key] ?? Award;
        return (
          <div
            key={achievement.key}
            className={`rounded-[12px] border p-4 transition-colors ${
              achievement.earned
                ? 'border-cyan-500/25 bg-cyan-500/[0.04] dark:bg-cyan-500/[0.06]'
                : 'border-border bg-card opacity-70'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-[8px] ${
                  achievement.earned
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
                    : 'bg-muted text-slate-400 dark:text-[#6b7080]'
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span
                className={`text-[10px] font-mono font-semibold ${
                  achievement.earned
                    ? 'text-cyan-600 dark:text-cyan-400'
                    : 'text-muted-foreground'
                }`}
              >
                {achievement.earned
                  ? `+${achievement.xp} XP`
                  : `${achievement.xp} XP`}
              </span>
            </div>
            <p className="mt-2.5 text-[13px] font-semibold tracking-tight">
              {achievement.label}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              {achievement.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}
