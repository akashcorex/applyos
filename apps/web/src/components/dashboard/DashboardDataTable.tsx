'use client';

import { useState } from 'react';

import {
  ChevronDown,
  Columns,
  Check,
  GripVertical,
  MoreHorizontal,
  Plus,
  Settings2,
} from 'lucide-react';

import { Button } from '@applyso/ui/button';
import { Card, CardContent, CardHeader } from '@applyso/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@applyso/ui/table';

export type TableRowData = {
  id: string;
  header: string;
  sectionType: string;
  status: 'In Process' | 'Done';
  target: number;
  limit: number;
  reviewer?: string | null;
};

const INITIAL_ROWS: TableRowData[] = [
  {
    id: '1',
    header: 'Cover page',
    sectionType: 'Cover page',
    status: 'In Process',
    target: 18,
    limit: 5,
    reviewer: 'Eddie Lake',
  },
  {
    id: '2',
    header: 'Table of contents',
    sectionType: 'Table of contents',
    status: 'Done',
    target: 29,
    limit: 24,
    reviewer: 'Eddie Lake',
  },
  {
    id: '3',
    header: 'Executive summary',
    sectionType: 'Narrative',
    status: 'Done',
    target: 10,
    limit: 13,
    reviewer: 'Eddie Lake',
  },
  {
    id: '4',
    header: 'Technical approach',
    sectionType: 'Narrative',
    status: 'Done',
    target: 27,
    limit: 23,
    reviewer: 'Jamik Tashpulatov',
  },
  {
    id: '5',
    header: 'Design',
    sectionType: 'Narrative',
    status: 'In Process',
    target: 2,
    limit: 16,
    reviewer: 'Jamik Tashpulatov',
  },
  {
    id: '6',
    header: 'Capabilities',
    sectionType: 'Narrative',
    status: 'In Process',
    target: 20,
    limit: 8,
    reviewer: 'Jamik Tashpulatov',
  },
  {
    id: '7',
    header: 'Integration with existing systems',
    sectionType: 'Narrative',
    status: 'In Process',
    target: 19,
    limit: 21,
    reviewer: 'Jamik Tashpulatov',
  },
  {
    id: '8',
    header: 'Innovation and Advantages',
    sectionType: 'Narrative',
    status: 'Done',
    target: 25,
    limit: 26,
    reviewer: null,
  },
  {
    id: '9',
    header: 'Overview of EMR\'s Innovative Solutions',
    sectionType: 'Technical content',
    status: 'Done',
    target: 7,
    limit: 23,
    reviewer: null,
  },
  {
    id: '10',
    header: 'Advanced Algorithms and Machine Learning',
    sectionType: 'Narrative',
    status: 'Done',
    target: 30,
    limit: 28,
    reviewer: null,
  },
];

const TABS = [
  { id: 'outline', label: 'Outline' },
  { id: 'past_performance', label: 'Past Performance', badge: 3 },
  { id: 'key_personnel', label: 'Key Personnel', badge: 2 },
  { id: 'focus_documents', label: 'Focus Documents' },
];

export function DashboardDataTable() {
  const [activeTab, setActiveTab] = useState('outline');
  const [rows, setRows] = useState<TableRowData[]>(INITIAL_ROWS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [reviewerDropdownId, setReviewerDropdownId] = useState<string | null>(null);

  const [visibleColumns, setVisibleColumns] = useState({
    sectionType: true,
    status: true,
    target: true,
    limit: true,
    reviewer: true,
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const assignReviewer = (id: string, name: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, reviewer: name } : r)),
    );
    setReviewerDropdownId(null);
  };

  const isAllSelected = rows.length > 0 && selectedIds.size === rows.length;

  return (
    <Card className="shadow-sm overflow-hidden">
      {/* Top Header & Action Bar */}
      <CardHeader className="p-4 pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200/60 dark:border-border">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-secondary dark:text-white dark:border dark:border-border shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 dark:bg-card dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-white dark:border dark:border-border'
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge ? (
                  <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800 dark:bg-[#3f3f46] dark:text-slate-200">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 relative">
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setColumnsMenuOpen((open) => !open)}
              className="h-8 px-2.5 text-xs border-border bg-card text-muted-foreground hover:bg-slate-100 dark:hover:bg-accent dark:hover:text-white"
            >
              <Columns className="h-3.5 w-3.5 mr-1.5" />
              <span>Customize Columns</span>
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>

            {columnsMenuOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-[8px] border border-border bg-white dark:bg-card p-2 shadow-lg text-xs space-y-1">
                {Object.entries(visibleColumns).map(([key, isVis]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-accent cursor-pointer"
                  >
                    <span className="capitalize">{key}</span>
                    <input
                      type="checkbox"
                      checked={isVis}
                      onChange={() =>
                        setVisibleColumns((prev) => ({
                          ...prev,
                          [key]: !isVis,
                        }))
                      }
                      className="rounded border-slate-300 dark:border-border"
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          <Button
            size="sm"
            className="h-8 px-3 text-xs bg-slate-900 text-white dark:bg-secondary dark:hover:bg-[#3f3f46] dark:text-white rounded-[6px] dark:border dark:border-border"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            <span>Add Section</span>
          </Button>
        </div>
      </CardHeader>

      {/* Main Table */}
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50 dark:bg-card border-b border-slate-200/80 dark:border-border">
              <TableHead className="w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all"
                  className="rounded border-slate-300 dark:border-border bg-transparent cursor-pointer"
                />
              </TableHead>
              <TableHead className="font-semibold text-muted-foreground">
                Header
              </TableHead>
              {visibleColumns.sectionType ? (
                <TableHead className="font-semibold text-muted-foreground">
                  Section Type
                </TableHead>
              ) : null}
              {visibleColumns.status ? (
                <TableHead className="font-semibold text-muted-foreground">
                  Status
                </TableHead>
              ) : null}
              {visibleColumns.target ? (
                <TableHead className="text-right font-semibold text-muted-foreground">
                  Target
                </TableHead>
              ) : null}
              {visibleColumns.limit ? (
                <TableHead className="text-right font-semibold text-muted-foreground">
                  Limit
                </TableHead>
              ) : null}
              {visibleColumns.reviewer ? (
                <TableHead className="font-semibold text-muted-foreground">
                  Reviewer
                </TableHead>
              ) : null}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isSelected = selectedIds.has(row.id);
              return (
                <TableRow
                  key={row.id}
                  className={`${
                    isSelected
                      ? 'bg-slate-100/80 dark:bg-secondary'
                      : 'hover:bg-slate-50 dark:hover:bg-accent/50'
                  } transition-colors border-b border-slate-200/60 dark:border-border/60`}
                >
                  <TableCell className="text-center py-2.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <GripVertical className="h-3.5 w-3.5 text-slate-400 dark:text-[#52525b] cursor-grab" />
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(row.id)}
                        className="rounded border-slate-300 dark:border-border bg-transparent cursor-pointer"
                      />
                    </div>
                  </TableCell>

                  <TableCell className="font-medium text-foreground py-2.5">
                    {row.header}
                  </TableCell>

                  {visibleColumns.sectionType ? (
                    <TableCell className="py-2.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-secondary dark:text-muted-foreground border border-border">
                        {row.sectionType}
                      </span>
                    </TableCell>
                  ) : null}

                  {visibleColumns.status ? (
                    <TableCell className="py-2.5">
                      {row.status === 'In Process' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-secondary dark:text-muted-foreground border border-border">
                          <Settings2 className="h-3 w-3 animate-spin text-slate-400 dark:text-[#71717a]" />
                          <span>In Process</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <Check className="h-3 w-3 text-emerald-500" />
                          <span>Done</span>
                        </span>
                      )}
                    </TableCell>
                  ) : null}

                  {visibleColumns.target ? (
                    <TableCell className="text-right font-mono text-xs text-muted-foreground py-2.5">
                      {row.target}
                    </TableCell>
                  ) : null}

                  {visibleColumns.limit ? (
                    <TableCell className="text-right font-mono text-xs text-muted-foreground py-2.5">
                      {row.limit}
                    </TableCell>
                  ) : null}

                  {visibleColumns.reviewer ? (
                    <TableCell className="py-2.5 relative">
                      {row.reviewer ? (
                        <span className="text-xs text-slate-900 dark:text-[#e1e4ed] font-medium">
                          {row.reviewer}
                        </span>
                      ) : (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setReviewerDropdownId(
                                reviewerDropdownId === row.id ? null : row.id,
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-xs font-medium border border-border bg-card text-muted-foreground hover:bg-slate-100 dark:hover:bg-accent transition-colors"
                          >
                            <span>Assign reviewer</span>
                            <ChevronDown className="h-3 w-3 text-slate-400" />
                          </button>

                          {reviewerDropdownId === row.id ? (
                            <div className="absolute left-0 z-30 mt-1 w-44 rounded-[8px] border border-border bg-popover p-1 shadow-lg text-xs space-y-1">
                              {['Eddie Lake', 'Jamik Tashpulatov', 'Sarah Connor'].map(
                                (name) => (
                                  <button
                                    key={name}
                                    type="button"
                                    onClick={() => assignReviewer(row.id, name)}
                                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#22242b] text-slate-900 dark:text-white"
                                  >
                                    {name}
                                  </button>
                                ),
                              )}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                  ) : null}

                  <TableCell className="text-right py-2.5">
                    <button
                      type="button"
                      aria-label="Row actions"
                      className="p-1 rounded text-slate-400 dark:text-[#787d8e] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#22242b]"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
