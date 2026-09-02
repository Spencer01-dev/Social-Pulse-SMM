import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, User as UserIcon, Menu, LogOut, LogIn, Zap } from 'lucide-react';
import { Button } from '../common/Button';
import { CurrencySwitcher } from '../common/CurrencySwitcher';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';

interface NavbarProps {
  onToggleSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 h-14 sm:h-16 glass-header px-3 sm:px-6 flex items-center justify-between border-b border-[#2b303c] w-full">
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 sm:p-2 -ml-1 sm:-ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#222630] lg:hidden transition-colors"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#f59e0b] text-slate-950 flex items-center justify-center font-black shadow-lg shadow-amber-500/20 shrink-0">
            <Zap className="w-4 h-4 sm:w-4.5 sm:h-4.5 fill-slate-950 text-slate-950" />
          </div>
          <div>
            <span className="text-base sm:text-lg font-extrabold tracking-tight text-white flex items-center gap-1">
              Social<span className="text-[#f59e0b]">Pulse</span>
            </span>
          </div>
        </Link>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Real-Time Pan-African & Global Currency Switcher */}
        <CurrencySwitcher />

        {isAuthenticated && user ? (
          <>
            {/* Golden Balance Pill with active currency */}
            <Link
              to="/deposit"
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 bg-[#f59e0b] hover:bg-[#fbbf24] text-slate-950 font-black text-xs rounded-xl transition-all shadow-md shadow-amber-500/20 active:scale-95 shrink-0"
              title="Add Funds to Wallet"
            >
              <span>{formatCurrency(Number(user.balance || 0))}</span>
              <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </Link>

            {/* Account Profile Button */}
            <Link
              to="/profile"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#222630] hover:bg-[#2b303c] text-slate-200 font-bold text-xs rounded-xl border border-[#2b303c] transition-colors"
            >
              <UserIcon className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span>Account</span>
            </Link>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 font-bold text-xs rounded-xl border border-rose-500/20 transition-colors shrink-0 active:scale-95"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </>
        ) : (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link to="/login">
              <button className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#222630] hover:bg-[#2b303c] text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-[#2b303c] transition-all active:scale-95">
                <LogIn className="w-3.5 h-3.5 text-[#f59e0b]" />
                <span>Sign In</span>
              </button>
            </Link>
            <Link to="/register" className="hidden sm:inline-block">
              <Button variant="primary" size="sm">
                Get Started
              </Button>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};

