import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { ticketsService } from '../services/tickets';
import { useAuth } from './AuthContext';

interface TicketNotificationContextType {
  unreadCount: number;
  adminUnreadCount: number;
  refreshCounts: () => Promise<void>;
}

const TicketNotificationContext = createContext<TicketNotificationContextType | undefined>(undefined);

export const TicketNotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [adminUnreadCount, setAdminUnreadCount] = useState<number>(0);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const refreshCounts = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      setAdminUnreadCount(0);
      return;
    }

    try {
      // Customer unread tickets count
      const customerCount = await ticketsService.getUnreadCount();
      setUnreadCount(customerCount);

      // Admin unread count if staff
      if (isAdmin) {
        const staffCount = await ticketsService.getAdminUnreadCount();
        setAdminUnreadCount(staffCount);
      }
    } catch {
      // Silent catch on network hiccups or unauthorized
    }
  }, [isAuthenticated, isAdmin]);

  useEffect(() => {
    refreshCounts();

    if (!isAuthenticated) return;

    // Periodic poll every 15 seconds for real-time responsiveness
    const interval = setInterval(refreshCounts, 15000);

    // Refresh when user returns to window tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshCounts();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, refreshCounts]);

  return (
    <TicketNotificationContext.Provider value={{ unreadCount, adminUnreadCount, refreshCounts }}>
      {children}
    </TicketNotificationContext.Provider>
  );
};

export const useTicketNotifications = () => {
  const context = useContext(TicketNotificationContext);
  if (!context) {
    throw new Error('useTicketNotifications must be used within a TicketNotificationProvider');
  }
  return context;
};
