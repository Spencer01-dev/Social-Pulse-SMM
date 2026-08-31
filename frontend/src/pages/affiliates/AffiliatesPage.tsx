import React, { useState } from 'react';
import { Share2, Copy, Check, Gift, DollarSign, Users, MousePointer, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

export const AffiliatesPage: React.FC = () => {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [payoutRequested, setPayoutRequested] = useState(false);

  const referralUrl = `http://localhost:5173/register?ref=${user?.username || 'user'}`;

  const copyRefLink = () => {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Refer & Earn (Affiliate Program)</h1>
        <p className="text-xs text-slate-400 mt-1">
          Share your referral link with friends, resellers, and businesses to earn <strong>5% lifetime commission</strong> on every deposit they make!
        </p>
      </div>

      {/* 5% Lifetime Commission Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-amber-600 via-[#f59e0b] to-amber-500 text-slate-950 font-black flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-950 text-[#f59e0b] flex items-center justify-center font-black text-xl flex-shrink-0">
            5%
          </div>
          <div>
            <h3 className="text-lg font-black leading-tight">5% Lifetime Commission</h3>
            <p className="text-xs font-semibold opacity-90">
              Whenever a user signs up with your link and adds funds, you earn 5% instantly in your wallet!
            </p>
          </div>
        </div>

        <div className="px-4 py-2 bg-slate-950 text-white rounded-2xl text-xs font-bold whitespace-nowrap">
          Min Payout: Ksh 500.00
        </div>
      </div>

      {/* Referral Link Card */}
      <div className="p-6 rounded-3xl bg-[#181a20] border border-[#2b303c] space-y-3 shadow-xl">
        <span className="text-[11px] font-black uppercase text-slate-300">Your Unique Referral Link</span>
        <div className="flex items-center gap-2 p-3 bg-[#121418] rounded-2xl border border-[#2b303c]">
          <span className="font-mono text-xs text-[#f59e0b] font-bold flex-1 truncate select-all">
            {referralUrl}
          </span>
          <Button
            size="sm"
            variant="primary"
            onClick={copyRefLink}
            leftIcon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
        </div>
      </div>

      {/* Affiliate Metrics Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[#181a20] border border-[#2b303c] space-y-1">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase">
            <MousePointer className="w-3.5 h-3.5 text-blue-400" />
            <span>Total Clicks</span>
          </div>
          <span className="text-xl font-black text-white block">0</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#181a20] border border-[#2b303c] space-y-1">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase">
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span>Referrals</span>
          </div>
          <span className="text-xl font-black text-white block">0</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#181a20] border border-[#2b303c] space-y-1">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase">
            <DollarSign className="w-3.5 h-3.5 text-[#f59e0b]" />
            <span>Unpaid Commission</span>
          </div>
          <span className="text-xl font-black text-[#f59e0b] block">Ksh 0.00</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#181a20] border border-[#2b303c] space-y-1">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase">
            <Wallet className="w-3.5 h-3.5 text-purple-400" />
            <span>Total Paid</span>
          </div>
          <span className="text-xl font-black text-white block">Ksh 0.00</span>
        </div>
      </div>
    </div>
  );
};
