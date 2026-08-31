import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { FloatingLowBalanceToast } from '../common/FloatingLowBalanceToast';

export const MainLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-[#121418] text-slate-100 w-full overflow-x-hidden">
      <Navbar onToggleSidebar={() => setIsSidebarOpen(true)} />

      <div className="flex flex-1 relative w-full overflow-x-hidden">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24 lg:pb-8 overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      <FloatingLowBalanceToast />
      <MobileNav />
    </div>
  );
};
