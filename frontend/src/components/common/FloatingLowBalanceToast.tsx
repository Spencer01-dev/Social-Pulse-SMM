import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { X, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const FloatingLowBalanceToast: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (!isAuthenticated || !user || dismissed) return null;

  const numBalance = Number(user.balance || 0);

  // Show if balance is below Ksh 50.00
  if (numBalance >= 50) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 animate-bounce">
      <div className="flex items-center gap-3 bg-[#1e222b] text-white px-4 py-2.5 rounded-2xl border border-amber-500/40 shadow-2xl">
        <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>Your balance is below <strong className="text-amber-400">Ksh 50.00</strong></span>
        </div>

        <Link
          to="/deposit"
          className="px-3 py-1 bg-[#f59e0b] hover:bg-[#fbbf24] text-slate-950 font-black text-xs rounded-xl transition-all shadow-md shadow-amber-500/20 active:scale-95"
        >
          Top up
        </Link>

        <button
          onClick={() => setDismissed(true)}
          className="text-slate-400 hover:text-white p-0.5 ml-1"
          aria-label="Dismiss alert"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
