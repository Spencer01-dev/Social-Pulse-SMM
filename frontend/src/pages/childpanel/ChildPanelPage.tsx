import React, { useState } from 'react';
import { Sparkles, Globe, ShieldCheck, CheckCircle2, DollarSign, ArrowRight } from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

export const ChildPanelPage: React.FC = () => {
  const [domain, setDomain] = useState('');
  const [adminUser, setAdminUser] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      setSuccess(true);
      setSubmitting(false);
    }, 1200);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Child Panel (Rent Your Own SMM Panel)</h1>
        <p className="text-xs text-slate-400 mt-1">
          Launch your own branded SMM panel on your own custom domain with automated wholesale provider connectivity
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-[#181a20] border border-[#2b303c] space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400">Monthly Rental</span>
          <span className="text-xl font-black text-[#f59e0b] block">Ksh 1,500 / mo</span>
          <span className="text-[10px] text-slate-500">Auto-renews from wallet</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#181a20] border border-[#2b303c] space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400">Nameservers to Set</span>
          <span className="text-xs font-mono font-bold text-emerald-400 block">ns1.socialpulse.io</span>
          <span className="text-xs font-mono font-bold text-emerald-400 block">ns2.socialpulse.io</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#181a20] border border-[#2b303c] space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400">Unlimited Orders</span>
          <span className="text-xs font-bold text-white block">100% Wholesaling API</span>
          <span className="text-[10px] text-slate-500">Keep 100% of your markup profits</span>
        </div>
      </div>

      {success ? (
        <div className="p-6 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
          <h3 className="text-lg font-black text-white">Child Panel Order Submitted!</h3>
          <p className="text-xs text-slate-300 max-w-md mx-auto">
            Your panel for <strong>{domain}</strong> is being provisioned. Please point your domain's nameservers to <strong>ns1.socialpulse.io</strong> and <strong>ns2.socialpulse.io</strong>. Propagation takes 1-4 hours.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-6 rounded-3xl bg-[#181a20] border border-[#2b303c] space-y-4 shadow-xl">
          <h3 className="text-sm font-black uppercase text-slate-200">Configure Your New Child Panel</h3>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Your Custom Domain *</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g. bestsmmkenya.com"
              className="w-full px-4 py-2.5 bg-[#121418] border border-[#2b303c] rounded-xl text-white text-xs font-bold focus:outline-none focus:border-[#f59e0b]"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Admin Username *</label>
              <input
                type="text"
                value={adminUser}
                onChange={(e) => setAdminUser(e.target.value)}
                placeholder="admin"
                className="w-full px-4 py-2.5 bg-[#121418] border border-[#2b303c] rounded-xl text-white text-xs focus:outline-none focus:border-[#f59e0b]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Admin Password *</label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-2.5 bg-[#121418] border border-[#2b303c] rounded-xl text-white text-xs focus:outline-none focus:border-[#f59e0b]"
                required
              />
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" variant="primary" size="lg" isLoading={submitting}>
              Purchase Panel (Ksh 1,500 / month)
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
