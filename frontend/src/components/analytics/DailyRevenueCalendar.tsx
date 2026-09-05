import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  TrendingUp,
  DollarSign,
  PackageCheck,
  Sparkles,
  ArrowUpRight,
  X,
  Clock,
  Layers,
} from 'lucide-react';
import { DailyRevenue } from '../../services/analytics';
import { useCurrency } from '../../context/CurrencyContext';
import { Card } from '../common/Card';
import { Button } from '../common/Button';

interface DailyRevenueCalendarProps {
  dailyData: DailyRevenue[];
  onRefresh?: () => void;
  className?: string;
}

interface DayCellData {
  dayNumber: number;
  dateStr: string; // YYYY-MM-DD
  isCurrentMonth: boolean;
  isToday: boolean;
  revenue: number;
  profit: number;
  ordersCount: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const DailyRevenueCalendar: React.FC<DailyRevenueCalendarProps> = ({
  dailyData,
  onRefresh,
  className = '',
}) => {
  const { formatCurrency } = useCurrency();
  const today = new Date();

  // State for currently viewed month and year
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState<DayCellData | null>(null);

  // Quick lookup map: "YYYY-MM-DD" -> DailyRevenue
  const revenueMap = useMemo(() => {
    const map = new Map<string, DailyRevenue>();
    dailyData.forEach((item) => {
      if (item.full_date) {
        map.set(item.full_date, item);
      } else if (item.date_label) {
        // Fallback: match "Sep 05" style labels for current year
        const parts = item.date_label.trim().split(' ');
        if (parts.length === 2) {
          const mIdx = MONTH_NAMES.findIndex(
            (m) => m.substring(0, 3).toLowerCase() === parts[0].toLowerCase()
          );
          if (mIdx >= 0) {
            const dNum = parseInt(parts[1], 10);
            if (!isNaN(dNum)) {
              const dStr = `${currentYear}-${String(mIdx + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
              map.set(dStr, item);
            }
          }
        }
      }
    });
    return map;
  }, [dailyData, currentYear]);

  // Navigate months
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((prev) => prev - 1);
    } else {
      setCurrentMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((prev) => prev + 1);
    } else {
      setCurrentMonth((prev) => prev + 1);
    }
  };

  const handleGoToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };

  // Generate the 35 or 42 calendar grid cells
  const calendarCells = useMemo((): DayCellData[] => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const cells: DayCellData[] = [];
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Previous month filler days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dNum = daysInPrevMonth - i;
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
      const revData = revenueMap.get(dateStr);

      cells.push({
        dayNumber: dNum,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        revenue: revData ? Number(revData.revenue) : 0,
        profit: revData ? Number(revData.profit) : 0,
        ordersCount: revData ? revData.orders_count : 0,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const revData = revenueMap.get(dateStr);

      cells.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        revenue: revData ? Number(revData.revenue) : 0,
        profit: revData ? Number(revData.profit) : 0,
        ordersCount: revData ? revData.orders_count : 0,
      });
    }

    // Next month filler days to complete grid rows
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let n = 1; n <= remaining; n++) {
      const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
      const revData = revenueMap.get(dateStr);

      cells.push({
        dayNumber: n,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        revenue: revData ? Number(revData.revenue) : 0,
        profit: revData ? Number(revData.profit) : 0,
        ordersCount: revData ? revData.orders_count : 0,
      });
    }

    return cells;
  }, [currentYear, currentMonth, revenueMap, today]);

  // Aggregate monthly stats for the current month
  const monthStats = useMemo(() => {
    let totalRev = 0;
    let totalProf = 0;
    let totalOrders = 0;
    let activeDays = 0;

    calendarCells.forEach((c) => {
      if (c.isCurrentMonth && c.revenue > 0) {
        totalRev += c.revenue;
        totalProf += c.profit;
        totalOrders += c.ordersCount;
        activeDays += 1;
      }
    });

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const avgDaily = daysInMonth > 0 ? totalRev / daysInMonth : 0;

    return {
      totalRev,
      totalProf,
      totalOrders,
      activeDays,
      avgDaily,
    };
  }, [calendarCells, currentYear, currentMonth]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Calendar Card Container */}
      <div className="bg-[#181a20] border border-[#2b303c] rounded-3xl p-5 sm:p-7 shadow-xl">
        {/* Navigation & Month Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#2b303c]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white tracking-tight">
                  {MONTH_NAMES[currentMonth]} {currentYear}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Daily Tracker
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Click any day to review daily earnings, profits, and fulfillment activity
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGoToday}
              className="px-3 py-1.5 rounded-xl bg-[#11141a] hover:bg-[#202530] text-slate-300 border border-[#2b303c] text-xs font-bold transition-all"
            >
              Today
            </button>

            <div className="flex items-center bg-[#11141a] border border-[#2b303c] rounded-xl p-0.5">
              <button
                onClick={handlePrevMonth}
                aria-label="Previous Month"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#202530] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNextMonth}
                aria-label="Next Month"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#202530] transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {onRefresh && (
              <Button variant="ghost" size="sm" onClick={onRefresh}>
                Refresh
              </Button>
            )}
          </div>
        </div>

        {/* Monthly Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-b border-[#2b303c]">
          <div className="p-3 bg-[#11141a] rounded-2xl border border-[#2b303c] space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <DollarSign className="w-3 h-3 text-blue-400" />
              Month Revenue
            </span>
            <div className="text-base sm:text-lg font-black text-white">
              KES {monthStats.totalRev.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="p-3 bg-[#11141a] rounded-2xl border border-[#2b303c] space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              Month Profit
            </span>
            <div className="text-base sm:text-lg font-black text-emerald-400">
              +KES {monthStats.totalProf.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="p-3 bg-[#11141a] rounded-2xl border border-[#2b303c] space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <PackageCheck className="w-3 h-3 text-amber-400" />
              Orders Dispatched
            </span>
            <div className="text-base sm:text-lg font-black text-amber-400">
              {monthStats.totalOrders.toLocaleString()} orders
            </div>
          </div>

          <div className="p-3 bg-[#11141a] rounded-2xl border border-[#2b303c] space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" />
              Active Sales Days
            </span>
            <div className="text-base sm:text-lg font-black text-purple-300">
              {monthStats.activeDays} days
            </div>
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 pt-4 pb-2 text-center">
          {DAY_NAMES.map((d, i) => (
            <div
              key={d}
              className={`text-[11px] font-extrabold uppercase tracking-wider py-1 ${
                i === 0 || i === 6 ? 'text-amber-400/70' : 'text-slate-400'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Day Cells Grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {calendarCells.map((cell, idx) => {
            const hasRevenue = cell.revenue > 0;
            const isSelected = selectedDay?.dateStr === cell.dateStr;

            return (
              <div
                key={`${cell.dateStr}-${idx}`}
                onClick={() => setSelectedDay(cell)}
                className={`min-h-[78px] sm:min-h-[96px] p-2 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between relative group ${
                  !cell.isCurrentMonth
                    ? 'bg-[#11141a]/40 border-transparent opacity-40 hover:opacity-80'
                    : hasRevenue
                    ? 'bg-gradient-to-b from-emerald-950/25 to-[#161a22] border-emerald-500/30 hover:border-emerald-400 shadow-md shadow-emerald-950/20'
                    : 'bg-[#11141a] border-[#252a36] hover:border-slate-600 hover:bg-[#151821]'
                } ${cell.isToday ? 'ring-2 ring-amber-400/80 border-amber-400/50' : ''} ${
                  isSelected ? '!border-amber-400 !bg-[#1c212c] ring-2 ring-amber-400/40' : ''
                }`}
              >
                {/* Top Row: Day Number & Indicators */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-black ${
                      cell.isToday
                        ? 'w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-[10px]'
                        : cell.isCurrentMonth
                        ? 'text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>

                  {hasRevenue && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
                  )}
                </div>

                {/* Bottom Content: Revenue & Profit Badges */}
                <div className="mt-1.5 space-y-0.5">
                  {hasRevenue ? (
                    <>
                      <div className="text-[11px] sm:text-xs font-black text-emerald-400 truncate">
                        KES {cell.revenue >= 1000 ? `${(cell.revenue / 1000).toFixed(1)}k` : cell.revenue.toFixed(0)}
                      </div>
                      <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 flex items-center justify-between">
                        <span className="text-emerald-500 font-mono">+{cell.profit.toFixed(0)}</span>
                        <span className="text-[9px] text-slate-400 hidden sm:inline font-mono">
                          {cell.ordersCount} {cell.ordersCount === 1 ? 'ord' : 'ords'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="text-[10px] text-slate-600 font-mono hidden sm:block">
                      —
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Detail Popover / Modal */}
      {selectedDay && (
        <div className="p-5 sm:p-6 bg-[#161a22] border border-amber-500/40 rounded-3xl shadow-2xl animate-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center font-black text-sm">
                📅
              </div>
              <div>
                <h4 className="text-sm font-black text-white">
                  Revenue Breakdown: {selectedDay.dateStr}
                </h4>
                <p className="text-[11px] text-slate-400">
                  {new Date(selectedDay.dateStr + 'T00:00:00').toLocaleDateString(undefined, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>

            <button
              onClick={() => setSelectedDay(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-[#11141a] rounded-2xl border border-[#2b303c]">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Gross Revenue</span>
              <div className="text-lg font-black text-white mt-0.5">
                KES {selectedDay.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div className="p-3 bg-[#11141a] rounded-2xl border border-[#2b303c]">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Clean Net Profit</span>
              <div className="text-lg font-black text-emerald-400 mt-0.5">
                +KES {selectedDay.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div className="p-3 bg-[#11141a] rounded-2xl border border-[#2b303c]">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Orders Dispatched</span>
              <div className="text-lg font-black text-amber-400 mt-0.5">
                {selectedDay.ordersCount} orders
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
