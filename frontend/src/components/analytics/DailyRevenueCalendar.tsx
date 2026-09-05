import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar as CalendarIcon,
  TrendingUp,
  DollarSign,
  PackageCheck,
  Sparkles,
  ArrowUpRight,
  X,
  Clock,
  Layers,
  Filter,
} from 'lucide-react';
import { DailyRevenue } from '../../services/analytics';
import { useCurrency } from '../../context/CurrencyContext';
import { Card } from '../common/Card';
import { Button } from '../common/Button';

interface DailyRevenueCalendarProps {
  dailyData: DailyRevenue[];
  onRefresh?: () => void;
  className?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  title?: string;
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

interface NotchedDropdownProps {
  label: string;
  value: string | number;
  displayValue?: string;
  options: { value: string | number; label: string }[];
  onChange: (val: any) => void;
  className?: string;
}

const NotchedDropdown: React.FC<NotchedDropdownProps> = ({
  label,
  value,
  displayValue,
  options,
  onChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative select-none ${className}`}>
      {/* Box with floating notched label */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`relative h-12 px-3.5 flex items-center justify-between rounded-lg bg-[#11141a] border transition-all cursor-pointer ${
          isOpen
            ? 'border-blue-400 ring-1 ring-blue-400 shadow-sm'
            : 'border-[#3c4250] hover:border-slate-400'
        }`}
      >
        {/* Floating notched label breaking top border */}
        <span
          className={`absolute -top-2.5 left-2.5 px-1.5 text-[11px] font-medium transition-colors pointer-events-none rounded ${
            isOpen ? 'text-blue-400' : 'text-slate-400'
          }`}
          style={{ backgroundColor: '#181a20' }}
        >
          {label}
        </span>

        {/* Current display value */}
        <span className="text-xs sm:text-sm font-medium text-white truncate pr-2">
          {displayValue ?? value}
        </span>

        {/* Arrow (Flipping chevron) */}
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-blue-400' : ''
          }`}
        />
      </div>

      {/* Popover Dropdown Menu (Material style) */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 z-50 max-h-64 overflow-y-auto bg-[#1c202a] border border-[#303744] rounded-lg shadow-2xl py-1 animate-fadeIn"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#475569 #1c202a',
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <div
                key={opt.value}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`px-3.5 py-2 text-xs sm:text-sm cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-blue-500/20 text-blue-300 font-bold'
                    : 'text-slate-200 hover:bg-[#252b38] hover:text-white'
                }`}
              >
                {opt.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const DailyRevenueCalendar: React.FC<DailyRevenueCalendarProps> = ({
  dailyData,
  onRefresh,
  className = '',
  title = 'Daily Revenue & Performance',
}) => {
  const { formatCurrency } = useCurrency();
  const today = new Date();

  // Date selection states: Date (Day), Month (0-11), Year
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(today.getDate());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth()); // 0-indexed
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());

  // Optional toggle for full monthly matrix grid (collapsed by default to avoid large space accumulation)
  const [showFullGrid, setShowFullGrid] = useState<boolean>(false);

  // Maximum days in the selected month & year
  const daysInSelectedMonth = useMemo(() => {
    return new Date(currentYear, currentMonth + 1, 0).getDate();
  }, [currentYear, currentMonth]);

  // Ensure selected day does not exceed days in month (e.g. Feb 30 -> Feb 28)
  const validDayNumber = Math.min(selectedDayNumber, daysInSelectedMonth);

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

  // Selected date key in YYYY-MM-DD
  const selectedDateKey = useMemo(() => {
    const mStr = String(currentMonth + 1).padStart(2, '0');
    const dStr = String(validDayNumber).padStart(2, '0');
    return `${currentYear}-${mStr}-${dStr}`;
  }, [currentYear, currentMonth, validDayNumber]);

  // Formatted date string in DD/MM/YYYY (e.g. 05/09/2026)
  const formattedDisplayDate = useMemo(() => {
    const dStr = String(validDayNumber).padStart(2, '0');
    const mStr = String(currentMonth + 1).padStart(2, '0');
    return `${dStr}/${mStr}/${currentYear}`;
  }, [validDayNumber, currentMonth, currentYear]);

  // Data for the chosen day
  const selectedDayData = useMemo(() => {
    const item = revenueMap.get(selectedDateKey);
    return {
      dateStr: selectedDateKey,
      revenue: item ? Number(item.revenue) : 0,
      profit: item ? Number(item.profit) : 0,
      ordersCount: item ? item.orders_count : 0,
    };
  }, [revenueMap, selectedDateKey]);

  // Human readable date for selected day
  const selectedDateHuman = useMemo(() => {
    try {
      const dt = new Date(currentYear, currentMonth, validDayNumber);
      return dt.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return formattedDisplayDate;
    }
  }, [currentYear, currentMonth, validDayNumber, formattedDisplayDate]);

  // Reset to today
  const handleGoToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDayNumber(today.getDate());
  };

  // Generate Year options around current year (2 years prior, current, 1 year ahead)
  const yearOptions = useMemo(() => {
    const baseYear = today.getFullYear();
    return [baseYear - 2, baseYear - 1, baseYear, baseYear + 1];
  }, [today]);

  // Generate Day numbers array (1 .. daysInSelectedMonth)
  const dayOptions = useMemo(() => {
    return Array.from({ length: daysInSelectedMonth }, (_, i) => i + 1);
  }, [daysInSelectedMonth]);

  // Generate grid cells for full month grid (when toggled)
  const calendarCells = useMemo((): DayCellData[] => {
    if (!showFullGrid) return [];

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

    // Next month filler days
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
  }, [showFullGrid, currentYear, currentMonth, revenueMap, today]);

  // Aggregate monthly stats for the current month
  const monthStats = useMemo(() => {
    let totalRev = 0;
    let totalProf = 0;
    let totalOrders = 0;
    let activeDays = 0;

    for (let d = 1; d <= daysInSelectedMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const revData = revenueMap.get(dateStr);
      if (revData) {
        const rev = Number(revData.revenue || 0);
        const prof = Number(revData.profit || 0);
        if (rev > 0) {
          totalRev += rev;
          totalProf += prof;
          totalOrders += revData.orders_count || 0;
          activeDays += 1;
        }
      }
    }

    return {
      totalRev,
      totalProf,
      totalOrders,
      activeDays,
    };
  }, [currentYear, currentMonth, daysInSelectedMonth, revenueMap]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Compact Date Search Card */}
      <div className="bg-[#181a20] border border-[#2b303c] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xl space-y-4">
        {/* Top Bar: Title & Dropdown Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-[#2b303c]/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                  {title}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/10 text-amber-400 border border-amber-500/25 font-mono">
                  {formattedDisplayDate}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Select Date, Month, and Year to inspect daily earnings and orders
              </p>
            </div>
          </div>

          {/* Notched Outline Dropdown Pickers: Day, Month, Year */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5 flex-1 min-w-[280px]">
              <NotchedDropdown
                label="Day"
                value={validDayNumber}
                displayValue={String(validDayNumber).padStart(2, '0')}
                options={dayOptions.map((d) => ({
                  value: d,
                  label: String(d).padStart(2, '0'),
                }))}
                onChange={setSelectedDayNumber}
                className="w-24 sm:w-28"
              />

              <NotchedDropdown
                label="Month"
                value={currentMonth}
                displayValue={MONTH_NAMES[currentMonth]}
                options={MONTH_NAMES.map((m, idx) => ({
                  value: idx,
                  label: m,
                }))}
                onChange={setCurrentMonth}
                className="flex-1 min-w-[140px]"
              />

              <NotchedDropdown
                label="Year"
                value={currentYear}
                displayValue={String(currentYear)}
                options={yearOptions.map((yr) => ({
                  value: yr,
                  label: String(yr),
                }))}
                onChange={setCurrentYear}
                className="w-24 sm:w-28"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGoToday}
                className="h-12 px-4 rounded-lg bg-[#11141a] hover:bg-[#202530] text-amber-400 hover:text-amber-300 border border-amber-500/30 text-xs font-bold transition-all shadow-sm flex items-center justify-center"
              >
                Today
              </button>

              {onRefresh && (
                <Button variant="ghost" size="md" onClick={onRefresh} className="h-12">
                  Refresh
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Selected Date Detail Banner */}
        <div className="bg-[#121418] border border-[#2b303c] rounded-2xl p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#2b303c]/50">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-extrabold text-sm">📅</span>
              <span className="text-xs sm:text-sm font-black text-white">
                {selectedDateHuman}
              </span>
              <span className="text-[11px] font-mono text-slate-400 font-bold">
                ({formattedDisplayDate})
              </span>
            </div>

            {selectedDayData.revenue > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Sales Day
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 font-medium">
                No orders recorded on this date
              </span>
            )}
          </div>

          {/* 3 Telemetry Metric Badges for the selected day */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
            <div className="p-3.5 bg-[#181a20] rounded-xl border border-[#2b303c] space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-blue-400" />
                Daily Revenue
              </span>
              <div className="text-lg font-black text-white font-mono">
                KES {selectedDayData.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div className="p-3.5 bg-[#181a20] rounded-xl border border-[#2b303c] space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                Net Profit
              </span>
              <div className="text-lg font-black text-emerald-400 font-mono">
                +KES {selectedDayData.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div className="p-3.5 bg-[#181a20] rounded-xl border border-[#2b303c] space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <PackageCheck className="w-3 h-3 text-amber-400" />
                Orders Dispatched
              </span>
              <div className="text-lg font-black text-amber-400 font-mono">
                {selectedDayData.ordersCount} {selectedDayData.ordersCount === 1 ? 'order' : 'orders'}
              </div>
            </div>
          </div>
        </div>

        {/* Compact Monthly Summary Strip & Grid Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 text-xs text-slate-400">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] font-bold text-slate-300">
              {MONTH_NAMES[currentMonth]} {currentYear} Totals:
            </span>
            <span className="text-slate-300">
              Rev: <strong className="text-white font-mono">KES {monthStats.totalRev.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
            <span className="text-slate-300">
              Profit: <strong className="text-emerald-400 font-mono">+KES {monthStats.totalProf.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
            <span className="text-slate-300">
              Orders: <strong className="text-amber-400 font-mono">{monthStats.totalOrders}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowFullGrid(!showFullGrid)}
            className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-amber-400 transition-colors self-start sm:self-auto"
          >
            <span>{showFullGrid ? 'Hide Month Grid' : 'Show Month Grid'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showFullGrid ? 'rotate-180 text-amber-400' : ''}`} />
          </button>
        </div>

        {/* Optional Expandable Month Grid (Only when user explicitly clicks "Show Month Grid") */}
        {showFullGrid && (
          <div className="pt-4 border-t border-[#2b303c]/60 space-y-3 animate-fade-in">
            <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center">
              {DAY_NAMES.map((d, i) => (
                <div
                  key={d}
                  className={`text-[10px] font-extrabold uppercase tracking-wider py-1 ${
                    i === 0 || i === 6 ? 'text-amber-400/70' : 'text-slate-400'
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {calendarCells.map((cell, idx) => {
                const isSelected = cell.isCurrentMonth && cell.dayNumber === validDayNumber;
                const hasRevenue = cell.revenue > 0;

                return (
                  <div
                    key={`${cell.dateStr}-${idx}`}
                    onClick={() => {
                      if (cell.isCurrentMonth) {
                        setSelectedDayNumber(cell.dayNumber);
                      }
                    }}
                    className={`min-h-[56px] sm:min-h-[70px] p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      !cell.isCurrentMonth
                        ? 'bg-[#11141a]/30 border-transparent opacity-30 cursor-not-allowed'
                        : isSelected
                        ? 'bg-[#1c212c] border-amber-400 ring-2 ring-amber-400/40'
                        : hasRevenue
                        ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-400'
                        : 'bg-[#11141a] border-[#252a36] hover:border-slate-600'
                    } ${cell.isToday ? 'border-amber-400/60' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-black ${
                          cell.isToday
                            ? 'w-4 h-4 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[9px] font-bold'
                            : isSelected
                            ? 'text-amber-400 font-bold'
                            : cell.isCurrentMonth
                            ? 'text-white'
                            : 'text-slate-500'
                        }`}
                      >
                        {cell.dayNumber}
                      </span>
                      {hasRevenue && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                      )}
                    </div>
                    {hasRevenue && (
                      <div className="text-[10px] font-black text-emerald-400 truncate font-mono">
                        +{cell.revenue >= 1000 ? `${(cell.revenue / 1000).toFixed(1)}k` : cell.revenue.toFixed(0)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
