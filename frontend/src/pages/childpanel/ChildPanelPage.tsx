import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Globe,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCcw,
  Server,
  Copy,
  Eye,
  EyeOff,
  Zap,
  Clock,
  XCircle
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { childPanelService, ChildPanelData } from '../../services/childPanels';
import { analyticsService, DailyRevenue } from '../../services/analytics';
import { DailyRevenueCalendar } from '../../components/analytics/DailyRevenueCalendar';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending: { label: 'Provisioning', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/25' },
  active: { label: 'Active', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
  suspended: { label: 'Suspended', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/25' },
  expired: { label: 'Expired', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/25' },
  terminated: { label: 'Terminated', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/25' },
};

export const ChildPanelPage: React.FC = () => {
  const { user } = useAuth();
  const { formatCurrency } = useCurrency();
  const [panels, setPanels] = useState<ChildPanelData[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [domain, setDomain] = useState('');
  const [adminUser, setAdminUser] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [copiedNs, setCopiedNs] = useState<string | null>(null);

  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [loadingRevenue, setLoadingRevenue] = useState(true);

  const fetchRevenue = async () => {
    try {
      const data = await analyticsService.getDailyRevenue(60);
      setDailyRevenue(data);
    } catch {
      // silent
    } finally {
      setLoadingRevenue(false);
    }
  };

  const fetchPanels = async () => {
    try {
      const data = await childPanelService.getMyPanels();
      setPanels(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPanels();
    fetchRevenue();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!domain.trim() || !adminUser.trim() || !adminPassword.trim()) {
      setError('All fields are required.');
      return;
    }
    setSubmitting(true);
    try {
      const newPanel = await childPanelService.orderPanel({
        domain: domain.trim(),
        admin_username: adminUser.trim(),
        admin_password: adminPassword,
      });
      setPanels((prev) => [newPanel, ...prev]);
      setDomain('');
      setAdminUser('');
      setAdminPassword('');
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to create child panel. Please try again.';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRenew = async (panelId: string) => {
    setRenewingId(panelId);
    try {
      const updated = await childPanelService.renewPanel(panelId);
      setPanels((prev) => prev.map((p) => (p.id === panelId ? updated : p)));
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Renewal failed.';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setRenewingId(null);
    }
  };

  const handleCopyNs = (ns: string) => {
    navigator.clipboard.writeText(ns);
    setCopiedNs(ns);
    setTimeout(() => setCopiedNs(null), 2000);
  };

  const daysUntil = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
            <Server className="w-4.5 h-4.5" />
          </div>
          Child Panel
        </h1>
        <p className="text-xs text-slate-400 mt-1.5 ml-[46px]">
          Launch your own branded SMM panel on a custom domain with automated wholesale connectivity
        </p>
      </div>

      {/* Quick Info Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 bg-[#181a20] border-[#2b303c] space-y-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Monthly Rental</span>
          <span className="text-xl font-black text-[#f59e0b] block">Ksh 1,500 / mo</span>
          <span className="text-[10px] text-slate-500">Auto renews from wallet balance</span>
        </Card>

        <Card className="p-4 bg-[#181a20] border-[#2b303c] space-y-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Nameservers to Set</span>
          <div className="space-y-1">
            {['ns1.socialpulse.io', 'ns2.socialpulse.io'].map((ns) => (
              <button
                key={ns}
                onClick={() => handleCopyNs(ns)}
                className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400 hover:text-emerald-300 transition-colors group"
              >
                <span>{ns}</span>
                {copiedNs === ns ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                )}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-4 bg-[#181a20] border-[#2b303c] space-y-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Unlimited Orders</span>
          <span className="text-xs font-bold text-white block">100% Wholesaling API</span>
          <span className="text-[10px] text-slate-500">Keep 100% of your markup profits</span>
        </Card>
      </div>

      {/* Daily Revenue & Profit Tracking Calendar */}
      <DailyRevenueCalendar
        dailyData={dailyRevenue}
        onRefresh={fetchRevenue}
      />

      {/* My Active Panels */}
      {!loading && panels.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-black uppercase text-slate-300 tracking-wider flex items-center gap-2">
            <Globe className="w-4 h-4 text-amber-400" />
            Your Panels ({panels.length})
          </h2>
          <div className="space-y-3">
            {panels.map((panel) => {
              const statusCfg = STATUS_CONFIG[panel.status] || STATUS_CONFIG.pending;
              const remaining = daysUntil(panel.expires_at);
              const isExpiringSoon = remaining <= 5 && panel.status === 'active';

              return (
                <Card
                  key={panel.id}
                  className={`p-4 sm:p-5 bg-[#181a20] border-[#2b303c] ${
                    isExpiringSoon ? 'border-amber-500/40' : ''
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-white truncate">{panel.domain}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border} border`}>
                          {statusCfg.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-[11px] text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-slate-500" />
                          Admin: <strong className="text-slate-300">{panel.admin_username}</strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {remaining > 0 ? `${remaining} days left` : 'Expired'}
                        </span>
                        <span className="text-slate-500 font-mono text-[10px]">
                          Expires {new Date(panel.expires_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {(panel.status === 'active' || panel.status === 'expired') && (
                        <Button
                          variant={panel.status === 'expired' ? 'primary' : 'outline'}
                          size="sm"
                          onClick={() => handleRenew(panel.id)}
                          isLoading={renewingId === panel.id}
                          leftIcon={<RefreshCcw className="w-3.5 h-3.5" />}
                        >
                          {panel.status === 'expired' ? 'Reactivate' : 'Renew'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {isExpiringSoon && (
                    <div className="mt-3 p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/15 text-[11px] text-amber-400 flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>This panel expires in {remaining} day{remaining !== 1 ? 's' : ''}. Renew to avoid interruption.</span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-300">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Order Form */}
      <form onSubmit={handleSubmit} className="p-5 sm:p-6 rounded-2xl bg-[#181a20] border border-[#2b303c] space-y-4 shadow-xl">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-black uppercase text-slate-200 tracking-wider">Order New Child Panel</h3>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5">Custom Domain</label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="bestsmmkenya.com"
              className="w-full pl-10 pr-4 py-2.5 bg-[#121418] border border-[#2b303c] rounded-xl text-white text-xs font-bold focus:outline-none focus:border-[#f59e0b] transition-colors placeholder:text-slate-600"
              required
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Enter the domain you want your panel hosted on. You must point its nameservers to ns1/ns2.socialpulse.io after purchase.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Admin Username</label>
            <input
              type="text"
              value={adminUser}
              onChange={(e) => setAdminUser(e.target.value)}
              placeholder="Enter admin username"
              className="w-full px-4 py-2.5 bg-[#121418] border border-[#2b303c] rounded-xl text-white text-xs font-bold focus:outline-none focus:border-[#f59e0b] transition-colors placeholder:text-slate-600"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Admin Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Secure password"
                className="w-full px-4 py-2.5 pr-10 bg-[#121418] border border-[#2b303c] rounded-xl text-white text-xs font-bold focus:outline-none focus:border-[#f59e0b] transition-colors placeholder:text-slate-600"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Balance & Cost Summary */}
        <div className="p-3.5 rounded-xl bg-[#121418] border border-[#2b303c] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Wallet Balance:
              <strong className="text-white">{formatCurrency(Number(user?.balance || 0))}</strong>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            Panel Cost:
            <strong className="text-amber-400">Ksh 1,500.00</strong>
            <span className="text-slate-500">/ month</span>
          </div>
        </div>

        <div className="pt-1">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={submitting}
            className="w-full sm:w-auto"
            leftIcon={<Server className="w-4 h-4" />}
          >
            Purchase Panel (Ksh 1,500 / month)
          </Button>
        </div>
      </form>

      {/* How It Works */}
      <div className="space-y-3">
        <h2 className="text-sm font-black uppercase text-slate-300 tracking-wider">How It Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              step: '01',
              title: 'Purchase and Configure',
              desc: 'Choose your custom domain, set up your admin credentials, and pay the monthly rental from your wallet.',
              icon: Zap,
            },
            {
              step: '02',
              title: 'Point Nameservers',
              desc: 'Update your domain registrar to point NS records to ns1.socialpulse.io and ns2.socialpulse.io. Propagation takes 1 to 4 hours.',
              icon: Globe,
            },
            {
              step: '03',
              title: 'Start Selling',
              desc: 'Your panel goes live with full wholesale API connectivity. Set your own prices and keep 100% of the markup.',
              icon: ShieldCheck,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.step} className="p-4 bg-[#181a20] border-[#2b303c] space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[#222630] border border-[#2b303c] flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <span className="text-[10px] font-black text-amber-400/60 uppercase tracking-wider">Step {item.step}</span>
                </div>
                <h3 className="text-xs font-bold text-white">{item.title}</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">{item.desc}</p>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};
