import { useState } from 'react';
import { Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/formatters';
import { useAdminAuditLogs } from '@/hooks/useApi';
import type { AuditLog } from '@/types';

const ENTITY_LABELS: Record<string, { label: string; color: string }> = {
  product: { label: 'Product', color: 'bg-blue-100 text-blue-700' },
  category: { label: 'Category', color: 'bg-purple-100 text-purple-700' },
  order: { label: 'Order', color: 'bg-green-100 text-green-700' },
  config: { label: 'Config', color: 'bg-amber-100 text-amber-700' },
  coupon: { label: 'Coupon', color: 'bg-pink-100 text-pink-700' },
  user: { label: 'User', color: 'bg-cyan-100 text-cyan-700' },
  refund: { label: 'Refund', color: 'bg-red-100 text-red-700' },
};

const ITEMS_PER_PAGE = 25;

/** Show "View full" when details are longer than this (rough table cell limit). */
const DETAILS_TRUNCATE_AT = 100;

export default function AdminAuditLog() {
  const { data: logs, isLoading } = useAdminAuditLogs();
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null);

  const allLogs = logs || [];
  const filtered = allLogs.filter(log => {
    if (entityFilter !== 'all' && log.entityType !== entityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        log.details.toLowerCase().includes(q) ||
        log.adminName.toLowerCase().includes(q) ||
        log.adminEmail.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const entityTypes = ['all', ...new Set(allLogs.map(l => l.entityType))];

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
      <p className="mt-1 text-sm text-muted-foreground">Track all admin changes — who, when, and what was modified</p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-1.5">
          {entityTypes.map(t => (
            <button
              key={t}
              onClick={() => { setEntityFilter(t); setPage(1); }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${entityFilter === t ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
            >
              {t === 'all' ? 'All' : (ENTITY_LABELS[t]?.label || t)}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search actions, names..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b bg-background-subtle">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">When</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Admin</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginated.map(log => {
              const badge = ENTITY_LABELS[log.entityType] || { label: log.entityType, color: 'bg-gray-100 text-gray-600' };
              return (
                <tr key={log.auditId} className="hover:bg-background-subtle/50">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-sm">{log.adminName}</p>
                      {log.adminEmail && <p className="text-xs text-muted-foreground">{log.adminEmail}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.color}`}>{badge.label}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{log.action.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    <div className="max-w-md">
                      <p className="line-clamp-2 break-words" title={log.details.length > DETAILS_TRUNCATE_AT ? undefined : log.details}>
                        {log.details}
                      </p>
                      {log.details.length > DETAILS_TRUNCATE_AT && (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs font-medium text-accent"
                          onClick={() => setDetailLog(log)}
                        >
                          View full
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {paginated.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No audit logs found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      <Dialog open={!!detailLog} onOpenChange={open => { if (!open) setDetailLog(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Audit details</DialogTitle>
          </DialogHeader>
          {detailLog && (
            <div className="space-y-3 text-sm min-h-0">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground">When</span>
                <span className="text-foreground">{formatDateTime(detailLog.createdAt)}</span>
                <span className="text-muted-foreground">Admin</span>
                <span className="text-foreground">{detailLog.adminName}{detailLog.adminEmail ? ` (${detailLog.adminEmail})` : ''}</span>
                <span className="text-muted-foreground">Type</span>
                <span className="text-foreground">{ENTITY_LABELS[detailLog.entityType]?.label || detailLog.entityType}</span>
                <span className="text-muted-foreground">Action</span>
                <span className="font-mono text-foreground">{detailLog.action.replace(/_/g, ' ')}</span>
              </div>
              <div className="min-h-0 max-h-[50vh] overflow-y-auto rounded-md border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Details</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-foreground leading-relaxed">{detailLog.details}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
