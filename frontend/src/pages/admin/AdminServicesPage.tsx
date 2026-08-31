import React, { useEffect, useState } from 'react';
import {
  RefreshCw,
  Percent,
  Edit2,
  Check,
  X,
  Search,
  CheckCircle2,
  Sliders,
  DollarSign
} from 'lucide-react';
import { servicesService } from '../../services/services';
import { AdminService, MarkupType } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

export const AdminServicesPage: React.FC = () => {
  const [services, setServices] = useState<AdminService[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [providerBalance, setProviderBalance] = useState<{ provider: string; balance: number; currency: string } | null>(null);

  const [search, setSearch] = useState('');
  const [syncProvider, setSyncProvider] = useState('delix');
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState<string>('');

  // Bulk Markup Modal State
  const [showMarkupModal, setShowMarkupModal] = useState(false);
  const [markupType, setMarkupType] = useState<MarkupType>('percentage');
  const [markupValue, setMarkupValue] = useState<string>('80');
  const [applyingMarkup, setApplyingMarkup] = useState(false);

  const fetchAdminData = async () => {
    setLoading(true);
    setLoadingBalance(true);
    try {
      const [servicesData, balanceData] = await Promise.all([
        servicesService.getAdminServices({ search: search || undefined }),
        servicesService.getProviderBalance(syncProvider).catch(() => null),
      ]);
      setServices(servicesData);
      if (balanceData) {
        setProviderBalance(balanceData);
      } else {
        setProviderBalance({ provider: syncProvider, balance: 0, currency: 'KES' });
      }
    } catch (err) {
      console.error(err);
      setProviderBalance({ provider: syncProvider, balance: 0, currency: 'KES' });
    } finally {
      setLoading(false);
      setLoadingBalance(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [syncProvider]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await servicesService.syncFromProvider(syncProvider, 80);
      setSyncResult(res.message);
      await fetchAdminData();
    } catch (err: any) {
      setSyncResult(`Sync Error: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleActive = async (service: AdminService) => {
    try {
      const updated = await servicesService.updateService(service.id, {
        is_active: !service.is_active,
      });
      setServices((prev) => prev.map((s) => (s.id === service.id ? updated : s)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSavePrice = async (service: AdminService) => {
    if (!editRate || isNaN(Number(editRate))) return;
    try {
      const updated = await servicesService.updateService(service.id, {
        selling_rate: Number(editRate),
      });
      setServices((prev) => prev.map((s) => (s.id === service.id ? updated : s)));
      setEditingServiceId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleApplyBulkMarkup = async (e: React.FormEvent) => {
    e.preventDefault();
    setApplyingMarkup(true);
    try {
      await servicesService.applyBulkMarkup({
        markup_type: markupType,
        markup_value: Number(markupValue),
      });
      setShowMarkupModal(false);
      await fetchAdminData();
    } catch (err) {
      console.error(err);
    } finally {
      setApplyingMarkup(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header & Main Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Admin Service Management</h1>
          <p className="text-sm text-slate-400 mt-1">
            Import provider services, adjust selling rates, configure markups, and track profit margins
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="md"
            onClick={() => setShowMarkupModal(true)}
            leftIcon={<Percent className="w-4 h-4" />}
          >
            Bulk Markup
          </Button>

          <div className="flex items-center gap-2">
            <select
              value={syncProvider}
              onChange={(e) => {
                setSyncProvider(e.target.value);
                setProviderBalance(null);
              }}
              className="px-3 py-2 bg-slate-950/80 border border-amber-500/30 rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-amber-500"
            >
              <option value="delix">Delix Gains KE</option>
            </select>

            <Button
              variant="primary"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Syncing...' : 'Sync from Delix Gains'}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Provider Balance & Sync Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Delix Gains KE Balance
              </span>
              <button
                onClick={async () => {
                  setLoadingBalance(true);
                  try {
                    const b = await servicesService.getProviderBalance('delix');
                    setProviderBalance(b);
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setLoadingBalance(false);
                  }
                }}
                title="Refresh Live Balance"
                className="text-slate-400 hover:text-amber-400 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${loadingBalance ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <span className="text-2xl font-extrabold text-white mt-1 block">
              {loadingBalance ? (
                <span className="text-sm font-medium text-amber-400 animate-pulse">Connecting...</span>
              ) : providerBalance ? (
                `${providerBalance.currency} ${Number(providerBalance.balance).toFixed(2)}`
              ) : (
                <span className="text-sm font-medium text-slate-400">KES 0.00</span>
              )}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
        </Card>

        <Card className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Total Managed Services
            </span>
            <span className="text-2xl font-extrabold text-white mt-1 block">{services.length}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <Sliders className="w-5 h-5" />
          </div>
        </Card>

        <Card className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Active Services
            </span>
            <span className="text-2xl font-extrabold text-emerald-400 mt-1 block">
              {services.filter((s) => s.is_active).length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </Card>
      </div>

      {syncResult && (
        <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{syncResult}</span>
        </div>
      )}

      {/* Services Table */}
      <Card title="Services Catalog & Pricing Matrix" subtitle="Configure pricing and visibility for each individual service">
        <div className="mb-4">
          <div className="relative max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchAdminData()}
              placeholder="Filter by name, provider ID..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Provider ID</th>
                <th className="py-3 px-4">Platform</th>
                <th className="py-3 px-4">Service Name</th>
                <th className="py-3 px-4">Provider Cost</th>
                <th className="py-3 px-4">Customer Price</th>
                <th className="py-3 px-4">Profit / Margin</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-slate-400">
                    Loading services catalog...
                  </td>
                </tr>
              ) : services.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-slate-400">
                    No services found matching query.
                  </td>
                </tr>
              ) : (
                services.map((service) => (
                <tr key={service.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-slate-400">{service.provider_service_id}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase bg-slate-800 text-slate-300">
                      {service.platform}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 max-w-xs font-medium text-white truncate">{service.name}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-400">
                    KES {Number(service.provider_rate).toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 font-mono">
                    {editingServiceId === service.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          value={editRate}
                          onChange={(e) => setEditRate(e.target.value)}
                          className="w-20 px-2 py-1 bg-slate-950 border border-blue-500 rounded text-xs text-white"
                          step="0.01"
                        />
                        <button onClick={() => handleSavePrice(service)} className="text-emerald-400 hover:text-emerald-300">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingServiceId(null)} className="text-slate-500 hover:text-slate-400">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-emerald-400 font-semibold">
                        KES {Number(service.selling_rate).toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-indigo-300 font-medium">
                    +KES {Number(service.profit_margin).toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4">
                    <button
                      onClick={() => handleToggleActive(service)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-colors ${
                        service.is_active
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {service.is_active ? 'Active' : 'Hidden'}
                    </button>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => {
                        setEditingServiceId(service.id);
                        setEditRate(String(service.selling_rate));
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="Edit Selling Price"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Bulk Markup Modal */}
      {showMarkupModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-card rounded-3xl p-6 border border-slate-800 relative">
            <h3 className="text-lg font-bold text-white mb-1">Apply Bulk Markup</h3>
            <p className="text-xs text-slate-400 mb-5">
              Automatically calculate selling prices across services based on provider wholesale cost.
            </p>

            <form onSubmit={handleApplyBulkMarkup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Markup Mode</label>
                <select
                  value={markupType}
                  onChange={(e) => setMarkupType(e.target.value as MarkupType)}
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm"
                >
                  <option value="percentage">Percentage Markup (%)</option>
                  <option value="fixed_amount">Fixed Amount Addition (KES)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Markup Value {markupType === 'percentage' ? '(e.g. 100% = double provider cost)' : '(KES per 1k)'}
                </label>
                <input
                  type="number"
                  value={markupValue}
                  onChange={(e) => setMarkupValue(e.target.value)}
                  placeholder="80"
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <Button type="button" variant="ghost" size="md" onClick={() => setShowMarkupModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="md" isLoading={applyingMarkup}>
                  Apply to All Services
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
