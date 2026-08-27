'use client';

import { ArrowUpRight, TrendingUp, Eye, CheckCircle2, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';
import { Badge } from '@applyso/ui/badge';
import { AreaChart } from '@/components/dither-kit/area-chart';
import { Area } from '@/components/dither-kit/area';
import { XAxis } from '@/components/dither-kit/x-axis';
import { YAxis } from '@/components/dither-kit/y-axis';
import { Legend } from '@/components/dither-kit/legend';
import { Tooltip } from '@/components/dither-kit/tooltip';

const chartData = [
  { day: 'Dec 9', applications: 18, outreach: 8 },
  { day: 'Dec 10', applications: 24, outreach: 14 },
  { day: 'Dec 11', applications: 16, outreach: 11 },
  { day: 'Dec 12', applications: 28, outreach: 19 },
  { day: 'Dec 13', applications: 38, outreach: 26 },
  { day: 'Dec 14', applications: 42, outreach: 31 },
  { day: 'Dec 15', applications: 29, outreach: 20 },
  { day: 'Dec 16', applications: 35, outreach: 27 },
];

const chartConfig = {
  applications: { label: 'Job Applications', color: 'blue' as const },
  outreach: { label: 'Recruiter Outreach', color: 'purple' as const },
};

export function DashboardOverview() {
  return (
    <div className="space-y-6">
      {/* KPI Stats Row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Stat 1 */}
        <Card className="rounded-2xl border-slate-200/80 shadow-sm bg-white hover:border-slate-300 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500">
              Applications Sent
            </CardTitle>
            <div className="h-7 w-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Zap className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900">48</div>
            <div className="flex items-center gap-1 mt-1 text-xs text-emerald-600 font-semibold">
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>+127.1% this week</span>
            </div>
          </CardContent>
        </Card>

        {/* Stat 2 */}
        <Card className="rounded-2xl border-slate-200/80 shadow-sm bg-white hover:border-slate-300 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500">
              Roles Discovered
            </CardTitle>
            <div className="h-7 w-7 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Eye className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900">142</div>
            <div className="flex items-center gap-1 mt-1 text-xs text-emerald-600 font-semibold">
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>+34.2% matching</span>
            </div>
          </CardContent>
        </Card>

        {/* Stat 3 */}
        <Card className="rounded-2xl border-slate-200/80 shadow-sm bg-white hover:border-slate-300 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500">
              Outreach Response
            </CardTitle>
            <div className="h-7 w-7 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <TrendingUp className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900">43.6%</div>
            <div className="flex items-center gap-1 mt-1 text-xs text-emerald-600 font-semibold">
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>+31.0% conversion</span>
            </div>
          </CardContent>
        </Card>

        {/* Stat 4 */}
        <Card className="rounded-2xl border-slate-200/80 shadow-sm bg-white hover:border-slate-300 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500">
              Resume Tailor Score
            </CardTitle>
            <div className="h-7 w-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900">96.4</div>
            <div className="flex items-center gap-1 mt-1 text-xs text-emerald-600 font-semibold">
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>+14.5% high match</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics Chart Card (Dither-Kit AreaChart) */}
      <Card className="rounded-2xl border-slate-200/80 shadow-sm bg-white p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">Application & Outreach Engagement</h3>
            <p className="text-xs text-slate-500">Real-time dithered tracking of daily AI applications and recruiter messages.</p>
          </div>
          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold rounded-xl px-3 py-1">
            Live Stream
          </Badge>
        </div>

        {/* Dither Kit AreaChart Component */}
        <div className="w-full h-72">
          <AreaChart data={chartData} config={chartConfig} bloom="aura" className="h-full w-full">
            <XAxis dataKey="day" />
            <YAxis />
            <Legend isClickable />
            <Tooltip labelKey="day" />
            <Area dataKey="applications" variant="gradient" />
            <Area dataKey="outreach" variant="dotted" />
          </AreaChart>
        </div>
      </Card>
    </div>
  );
}
