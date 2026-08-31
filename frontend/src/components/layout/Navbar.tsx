import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, User as UserIcon, Menu, LogOut, LogIn } from 'lucide-react';
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
    <header className="sticky top-0 z-30 h-16 glass-header px-4 sm:px-6 flex items-center justify-between border-b border-[#2b303c]">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#222630] lg:hidden transition-colors"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#f59e0b] text-slate-950 flex items-center justify-center font-black text-lg shadow-lg shadow-amber-500/25">
            ⚡
          </div>
          <div>
            <span className="text-lg font-extrabold tracking-tight text-white flex items-center gap-1.5">
              Social<span className="text-[#f59e0b]">Pulse</span>
            </span>
          </div>
        </Link>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Real-Time Pan-African & Global Currency Switcher */}
        <CurrencySwitcher />

        {isAuthenticated && user ? (
          <>
            {/* Golden Balance Pill with active currency */}
            <Link
              to="/deposit"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#f59e0b] hover:bg-[#fbbf24] text-slate-950 font-black text-xs rounded-xl transition-all shadow-md shadow-amber-500/20 active:scale-95"
              title="Add Funds to Wallet"
            >
              <span>{formatCurrency(Number(user.balance || 0))}</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </Link>

            {/* Account Profile Button */}
            <Link
              to="/profile"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#222630] hover:bg-[#2b303c] text-slate-200 font-bold text-xs rounded-xl border border-[#2b303c] transition-colors"
            >
              <UserIcon className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span>Account</span>
            </Link>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#222630] hover:bg-rose-950/30 text-slate-300 hover:text-rose-400 font-bold text-xs rounded-xl border border-[#2b303c] transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm" leftIcon={<LogIn className="w-4 h-4" />}>
                Sign In
              </Button>
            </Link>
            <Link to="/register">
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

