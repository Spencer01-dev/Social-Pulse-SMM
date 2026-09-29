import React, { useEffect, useState } from 'react';
import {
  RefreshCw,
  Search,
  ExternalLink,
  Edit2,
  Check,
  X,
  AlertCircle,
  TrendingUp,
  DollarSign,
  PackageCheck,
  Clock,
  Copy,
  RotateCcw,
  CalendarDays,
  Calendar,
  BarChart3,
  Percent,
} from 'lucide-react';
import { ordersService } from '../../services/orders';
import { analyticsService, DailyRevenue, MonthlySummary } from '../../services/analytics';
import { AdminOrder, OrderStatus } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { DailyRevenueCalendar } from '../../components/analytics/DailyRevenueCalendar';

export const AdminOrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Status Override Modal State
  const [overrideOrder, setOverrideOrder] = useState<AdminOrder | null>(null);
  const [newStatus, setNewStatus] = useState<OrderStatus>('completed');
  const [newStartCount, setNewStartCount] = useState<string>('');
  const [newRemains, setNewRemains] = useState<string>('');
  const [savingOverride, setSavingOverride] = useState(false);

  // Monthly Revenue & Profit Modal State
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [monthModalYear, setMonthModalYear] = useState(new Date().getFullYear());
  const [monthModalMonth, setMonthModalMonth] = useState(new Date().getMonth() + 1); // 1-indexed (1-12)
  const [monthSummary, setMonthSummary] = useState<MonthlySummary | null>(null);
  const [loadingMonthSummary, setLoadingMonthSummary] = useState(false);

  const fetchMonthSummary = async (yr: number, mo: number) => {
    setLoadingMonthSummary(true);
    try {
      const data = await analyticsService.getMonthlySummary(yr, mo);
      setMonthSummary(data);
    } catch (err) {
      console.error('Failed to fetch monthly summary:', err);
    } finally {
      setLoadingMonthSummary(false);
    }
  };

  const handleOpenMonthModal = (mo?: number, yr?: number) => {
    const targetMonth = mo ?? monthModalMonth;
    const targetYear = yr ?? monthModalYear;
    setMonthModalMonth(targetMonth);
    setMonthModalYear(targetYear);
    setShowMonthModal(true);
    fetchMonthSummary(targetYear, targetMonth);
  };

  const fetchAdminOrders = async () => {
    setLoading(true);
    try {
      const data = await ordersService.getAdminOrders({
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
        search: search || undefined,
        date: selectedDate || undefined,
      });
      setOrders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRevenue = async () => {
    try {
      const data = await analyticsService.getDailyRevenue(60);
      setDailyRevenue(data);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    fetchAdminOrders();
    fetchRevenue();

    // Auto-poll provider status every 8 seconds
    const interval = setInterval(async () => {
      try {
        const data = await ordersService.getAdminOrders({
          status: selectedStatus !== 'all' ? selectedStatus : undefined,
          search: search || undefined,
          date: selectedDate || undefined,
        });
        setOrders(data);
      } catch (e) {
        // silent polling catch
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [selectedStatus, search, selectedDate]);

  const handleSyncActive = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await ordersService.syncActiveOrders();
      setSyncMessage(res.message);
      await fetchAdminOrders();
    } catch (err: any) {
      setSyncMessage(`Sync Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenOverride = (order: AdminOrder) => {
    setOverrideOrder(order);
    setNewStatus(order.status);
    setNewStartCount(String(order.start_count));
    setNewRemains(String(order.remains));
  };

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideOrder) return;

    setSavingOverride(true);
    try {
      await ordersService.overrideOrderStatus(overrideOrder.id, {
        status: newStatus,
        start_count: newStartCount ? parseInt(newStartCount) : undefined,
        remains: newRemains ? parseInt(newRemains) : undefined,
      });
      setOverrideOrder(null);
      await fetchAdminOrders();
    } catch (err: any) {
      alert(`Failed to override: ${err.message}`);
    } finally {
      setSavingOverride(false);
    }
  };

  const handleCancelAndRefund = async () => {
    if (!overrideOrder) return;
    if (!window.confirm(`Are you sure you want to cancel Order #${overrideOrder.id.substring(0, 8)} and refund KES ${Number(overrideOrder.charge).toFixed(2)} to ${overrideOrder.username}?`)) {
      return;
    }

    setSavingOverride(true);
    try {
      await ordersService.overrideOrderStatus(overrideOrder.id, {
        status: 'canceled',
        remains: overrideOrder.quantity,
      });
      setOverrideOrder(null);
      await fetchAdminOrders();
    } catch (err: any) {
      alert(`Failed to cancel and refund: ${err.message}`);
    } finally {
      setSavingOverride(false);
    }
  };

  const handleRetryDispatch = async () => {
    if (!overrideOrder) return;
    setSavingOverride(true);
    try {
      await ordersService.retryOrderDispatch(overrideOrder.id);
      alert(`Order #${overrideOrder.id.substring(0, 8)} successfully dispatched to upstream provider!`);
      setOverrideOrder(null);
      await fetchAdminOrders();
    } catch (err: any) {
      alert(`Dispatch failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSavingOverride(false);
    }
  };

  const [refillingAdminOrderId, setRefillingAdminOrderId] = useState<string | null>(null);

  const handleAdminRefill = async (orderToRefill?: AdminOrder) => {
    const target = orderToRefill || overrideOrder;
    if (!target) return;
    if (!target.provider_order_id) {
      alert('This order has not been dispatched upstream or has no Provider Order ID.');
      return;
    }
    const confirmed = window.confirm(
      `Dispatch automated refill request to provider for Order #${target.order_number || target.id.substring(0, 8)} (Provider Order ID #${target.provider_order_id})?`
    );
    if (!confirmed) return;

    setRefillingAdminOrderId(target.id);
    try {
      const res = await ordersService.adminRefillOrder(target.id);
      alert(res.message || `Refill successfully triggered! Refill ID: #${res.refill_id}`);
      if (overrideOrder) setOverrideOrder(null);
      await fetchAdminOrders();
    } catch (err: any) {
      alert(`Refill request failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setRefillingAdminOrderId(null);
    }
  };

  const activeOrders = orders.filter(o => !['canceled', 'failed'].includes(o.status));
  const totalRevenue = activeOrders.reduce((acc, o) => acc + Number(o.charge), 0);
  const totalProfit = activeOrders.reduce((acc, o) => acc + Number(o.profit), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Admin Orders Monitor</h1>
          <p className="text-xs text-slate-400 mt-1">
            Global fulfillment status, provider dispatch IDs, and profit analytics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleOpenMonthModal()}
            className="flex items-center gap-1.5 bg-[#181a20] border-[#2b303c] text-white hover:border-amber-400 shadow-sm"
          >
            <Calendar className="w-4 h-4 text-amber-400" />
            <span>Monthly Revenue & Profits</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSyncActive}
            disabled={syncing}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>Poll Active Orders</span>
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Total Order Volume
            </span>
            <span className="text-2xl font-extrabold text-white mt-1 block">
              {orders.length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
            <PackageCheck className="w-5 h-5" />
          </div>
        </Card>

        <Card className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Total Platform Revenue
            </span>
            <span className="text-2xl font-extrabold text-white mt-1 block">
              KES {totalRevenue.toFixed(2)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
        </Card>

        <Card className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Total Gross Profit
            </span>
            <span className="text-2xl font-extrabold text-emerald-400 mt-1 block">
              +KES {totalProfit.toFixed(2)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </Card>
      </div>

      {syncMessage && (
        <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center gap-2.5">
          <RefreshCw className="w-4 h-4 flex-shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Orders Daily Revenue Calendar Tracker */}
      <DailyRevenueCalendar
        dailyData={dailyRevenue}
        onRefresh={fetchRevenue}
        onDateSelect={(dateStr) => setSelectedDate(dateStr)}
        onViewMonthSummary={(mo, yr) => handleOpenMonthModal(mo, yr)}
        title="Daily Fulfillment & Orders Calendar"
      />

      {/* Active Date Filter Indicator */}
      {selectedDate && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
          <CalendarDays className="w-4 h-4 flex-shrink-0" />
          <span>
            Showing orders for <strong className="text-amber-400 font-mono">{selectedDate}</strong>
          </span>
          <button
            onClick={() => setSelectedDate(null)}
            className="ml-auto px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Show All
          </button>
        </div>
      )}

      {/* Orders Table */}
      <Card title="Platform Order Log" subtitle="Real-time fulfillment and manual status control">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative max-w-xs flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchAdminOrders()}
                placeholder="Search by Order ID (#e76d3a3b), link, provider ref, user, email..."
                className="w-full pl-9 pr-4 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as any)}
            className="px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="partial">Partial</option>
            <option value="canceled">Canceled</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Provider Ref</th>
                <th className="py-3 px-4">Service</th>
                <th className="py-3 px-4">Qty / Progress</th>
                <th className="py-3 px-4">Charge / Profit</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {orders.map((order) => {
                const isPending = order.status === 'pending' || order.status === 'processing';
                const isCompleted = order.status === 'completed';
                const delivered = isCompleted ? order.quantity : (isPending ? 0 : Math.max(0, order.quantity - order.remains));
                const progressPct = isCompleted ? 100 : (isPending ? 0 : Math.min(100, Math.round((delivered / (order.quantity || 1)) * 100)));
                
                const displayId = order.order_number ? String(order.order_number) : order.id.substring(0, 8);
                
                return (
                <tr key={order.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-slate-300">
                    <div className="flex items-center gap-1.5 font-bold">
                      <span>{displayId}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(displayId);
                          setCopiedId(order.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                        className="text-slate-500 hover:text-amber-400 transition-colors"
                        title="Copy Order ID"
                      >
                        {copiedId === order.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-semibold text-white block">{order.username}</span>
                    <span className="text-[10px] text-slate-400">{order.user_email}</span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs">
                    <span className="text-slate-200 font-semibold">{order.provider_name || 'JustAnotherPanel'}</span>
                    {order.provider_order_id ? (
                      <span className="text-[11px] font-mono text-cyan-400 block font-bold">
                        #{order.provider_order_id}
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-400/80 block">
                        {order.error_message ? 'Failed / Queued' : 'Queued'}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 max-w-xs truncate">
                    <div className="font-medium text-white truncate">{order.service_name}</div>
                    <a
                      href={order.target_link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 truncate"
                    >
                      <span className="truncate">{order.target_link}</span>
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </td>
                  <td className="py-3.5 px-4 font-mono min-w-[130px]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white font-semibold">{order.quantity.toLocaleString()}</span>
                      <span className="text-[10px] text-slate-400">Start: {order.start_count}</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 mt-1 overflow-hidden border border-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isCompleted
                            ? 'bg-emerald-400'
                            : order.status === 'in_progress'
                            ? 'bg-amber-400 animate-pulse'
                            : 'bg-slate-700'
                        }`}
                        style={{ width: `${order.status === 'completed' ? 100 : progressPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-slate-400 mt-0.5">
                      <span>{order.status === 'completed' ? '100% Done' : `${progressPct}% done`}</span>
                      <span className="text-amber-400/80">{order.remains} left</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono">
                    <span className="text-emerald-400 font-semibold block">
                      KES {Number(order.charge).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-indigo-300 font-medium">
                      +KES {Number(order.profit).toFixed(2)}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      order.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : order.status === 'in_progress'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-slate-800 text-slate-300'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {order.refill_available && order.provider_order_id && (
                        <button
                          onClick={() => handleAdminRefill(order)}
                          disabled={refillingAdminOrderId === order.id}
                          className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                          title="Trigger Upstream Refill"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${refillingAdminOrderId === order.id ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenOverride(order)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        title="Override Status"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Manual Status Override Modal */}
      {overrideOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-card rounded-3xl p-6 border border-slate-800 relative space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">
                  Order #{overrideOrder.id.substring(0, 8)} Management
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-800 text-slate-300">
                  {overrideOrder.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Customer: <span className="text-white font-medium">{overrideOrder.username}</span> | Charge: <span className="text-amber-400 font-semibold">KES {Number(overrideOrder.charge).toFixed(2)}</span>
              </p>
            </div>

            {/* Error Message Callout if present */}
            {overrideOrder.error_message && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <span>⚠️ Provider Error Reason:</span>
                </div>
                <div className="font-mono text-[11px] text-rose-200 break-words">
                  {overrideOrder.error_message}
                </div>
              </div>
            )}

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 bg-slate-900/60 rounded-2xl border border-slate-800/80">
              <button
                type="button"
                onClick={handleRetryDispatch}
                disabled={savingOverride || refillingAdminOrderId === overrideOrder.id}
                className="px-3 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${savingOverride ? 'animate-spin' : ''}`} />
                <span>Retry Dispatch</span>
              </button>

              <button
                type="button"
                onClick={() => handleAdminRefill()}
                disabled={savingOverride || refillingAdminOrderId === overrideOrder.id}
                className="px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${refillingAdminOrderId === overrideOrder.id ? 'animate-spin' : ''}`} />
                <span>Request Refill</span>
              </button>

              <button
                type="button"
                onClick={handleCancelAndRefund}
                disabled={savingOverride || refillingAdminOrderId === overrideOrder.id}
                className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <span>Cancel & Refund</span>
              </button>
            </div>

            <form onSubmit={handleSaveOverride} className="space-y-4 pt-1 border-t border-slate-800/60">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Manual Status Override
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as OrderStatus)}
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm"
                >
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="partial">Partial</option>
                  <option value="canceled">Canceled (Auto-Refunds)</option>
                  <option value="failed">Failed (Auto-Refunds)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Start Count</label>
                  <input
                    type="number"
                    value={newStartCount}
                    onChange={(e) => setNewStartCount(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Remains</label>
                  <input
                    type="number"
                    value={newRemains}
                    onChange={(e) => setNewRemains(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <Button type="button" variant="ghost" size="md" onClick={() => setOverrideOrder(null)}>
                  Close
                </Button>
                <Button type="submit" variant="primary" size="md" isLoading={savingOverride}>
                  Save Override
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Monthly Revenue & Gross Profit Modal */}
      {showMonthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#161a22] border border-[#2b303c] rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#2b303c]">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <BarChart3 className="w-4 h-4" />
                  </span>
                  <h3 className="text-xl font-black text-white">Monthly Revenue & Gross Profit</h3>
                </div>
                <p className="text-xs text-slate-400">
                  Total revenue, gross profit, and order fulfillment breakdown for any chosen month
                </p>
              </div>
              <button
                onClick={() => setShowMonthModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selectors Bar: Month and Year */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-[#101216] border border-[#2b303c] rounded-2xl">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Month:</span>
                <select
                  value={monthModalMonth}
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    setMonthModalMonth(m);
                    fetchMonthSummary(monthModalYear, m);
                  }}
                  className="px-3 py-2 bg-[#181c24] border border-[#2b303c] rounded-xl text-white text-xs font-bold focus:border-amber-400 focus:outline-none"
                >
                  {[
                    'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'
                  ].map((m, idx) => (
                    <option key={m} value={idx + 1}>{m}</option>
                  ))}
                </select>

                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Year:</span>
                <select
                  value={monthModalYear}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    setMonthModalYear(y);
                    fetchMonthSummary(y, monthModalMonth);
                  }}
                  className="px-3 py-2 bg-[#181c24] border border-[#2b303c] rounded-xl text-white text-xs font-bold focus:border-amber-400 focus:outline-none"
                >
                  {[2024, 2025, 2026, 2027].map((yr) => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const nowYr = now.getFullYear();
                    const nowMo = now.getMonth() + 1;
                    setMonthModalYear(nowYr);
                    setMonthModalMonth(nowMo);
                    fetchMonthSummary(nowYr, nowMo);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-extrabold transition-all"
                >
                  Current Month
                </button>
                <button
                  type="button"
                  onClick={() => fetchMonthSummary(monthModalYear, monthModalMonth)}
                  disabled={loadingMonthSummary}
                  className="p-2 rounded-xl bg-[#181c24] hover:bg-[#202530] text-slate-300 hover:text-white border border-[#2b303c] transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingMonthSummary ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Content Display */}
            {loadingMonthSummary ? (
              <div className="py-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
                <p className="text-xs text-slate-400">Loading monthly financial data...</p>
              </div>
            ) : monthSummary ? (
              <div className="space-y-5">
                {/* Highlight Month Header */}
                <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
                  <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-400" />
                    {monthSummary.month_name} {monthSummary.year} Performance
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-400">
                    {monthSummary.total_orders} total orders
                  </span>
                </div>

                {/* 3 Metric Cards: Total Revenue, Gross Profit, Profit Margin */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 bg-[#11141a] rounded-2xl border border-[#2b303c] space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-blue-400" />
                      Total Revenue
                    </span>
                    <div className="text-xl font-black text-white font-mono">
                      KES {monthSummary.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="p-4 bg-[#11141a] rounded-2xl border border-emerald-500/30 bg-emerald-950/10 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      Total Gross Profit
                    </span>
                    <div className="text-xl font-black text-emerald-400 font-mono">
                      +KES {monthSummary.total_gross_profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="p-4 bg-[#11141a] rounded-2xl border border-[#2b303c] space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                      <Percent className="w-3.5 h-3.5 text-amber-400" />
                      Profit Margin
                    </span>
                    <div className="text-xl font-black text-amber-400 font-mono">
                      {monthSummary.profit_margin_percent}%
                    </div>
                  </div>
                </div>

                {/* Provider cost sub-detail */}
                <div className="p-3 bg-[#11141a] rounded-xl border border-[#2b303c]/60 flex items-center justify-between text-xs text-slate-400">
                  <span>Wholesale Provider Cost:</span>
                  <span className="font-mono text-slate-200">
                    KES {monthSummary.total_provider_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Daily Breakdown for this month */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                    Daily Sales & Profits Breakdown
                  </span>
                  {monthSummary.days && monthSummary.days.length > 0 ? (
                    <div className="border border-[#2b303c] rounded-2xl overflow-hidden max-h-56 overflow-y-auto custom-scrollbar">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#11141a] text-slate-400 font-bold border-b border-[#2b303c] sticky top-0">
                          <tr>
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Orders</th>
                            <th className="py-2.5 px-3">Revenue (KES)</th>
                            <th className="py-2.5 px-3 text-right">Gross Profit (KES)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#2b303c]/40 font-mono">
                          {monthSummary.days.map((d) => (
                            <tr key={d.date} className="hover:bg-[#181c24] transition-colors">
                              <td className="py-2 px-3 text-slate-300 font-bold">{d.date}</td>
                              <td className="py-2 px-3 text-amber-400">{d.orders_count}</td>
                              <td className="py-2 px-3 text-white">KES {d.revenue.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right text-emerald-400 font-bold">
                                +KES {d.profit.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-6 text-center text-xs text-slate-500 bg-[#11141a] rounded-2xl border border-[#2b303c]">
                      No active sales recorded for {monthSummary.month_name} {monthSummary.year}.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Footer */}
            <div className="flex justify-end pt-2 border-t border-[#2b303c]">
              <Button variant="ghost" size="md" onClick={() => setShowMonthModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
