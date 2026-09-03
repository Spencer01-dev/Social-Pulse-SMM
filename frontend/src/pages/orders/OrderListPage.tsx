import React, { useEffect, useRef, useState } from 'react';
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
  Check,
  ShieldAlert,
  Settings,
  RotateCcw,
  Ban
} from 'lucide-react';
import { ordersService } from '../../services/orders';
import { CustomerOrder, OrderStatus } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';

interface TableVisualSettings {
  multiSelection: boolean;
  showId: boolean;
  showDate: boolean;
  showPrice: boolean;
  refillButton: boolean;
  cancelButton: boolean;
}

const DEFAULT_SETTINGS: TableVisualSettings = {
  multiSelection: false,
  showId: true,
  showDate: true,
  showPrice: true,
  refillButton: true,
  cancelButton: false,
};

export const OrderListPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [viewAll, setViewAll] = useState(isAdmin);

  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Table visual settings state & modal popover
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [tableSettings, setTableSettings] = useState<TableVisualSettings>(() => {
    try {
      const saved = localStorage.getItem('socialpulse_table_settings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Multi-selection state
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  const updateTableSetting = (key: keyof TableVisualSettings, value: boolean) => {
    const updated = { ...tableSettings, [key]: value };
    setTableSettings(updated);
    try {
      localStorage.setItem('socialpulse_table_settings', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowSettingsPopover(false);
      }
    };
    if (showSettingsPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettingsPopover]);

  const fetchOrders = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await ordersService.getMyOrders({
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
        search: search || undefined,
        all_orders: isAdmin ? viewAll : undefined,
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
  }, [selectedStatus, search, viewAll]);

  const copyOrderId = (idToCopy: string, displayKey: string) => {
    navigator.clipboard.writeText(idToCopy);
    setCopiedId(displayKey);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedOrderIds(orders.map((o) => o.id));
    } else {
      setSelectedOrderIds([]);
    }
  };

  const handleToggleSelectOrder = (id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
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

      {/* Admin Scope Switcher Banner */}
      {isAdmin && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span className="text-xs font-extrabold text-amber-400 uppercase tracking-wider block">Staff Order Controls</span>
              <p className="text-xs text-slate-300">
                {viewAll
                  ? 'Showing all platform orders across all accounts.'
                  : 'Showing only orders created by your super admin account.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setViewAll(!viewAll)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                viewAll
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
              }`}
            >
              {viewAll ? 'View My Orders Only' : 'View All System Orders'}
            </button>
            <Link
              to="/admin/orders"
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 text-xs font-bold border border-amber-500/30 flex items-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Full Orders Monitor</span>
            </Link>
          </div>
        </div>
      )}

      {/* Status Filter Tabs & Table Visual Settings */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none flex-1">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatus(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedStatus === tab.id
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/25 border border-amber-400 font-extrabold'
                  : 'bg-[#1b1f27] text-slate-300 hover:text-white hover:bg-[#252a35] border border-[#2b303c]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table Visual Settings Cog Button & Popover */}
        <div className="relative pb-2" ref={popoverRef}>
          <button
            onClick={() => setShowSettingsPopover(!showSettingsPopover)}
            className={`p-2.5 rounded-xl transition-all border ${
              showSettingsPopover
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                : 'bg-[#1b1f27] text-slate-400 hover:text-white hover:bg-[#252a35] border-[#2b303c]'
            }`}
            title="Table visual settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {showSettingsPopover && (
            <div className="absolute right-0 top-12 z-50 w-64 p-4 rounded-2xl bg-[#161a23] border border-slate-700 shadow-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="border-b border-slate-800 pb-2">
                <h3 className="text-sm font-bold text-white tracking-tight">Table visual settings</h3>
              </div>

              <div className="space-y-3.5 text-xs text-slate-300">
                {/* Multi selection */}
                <div className="flex items-center justify-between">
                  <span>Multi selection</span>
                  <button
                    type="button"
                    onClick={() => updateTableSetting('multiSelection', !tableSettings.multiSelection)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      tableSettings.multiSelection ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        tableSettings.multiSelection ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Show ID */}
                <div className="flex items-center justify-between">
                  <span>Show ID</span>
                  <button
                    type="button"
                    onClick={() => updateTableSetting('showId', !tableSettings.showId)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      tableSettings.showId ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        tableSettings.showId ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Show Date */}
                <div className="flex items-center justify-between">
                  <span>Show Date</span>
                  <button
                    type="button"
                    onClick={() => updateTableSetting('showDate', !tableSettings.showDate)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      tableSettings.showDate ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        tableSettings.showDate ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Show Price */}
                <div className="flex items-center justify-between">
                  <span>Show Price</span>
                  <button
                    type="button"
                    onClick={() => updateTableSetting('showPrice', !tableSettings.showPrice)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      tableSettings.showPrice ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        tableSettings.showPrice ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Refill button */}
                <div className="flex items-center justify-between">
                  <span>Refill button</span>
                  <button
                    type="button"
                    onClick={() => updateTableSetting('refillButton', !tableSettings.refillButton)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      tableSettings.refillButton ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        tableSettings.refillButton ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Cancel button */}
                <div className="flex items-center justify-between">
                  <span>Cancel button</span>
                  <button
                    type="button"
                    onClick={() => updateTableSetting('cancelButton', !tableSettings.cancelButton)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      tableSettings.cancelButton ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        tableSettings.cancelButton ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
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
            placeholder="Search by Order ID (292049173), link, service name..."
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
                  {tableSettings.multiSelection && (
                    <th className="py-3 px-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedOrderIds.length === orders.length && orders.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                      />
                    </th>
                  )}
                  {tableSettings.showId && <th className="py-3 px-4">Order ID</th>}
                  <th className="py-3 px-4">Service</th>
                  <th className="py-3 px-4">Target Link</th>
                  <th className="py-3 px-4">Quantity / Flow</th>
                  <th className="py-3 px-4">Delivery Progress</th>
                  {tableSettings.showPrice && <th className="py-3 px-4">Charge</th>}
                  <th className="py-3 px-4">Status</th>
                  {tableSettings.showDate && <th className="py-3 px-4">Date</th>}
                  {(tableSettings.refillButton || tableSettings.cancelButton) && (
                    <th className="py-3 px-4 text-right">Actions</th>
                  )}
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
                    {tableSettings.multiSelection && (
                      <td className="py-3.5 px-3">
                        <input
                          type="checkbox"
                          checked={selectedOrderIds.includes(order.id)}
                          onChange={() => handleToggleSelectOrder(order.id)}
                          className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                        />
                      </td>
                    )}
                    {tableSettings.showId && (
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        <div className="flex items-center gap-1.5 font-bold">
                          <span>{displayId}</span>
                          <button
                            onClick={() => copyOrderId(displayId, order.id)}
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
                    )}
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
                    {tableSettings.showPrice && (
                      <td className="py-3.5 px-4 font-bold text-emerald-400">
                        {order.currency} {Number(order.charge).toFixed(2)}
                      </td>
                    )}
                    <td className="py-3.5 px-4">{getStatusBadge(order.status)}</td>
                    {tableSettings.showDate && (
                      <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                        {new Date(order.created_at).toLocaleDateString()}{' '}
                        {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    )}
                    {(tableSettings.refillButton || tableSettings.cancelButton) && (
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {tableSettings.refillButton && (
                            <Link
                              to="/support"
                              title="Request Refill"
                              className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Link>
                          )}
                          {tableSettings.cancelButton && (
                            <Link
                              to="/support"
                              title="Request Cancellation"
                              className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </Link>
                          )}
                        </div>
                      </td>
                    )}
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
