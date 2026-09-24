'use client';

import Link from 'next/link';

import { ArrowUpRight } from 'lucide-react';

import { Badge } from '@applyso/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';

import { DitherAvatar } from '@/components/dither-kit/avatar';

export type RecentActivityItem = {
  id: string;
  role: string;
  company: string;
  status: string;
  badgeVariant?: 'default' | 'outline' | 'secondary' | 'destructive';
  time: string;
  tailorScore?: number;
};

const DEFAULT_ITEMS: RecentActivityItem[] = [
  {
    id: '1',
    role: 'Senior Frontend Engineer',
    company: 'Vercel',
    status: 'APPLIED',
    badgeVariant: 'default',
    time: '2 hours ago',
    tailorScore: 98,
  },
  {
    id: '2',
    role: 'Full Stack Engineer',
    company: 'Stripe',
    status: 'INTERVIEW',
    badgeVariant: 'secondary',
    time: '5 hours ago',
    tailorScore: 95,
  },
  {
    id: '3',
    role: 'Product Engineer (AI)',
    company: 'Supabase',
    status: 'SCREENING',
    badgeVariant: 'outline',
    time: '1 day ago',
    tailorScore: 92,
  },
  {
    id: '4',
    role: 'Staff UI Systems Engineer',
    company: 'Linear',
    status: 'SUBMITTING',
    badgeVariant: 'secondary',
    time: '1 day ago',
    tailorScore: 99,
  },
  {
    id: '5',
    role: 'Founding Engineer',
    company: 'Resend',
    status: 'APPLIED',
    badgeVariant: 'default',
    time: '2 days ago',
    tailorScore: 94,
  },
];

export function RecentActivityCard({
  title = 'Recent Applications',
  description = 'You have 48 automated applications active this month.',
  items = DEFAULT_ITEMS,
}: {
  title?: string;
  description?: string;
  items?: RecentActivityItem[];
}) {
  return (
    <Card className="p-5 h-full flex flex-col justify-between">
      <div>
        <CardHeader className="p-0 flex flex-row items-center justify-between border-b border-border pb-3">
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
              {title}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {description}
            </p>
          </div>
          <Link
            href="/dashboard/applications"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            <span>View All</span>
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </CardHeader>

        <CardContent className="p-0 pt-3 space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 p-2 rounded-[8px] hover:bg-muted/60 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <DitherAvatar name={item.company} size={32} bloom="low" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {item.role}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground truncate">
                      {item.company}
                    </span>
                    {item.tailorScore ? (
                      <span className="text-[10px] font-mono text-muted-foreground font-medium">
                        {item.tailorScore}% Match
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <Badge
                  variant={item.badgeVariant ?? 'outline'}
                  className="text-[10px] font-mono px-2 py-0.5"
                >
                  {item.status}
                </Badge>
                <p className="text-[10px] font-mono text-muted-foreground mt-1">
                  {item.time}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </div>
    </Card>
  );
}
