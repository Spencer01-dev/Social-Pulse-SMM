import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, ListOrdered, CreditCard, Layers } from 'lucide-react';

export const MobileNav: React.FC = () => {
  const items = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Services', href: '/services', icon: Layers },
    { name: 'New Order', href: '/orders/new', icon: PlusCircle, isPrimary: true },
    { name: 'Orders', href: '/orders', icon: ListOrdered },
    { name: 'Add Funds', href: '/deposit', icon: CreditCard },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0B0F19]/90 backdrop-blur-xl border-t border-slate-800 px-2 py-2 flex items-center justify-around">
      {items.map((item) => {
        const Icon = item.icon;
        if (item.isPrimary) {
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className="flex flex-col items-center justify-center -mt-5"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/40 active:scale-95 transition-transform border-4 border-[#0B0F19]">
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-semibold text-blue-400 mt-0.5">{item.name}</span>
            </NavLink>
          );
        }

        return (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-colors ${
                isActive ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-1">{item.name}</span>
          </NavLink>
        );
      })}
    </nav>
  );
};
