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
  Clock
} from 'lucide-react';
import { ordersService } from '../../services/orders';
import { AdminOrder, OrderStatus } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

export const AdminOrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  // Status Override Modal State
  const [overrideOrder, setOverrideOrder] = useState<AdminOrder | null>(null);
  const [newStatus, setNewStatus] = useState<OrderStatus>('completed');
  const [newStartCount, setNewStartCount] = useState<string>('');
  const [newRemains, setNewRemains] = useState<string>('');
  const [savingOverride, setSavingOverride] = useState(false);

  const fetchAdminOrders = async () => {
    setLoading(true);
    try {
      const data = await ordersService.getAdminOrders({
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
        search: search || undefined,
      });
      setOrders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminOrders();

    // Auto-poll provider status every 8 seconds
    const interval = setInterval(async () => {
      try {
        const data = await ordersService.getAdminOrders({
          status: selectedStatus !== 'all' ? selectedStatus : undefined,
          search: search || undefined,
        });
        setOrders(data);
      } catch (e) {
        // silent polling catch
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [selectedStatus, search]);

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
      alert(`Order #${overrideOrder.id.substring(0, 8)} successfully dispatched to Delix Gains KE!`);
      setOverrideOrder(null);
      await fetchAdminOrders();
    } catch (err: any) {
      alert(`Dispatch failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSavingOverride(false);
    }
  };

  const totalRevenue = orders.reduce((acc, o) => acc + Number(o.charge), 0);
  const totalProfit = orders.reduce((acc, o) => acc + Number(o.profit), 0);

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
                placeholder="Filter by link or provider order ID..."
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
                
                return (
                <tr key={order.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-slate-400">#{order.id.substring(0, 8)}</td>
                  <td className="py-3.5 px-4">
                    <span className="font-semibold text-white block">{order.username}</span>
                    <span className="text-[10px] text-slate-400">{order.user_email}</span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs">
                    <span className="text-slate-200 font-semibold">{order.provider_name || 'Delix Gains KE'}</span>
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
                    <button
                      onClick={() => handleOpenOverride(order)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="Override Status"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
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
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-900/60 rounded-2xl border border-slate-800/80">
              <button
                type="button"
                onClick={handleRetryDispatch}
                disabled={savingOverride}
                className="px-3 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${savingOverride ? 'animate-spin' : ''}`} />
                <span>Retry Dispatch</span>
              </button>

              <button
                type="button"
                onClick={handleCancelAndRefund}
                disabled={savingOverride}
                className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <span>Cancel & 100% Refund</span>
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
    </div>
  );
};
