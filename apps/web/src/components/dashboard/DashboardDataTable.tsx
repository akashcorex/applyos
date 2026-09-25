'use client';

import { useMemo, useState } from 'react';

import {
  ArrowUpDown,
  Clock,
  Key,
  Laptop,
  Layers,
  Link2,
  MoreHorizontal,
  Search,
  Smartphone,
  User,
  Wifi,
} from '@applyso/ui/icons';

export type ApiLogRow = {
  id: string;
  endpoint: string;
  source: 'Web' | 'Mobile' | 'API Key';
  userType: 'Guest' | 'User';
  latency: number; // in ms
  requests: number;
  timeAgo: string;
  timestamp: number;
};

const DEFAULT_ROWS: ApiLogRow[] = [
  {
    id: '1',
    endpoint: '/api/auth/login',
    source: 'Web',
    userType: 'Guest',
    latency: 85,
    requests: 12450,
    timeAgo: '10s ago',
    timestamp: 10,
  },
  {
    id: '2',
    endpoint: '/api/user/profile',
    source: 'Mobile',
    userType: 'User',
    latency: 45,
    requests: 8920,
    timeAgo: '5s ago',
    timestamp: 5,
  },
  {
    id: '3',
    endpoint: '/api/products/list',
    source: 'Web',
    userType: 'User',
    latency: 120,
    requests: 6540,
    timeAgo: '1m ago',
    timestamp: 60,
  },
  {
    id: '4',
    endpoint: '/api/orders/create',
    source: 'Mobile',
    userType: 'User',
    latency: 180,
    requests: 3200,
    timeAgo: '30s ago',
    timestamp: 30,
  },
  {
    id: '5',
    endpoint: '/api/cart/update',
    source: 'Web',
    userType: 'User',
    latency: 95,
    requests: 2800,
    timeAgo: '2m ago',
    timestamp: 120,
  },
  {
    id: '6',
    endpoint: '/api/auth/logout',
    source: 'API Key',
    userType: 'User',
    latency: 32,
    requests: 2100,
    timeAgo: '10m ago',
    timestamp: 600,
  },
  {
    id: '7',
    endpoint: '/api/search/query',
    source: 'Web',
    userType: 'User',
    latency: 250,
    requests: 5400,
    timeAgo: '15s ago',
    timestamp: 15,
  },
  {
    id: '8',
    endpoint: '/api/payments/process',
    source: 'Mobile',
    userType: 'User',
    latency: 420,
    requests: 890,
    timeAgo: '3m ago',
    timestamp: 180,
  },
];

type SortField =
  'endpoint' | 'source' | 'userType' | 'latency' | 'requests' | 'time';

export function DashboardDataTable() {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('time');
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const filteredAndSortedRows = useMemo(() => {
    let result = DEFAULT_ROWS.filter((row) => {
      if (!search.trim()) return true;
      const query = search.toLowerCase();
      return (
        row.endpoint.toLowerCase().includes(query) ||
        row.source.toLowerCase().includes(query) ||
        row.userType.toLowerCase().includes(query)
      );
    });

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'endpoint':
          cmp = a.endpoint.localeCompare(b.endpoint);
          break;
        case 'source':
          cmp = a.source.localeCompare(b.source);
          break;
        case 'userType':
          cmp = a.userType.localeCompare(b.userType);
          break;
        case 'latency':
          cmp = a.latency - b.latency;
          break;
        case 'requests':
          cmp = a.requests - b.requests;
          break;
        case 'time':
          cmp = a.timestamp - b.timestamp;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [search, sortField, sortAsc]);

  const renderSourceIcon = (source: ApiLogRow['source']) => {
    switch (source) {
      case 'Web':
        return <Laptop className="size-3.5 text-muted-foreground" />;
      case 'Mobile':
        return <Smartphone className="size-3.5 text-muted-foreground" />;
      case 'API Key':
        return <Key className="size-3.5 text-muted-foreground" />;
    }
  };

  const getLatencyColor = (latency: number) => {
    if (latency < 100) return 'text-emerald-400';
    if (latency < 300) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div className="w-full bg-background border-b border-border">
      {/* Top Header of the API Logs Section */}
      <div className="px-6 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-background">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          API Logs
        </h3>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search endpoint..."
              className="w-full pl-8 pr-3 h-8 text-xs rounded-[6px] border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-neutral-500 transition-colors"
            />
          </div>
          <button
            type="button"
            aria-label="More actions"
            className="h-8 w-8 rounded-[6px] border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer shrink-0"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </div>
      </div>

      {/* Main Full-Bleed Line-Divided Table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-y border-border bg-background/60 text-muted-foreground select-none">
              <th
                onClick={() => handleSort('endpoint')}
                className="px-6 py-2.5 font-medium cursor-pointer hover:text-foreground transition-colors border-r border-border/80"
              >
                <div className="flex items-center gap-1.5">
                  <Link2 className="size-3.5" />
                  <span>Endpoint</span>
                  <ArrowUpDown className="size-3 opacity-60 ml-0.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('source')}
                className="px-5 py-2.5 font-medium cursor-pointer hover:text-foreground transition-colors border-r border-border/80"
              >
                <div className="flex items-center gap-1.5">
                  <Laptop className="size-3.5" />
                  <span>Source</span>
                  <ArrowUpDown className="size-3 opacity-60 ml-0.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('userType')}
                className="px-5 py-2.5 font-medium cursor-pointer hover:text-foreground transition-colors border-r border-border/80"
              >
                <div className="flex items-center gap-1.5">
                  <User className="size-3.5" />
                  <span>User Type</span>
                  <ArrowUpDown className="size-3 opacity-60 ml-0.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('latency')}
                className="px-5 py-2.5 font-medium cursor-pointer hover:text-foreground transition-colors border-r border-border/80"
              >
                <div className="flex items-center gap-1.5">
                  <Wifi className="size-3.5" />
                  <span>Latency</span>
                  <ArrowUpDown className="size-3 opacity-60 ml-0.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('requests')}
                className="px-5 py-2.5 font-medium cursor-pointer hover:text-foreground transition-colors border-r border-border/80"
              >
                <div className="flex items-center gap-1.5">
                  <Layers className="size-3.5" />
                  <span>Requests</span>
                  <ArrowUpDown className="size-3 opacity-60 ml-0.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('time')}
                className="px-6 py-2.5 font-medium cursor-pointer hover:text-foreground transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  <span>Time</span>
                  <ArrowUpDown className="size-3 opacity-60 ml-0.5" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filteredAndSortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-8 text-center text-xs text-muted-foreground font-mono"
                >
                  No matching endpoints found
                </td>
              </tr>
            ) : (
              filteredAndSortedRows.map((row) => {
                const latencyColor = getLatencyColor(row.latency);
                return (
                  <tr
                    key={row.id}
                    className="hover:bg-muted/25 transition-colors group"
                  >
                    <td className="px-6 py-3 border-r border-border/40 font-mono text-foreground/90 font-medium">
                      <div className="flex items-center gap-2">
                        <Link2 className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                        <span>{row.endpoint}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 border-r border-border/40 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        {renderSourceIcon(row.source)}
                        <span>{row.source}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 border-r border-border/40 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <User className="size-3.5 text-muted-foreground" />
                        <span>{row.userType}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 border-r border-border/40 font-mono">
                      <div className="flex items-center gap-1.5">
                        <Wifi className={`size-3.5 ${latencyColor}`} />
                        <span className={`font-medium ${latencyColor}`}>
                          {row.latency}ms
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 border-r border-border/40 font-mono text-foreground/80">
                      <div className="flex items-center gap-2">
                        <Layers className="size-3.5 text-muted-foreground" />
                        <span>{row.requests.toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground font-sans">
                      <div className="flex items-center gap-1.5">
                        <Clock className="size-3.5 text-muted-foreground" />
                        <span>{row.timeAgo}</span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
