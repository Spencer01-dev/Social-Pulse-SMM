import React, { useState } from 'react';
import { RotateCcw, ShieldCheck, CheckCircle2, AlertCircle, Clock, ExternalLink } from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

export const RefillPage: React.FC = () => {
  const [orderIdInput, setOrderIdInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleRefillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderIdInput.trim()) return;
    setSubmitting(true);
    setTimeout(() => {
      setSuccessMsg(`Refill request for Order #${orderIdInput.trim().slice(0, 8)} has been queued! Your drop will be replenished automatically within 1-2 hours.`);
      setOrderIdInput('');
      setSubmitting(false);
    }, 1000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Order Refill & Warranty</h1>
        <p className="text-xs text-slate-400 mt-1">
          Submit refill requests for non-drop services experiencing follower/like drops within the 30-day warranty window
        </p>
      </div>

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-slate-400 hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* Refill Request Card */}
      <div className="p-6 rounded-3xl bg-[#181a20] border border-[#2b303c] space-y-4 shadow-xl">
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
          Submit 1-Click Refill Request
        </h3>

        <form onSubmit={handleRefillSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Order ID / UUID *
            </label>
            <input
              type="text"
              value={orderIdInput}
              onChange={(e) => setOrderIdInput(e.target.value)}
              placeholder="Paste your Order ID from Order History (e.g. 9b1deb4d...)"
              className="w-full px-4 py-3 bg-[#121418] border border-[#2b303c] rounded-xl text-white text-xs font-mono focus:outline-none focus:border-[#f59e0b]"
              required
            />
          </div>

          <div className="p-3.5 rounded-2xl bg-[#222630] border border-[#2b303c] text-xs text-slate-300 space-y-1">
            <div className="flex items-center gap-2 text-[#f59e0b] font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>Refill Policy & Rules</span>
            </div>
            <ul className="text-[11px] text-slate-400 list-disc list-inside space-y-0.5">
              <li>Refills are only valid for services marked with <strong>[30 Days Refill]</strong>.</li>
              <li>Your profile must remain public during the refill process.</li>
              <li>Refills take between 15 minutes to 3 hours depending on network traffic.</li>
            </ul>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={submitting}
            leftIcon={<RotateCcw className="w-4 h-4" />}
          >
            Submit Refill Task
          </Button>
        </form>
      </div>
    </div>
  );
};
