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
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {/* Stat 1 */}
        <Card className="rounded-[12px] border-[#262931] bg-[#17191e] shadow-sm hover:border-[#343845] transition-all duration-150">
          <CardHeader className="flex flex-row items-center justify-between pb-1 p-4">
            <CardTitle className="text-[11px] font-semibold text-[#8b90a0] uppercase tracking-wider font-mono">
              Applications
            </CardTitle>
            <div className="h-6 w-6 rounded-[4px] bg-[#1c1e24] text-blue-400 flex items-center justify-center border border-[#262931]">
              <Zap className="h-3 w-3" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl font-semibold text-[#f1f3f9] tracking-tight">48</div>
            <div className="flex items-center gap-1 mt-1 text-[11px] text-emerald-400 font-mono font-medium">
              <ArrowUpRight className="h-3 w-3" />
              <span>+127.1%</span>
            </div>
          </CardContent>
        </Card>

        {/* Stat 2 */}
        <Card className="rounded-[12px] border-[#262931] bg-[#17191e] shadow-sm hover:border-[#343845] transition-all duration-150">
          <CardHeader className="flex flex-row items-center justify-between pb-1 p-4">
            <CardTitle className="text-[11px] font-semibold text-[#8b90a0] uppercase tracking-wider font-mono">
              Discovered
            </CardTitle>
            <div className="h-6 w-6 rounded-[4px] bg-[#1c1e24] text-purple-400 flex items-center justify-center border border-[#262931]">
              <Eye className="h-3 w-3" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl font-semibold text-[#f1f3f9] tracking-tight">142</div>
            <div className="flex items-center gap-1 mt-1 text-[11px] text-emerald-400 font-mono font-medium">
              <ArrowUpRight className="h-3 w-3" />
              <span>+34.2%</span>
            </div>
          </CardContent>
        </Card>

        {/* Stat 3 */}
        <Card className="rounded-[12px] border-[#262931] bg-[#17191e] shadow-sm hover:border-[#343845] transition-all duration-150">
          <CardHeader className="flex flex-row items-center justify-between pb-1 p-4">
            <CardTitle className="text-[11px] font-semibold text-[#8b90a0] uppercase tracking-wider font-mono">
              Outreach Rate
            </CardTitle>
            <div className="h-6 w-6 rounded-[4px] bg-[#1c1e24] text-amber-400 flex items-center justify-center border border-[#262931]">
              <TrendingUp className="h-3 w-3" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl font-semibold text-[#f1f3f9] tracking-tight">43.6%</div>
            <div className="flex items-center gap-1 mt-1 text-[11px] text-emerald-400 font-mono font-medium">
              <ArrowUpRight className="h-3 w-3" />
              <span>+31.0%</span>
            </div>
          </CardContent>
        </Card>

        {/* Stat 4 */}
        <Card className="rounded-[12px] border-[#262931] bg-[#17191e] shadow-sm hover:border-[#343845] transition-all duration-150">
          <CardHeader className="flex flex-row items-center justify-between pb-1 p-4">
            <CardTitle className="text-[11px] font-semibold text-[#8b90a0] uppercase tracking-wider font-mono">
              Tailor Score
            </CardTitle>
            <div className="h-6 w-6 rounded-[4px] bg-[#1c1e24] text-emerald-400 flex items-center justify-center border border-[#262931]">
              <CheckCircle2 className="h-3 w-3" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl font-semibold text-[#f1f3f9] tracking-tight">96.4</div>
            <div className="flex items-center gap-1 mt-1 text-[11px] text-emerald-400 font-mono font-medium">
              <ArrowUpRight className="h-3 w-3" />
              <span>+14.5%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics Chart Card (Dither-Kit AreaChart) */}
      <Card className="rounded-[12px] border-[#262931] bg-[#17191e] shadow-sm p-5 text-[#f1f3f9]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#f1f3f9] tracking-tight">Application & Outreach Velocity</h3>
            <p className="text-xs text-[#8b90a0] font-normal">Real-time dithered metrics for automated applications and recruiter outreach.</p>
          </div>
          <Badge variant="outline" className="border-[#262931] bg-[#121418] text-blue-400 text-[10px] font-mono rounded-[4px] px-2 py-0.5">
            LIVE STREAM
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
