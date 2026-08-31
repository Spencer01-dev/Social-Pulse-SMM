import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ListOrdered,
  Search,
  ExternalLink,
  RefreshCw,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check
} from 'lucide-react';
import { ordersService } from '../../services/orders';
import { CustomerOrder, OrderStatus } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

export const OrderListPage: React.FC = () => {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchOrders = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await ordersService.getMyOrders({
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
        search: search || undefined,
      });
      setOrders(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    // Auto-poll every 8 seconds for live real-time status transitions
    const interval = setInterval(() => {
      fetchOrders(true);
    }, 8000);

    return () => clearInterval(interval);
  }, [selectedStatus, search]);

  const copyOrderId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Completed
          </span>
        );
      case 'in_progress':
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" /> In Progress
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3.5 h-3.5" /> Pending
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <AlertTriangle className="w-3.5 h-3.5" /> Partial
          </span>
        );
      case 'canceled':
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" /> {status === 'canceled' ? 'Canceled & Refunded' : 'Failed'}
          </span>
        );
      default:
        return null;
    }
  };

  const statusTabs: { id: OrderStatus | 'all'; label: string }[] = [
    { id: 'all', label: 'All Orders' },
    { id: 'pending', label: 'Pending' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'completed', label: 'Completed' },
    { id: 'partial', label: 'Partial' },
    { id: 'canceled', label: 'Canceled' },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Order History & Tracking</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time delivery updates and campaign fulfillment status
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchOrders()}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>
          <Link to="/orders/new">
            <Button variant="primary" size="md" leftIcon={<PlusCircle className="w-4 h-4" />}>
              New Order
            </Button>
          </Link>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {statusTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedStatus(tab.id)}
            className={`px-4 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all ${
              selectedStatus === tab.id
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-sm'
                : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search & Refresh Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-md flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchOrders()}
            placeholder="Filter by target URL link..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500"
          />
        </div>

        <button
          onClick={() => fetchOrders()}
          disabled={loading}
          className="px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Live Flow</span>
        </button>
      </div>

      {/* Orders Table */}
      <Card title="Orders List" subtitle={`Displaying ${orders.length} order entries`}>
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-3" />
            <span className="text-xs text-slate-400">Fetching order updates...</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <ListOrdered className="w-10 h-10 text-slate-600 mx-auto" />
            <h4 className="text-sm font-semibold text-white">No orders found</h4>
            <p className="text-xs text-slate-400">You haven't placed any orders matching this filter yet.</p>
            <Link to="/orders/new" className="inline-block mt-2">
              <Button variant="primary" size="sm">
                Create First Order
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Service</th>
                  <th className="py-3 px-4">Target Link</th>
                  <th className="py-3 px-4">Quantity / Flow</th>
                  <th className="py-3 px-4">Delivery Progress</th>
                  <th className="py-3 px-4">Charge</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
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
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <span>#{order.id.substring(0, 8)}</span>
                        <button
                          onClick={() => copyOrderId(order.id)}
                          className="text-slate-500 hover:text-slate-300"
                          title="Copy Full ID"
                        >
                          {copiedId === order.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs font-medium text-white truncate">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400">
                          {order.platform}
                        </span>
                        <span>{order.service_name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 max-w-[200px] truncate">
                      <a
                        href={order.target_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-400 hover:text-amber-300 flex items-center gap-1"
                      >
                        <span className="truncate">{order.target_link}</span>
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      <span className="text-white font-semibold block">{order.quantity.toLocaleString()}</span>
                      <span className="text-[10px] text-slate-400">Start: {order.start_count}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono min-w-[140px]">
                      <div className="flex items-center justify-between text-[10px] text-slate-300 mb-1">
                        <span>{isCompleted ? 'Delivered' : isPending ? 'Queued' : `${delivered} / ${order.quantity}`}</span>
                        <span className="text-amber-400 font-bold">{isCompleted ? '100%' : isPending ? '0%' : `${progressPct}%`}</span>
                      </div>
                      <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isCompleted
                              ? 'bg-emerald-400'
                              : order.status === 'in_progress'
                              ? 'bg-amber-400 animate-pulse'
                              : 'bg-slate-700'
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-slate-500 block mt-0.5">
                        {isCompleted ? 'Finished' : isPending ? `${order.quantity} queued` : `${order.remains} remaining`}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-emerald-400">
                      {order.currency} {Number(order.charge).toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4">{getStatusBadge(order.status)}</td>
                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      {new Date(order.created_at).toLocaleDateString()}{' '}
                      {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
