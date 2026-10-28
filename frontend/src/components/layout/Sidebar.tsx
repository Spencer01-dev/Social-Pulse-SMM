import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  PlusCircle,
  ListOrdered,
  CreditCard,
  Layers,
  LifeBuoy,
  Code2,
  Settings,
  X,
  Users,
  Sliders,
  Package,
  History,
  Headphones,
  RotateCcw,
  Sparkles,
  Share2,
  Bell,
  ShieldAlert,
  LogOut,
  Zap,
  Phone,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenant, isMainDomain } from '../../context/TenantContext';
import { useTicketNotifications } from '../../context/TicketNotificationContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const { isTenantMode, tenant } = useTenant();
  const { unreadCount, adminUnreadCount } = useTicketNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const isCustomHost = !isMainDomain(window.location.hostname);
  const isChildPanel = isTenantMode || isCustomHost;
  const accentColor = isChildPanel && tenant ? tenant.theme_color || '#10b981' : isChildPanel ? '#10b981' : '#f59e0b';
  const brandTitle = isChildPanel ? (tenant?.site_name || 'Skakegains SMM') : 'SocialPulse';
  const logoUrl = isChildPanel ? (tenant?.logo_url || '/skakegains-logo.png') : null;

  const handleLogout = () => {
    logout();
    onClose();
    navigate('/login');
  };

  const customerNav = [
    { name: 'New Order', href: '/orders/new', icon: PlusCircle },
    { name: 'WhatsApp Numbers', href: '/orders/whatsapp', icon: Phone, badge: '🇺🇸 +1' },
    { name: 'Add Funds', href: '/deposit', icon: CreditCard, badge: 'M-Pesa' },
    { name: 'Orders', href: '/orders', icon: ListOrdered },
    { name: 'Services', href: '/services', icon: Layers },
    {
      name: 'Tickets',
      href: '/support',
      icon: LifeBuoy,
      badge: unreadCount > 0 ? `${unreadCount} New` : undefined,
      isUnreadBadge: unreadCount > 0
    },
    { name: 'Api', href: '/api-docs', icon: Code2 },
    ...(!isChildPanel
      ? [
          { name: 'Child panel', href: '/child-panel', icon: Sparkles },
          { name: 'Panel Admin Hub', href: '/child-panel/manage', icon: ShieldCheck, badge: 'Owner' },
        ]
      : []),
    { name: 'Refer & Earn', href: '/referrals', icon: Share2 },
    { name: 'Updates', href: '/updates', icon: Bell },
  ];

  const childPanelStaffNav = [
    { name: 'Orders Monitor', href: '/child-panel/manage?tab=orders', icon: Package },
    { name: 'Services & Markups', href: '/child-panel/manage?tab=services', icon: Sliders },
    { name: 'Payment Settings', href: '/child-panel/manage?tab=payments', icon: CreditCard, badge: 'Till' },
    {
      name: 'Support Helpdesk',
      href: '/child-panel/manage?tab=tickets',
      icon: Headphones,
      badge: adminUnreadCount > 0 ? `${adminUnreadCount} New` : undefined,
      isUnreadBadge: adminUnreadCount > 0
    },
    { name: 'User Management', href: '/child-panel/manage?tab=users', icon: Users },
  ];

  const adminNav = [
    { name: 'Admin Console', href: '/admin', icon: ShieldAlert, badge: 'Staff' },
    { name: 'Orders Monitor', href: '/admin/orders', icon: Package },
    {
      name: 'Support Helpdesk',
      href: '/admin/tickets',
      icon: Headphones,
      badge: adminUnreadCount > 0 ? `${adminUnreadCount} New` : undefined,
      isUnreadBadge: adminUnreadCount > 0
    },
    { name: 'Service Management', href: '/admin/services', icon: Sliders },
    { name: 'User Management', href: '/admin/users', icon: Users },
    { name: 'Platform Settings', href: '/admin/settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-60 bg-[#181a20] border-r border-[#2b303c] flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Mobile Header with Close Button */}
        <div className="flex items-center justify-between p-4 border-b border-[#2b303c] lg:hidden">
          <div className="flex items-center gap-2.5">
            {isChildPanel && logoUrl ? (
              <img
                src={logoUrl}
                alt={brandTitle}
                className="h-7 max-w-[120px] object-contain shrink-0 rounded"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            ) : !isChildPanel ? (
              <div
                className="w-8 h-8 rounded-xl text-slate-950 flex items-center justify-center font-black transition-colors"
                style={{ backgroundColor: accentColor }}
              >
                <Zap className="w-4 h-4 fill-slate-950 text-slate-950" />
              </div>
            ) : null}
            <span className="font-extrabold text-white text-sm">{brandTitle}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#222630]"
            aria-label="Close Sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div>
            <nav className="space-y-1">
              {customerNav.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    onClick={() => onClose()}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        isActive
                          ? 'text-slate-950 shadow-lg'
                          : 'text-slate-300 hover:text-white hover:bg-[#222630]'
                      }`
                    }
                    style={({ isActive }) =>
                      isActive
                        ? {
                            backgroundColor: accentColor,
                            boxShadow: `0 10px 15px -3px ${accentColor}40`,
                          }
                        : {}
                    }
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4" />
                      <span>{item.name}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={`px-1.5 py-0.5 text-[9px] font-black tracking-wide uppercase rounded flex items-center gap-1 ${
                          (item as any).isUnreadBadge
                            ? 'bg-rose-500 text-white animate-pulse shadow-sm shadow-rose-500/50'
                            : item.badge === 'M-Pesa'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-[#2b303c] text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {(item as any).isUnreadBadge && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {isAdmin && !isTenantMode && (
            <div className="pt-2 border-t border-[#2b303c]">
              <span className="px-3 text-[10px] font-black uppercase tracking-wider text-[#f59e0b] block mb-2">
                Staff Control
              </span>
              <nav className="space-y-1">
                {adminNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      onClick={() => onClose()}
                      className={({ isActive }) =>
                        `flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                          isActive
                            ? 'bg-[#f59e0b] text-slate-950 shadow-lg shadow-amber-500/20'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-[#222630]'
                        }`
                      }
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-3.5 h-3.5" />
                        <span>{item.name}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`px-1.5 py-0.5 text-[9px] font-black uppercase rounded flex items-center gap-1 ${
                            (item as any).isUnreadBadge
                              ? 'bg-rose-500 text-white animate-pulse shadow-sm shadow-rose-500/50'
                              : 'bg-[#2b303c] text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {(item as any).isUnreadBadge && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </nav>
            </div>
          )}

          {isTenantMode && isAuthenticated && isAdmin && (
            <div className="pt-2 border-t border-[#2b303c]">
              <span
                className="px-3 text-[10px] font-black uppercase tracking-wider block mb-2"
                style={{ color: accentColor }}
              >
                Panel Administration
              </span>
              <nav className="space-y-1">
                {childPanelStaffNav.map((item) => {
                  const Icon = item.icon;
                  const itemTab = item.href.includes('tab=') ? item.href.split('tab=')[1] : 'orders';
                  const currentTab = new URLSearchParams(location.search).get('tab') || 'orders';
                  const isCurrentActive = location.pathname.startsWith('/child-panel/manage') && currentTab === itemTab;

                  return (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      onClick={() => onClose()}
                      className={`flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                        isCurrentActive
                          ? 'text-slate-950 shadow-lg'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-[#222630]'
                      }`}
                      style={
                        isCurrentActive
                          ? {
                              backgroundColor: accentColor,
                              boxShadow: `0 10px 15px -3px ${accentColor}40`,
                            }
                          : {}
                      }
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-3.5 h-3.5" />
                        <span>{item.name}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`px-1.5 py-0.5 text-[9px] font-black uppercase rounded border ${
                            isCurrentActive
                              ? 'bg-slate-950/20 text-slate-950 border-slate-950/30'
                              : 'bg-[#2b303c] text-emerald-300 border-emerald-500/30'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </nav>
            </div>
          )}
        </div>

        {/* Footer active session status */}
        <div className="p-3 border-t border-[#2b303c] bg-[#14161a] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 truncate">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isAuthenticated ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              <div className="text-xs truncate">
                <span className="font-bold text-white block truncate">
                  {isAuthenticated && user ? `@${user.username}` : 'Guest'}
                </span>
                <span className="text-[10px] text-[#f59e0b] font-semibold">
                  {isAuthenticated && user ? `Ksh ${Number(user.balance || 0).toFixed(2)}` : 'Not Logged In'}
                </span>
              </div>
            </div>

            {isAuthenticated && (
              <button
                onClick={handleLogout}
                className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 transition-all flex items-center gap-1.5 text-xs font-bold shrink-0 active:scale-95"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
