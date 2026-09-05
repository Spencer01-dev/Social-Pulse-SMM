import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  DollarSign,
  PackageCheck,
  Users,
  Wallet,
  Percent,
  RefreshCw,
  Sliders,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Activity,
  Award,
  Globe
} from 'lucide-react';
import {
  analyticsService,
  AnalyticsOverview,
  DailyRevenue,
  PlatformMetric,
  RecentActivity,
  TopService,
} from '../../services/analytics';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { DailyRevenueCalendar } from '../../components/analytics/DailyRevenueCalendar';

export const AdminDashboardPage: React.FC = () => {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetric[]>([]);
  const [topServices, setTopServices] = useState<TopService[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [revenueView, setRevenueView] = useState<'calendar' | 'chart'>('calendar');

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [over, daily, plat, top, act] = await Promise.all([
        analyticsService.getOverview().catch(() => null),
        analyticsService.getDailyRevenue(60).catch(() => []),
        analyticsService.getPlatformMetrics().catch(() => []),
        analyticsService.getTopServices(5).catch(() => []),
        analyticsService.getRecentActivity(10).catch(() => []),
      ]);

      if (over) setOverview(over);
      setDailyRevenue(daily);
      setPlatformMetrics(plat);
      setTopServices(top);
      setRecentActivity(act);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Compute max daily value for relative bar graph height
  const maxDailyRevenue = Math.max(...dailyRevenue.map((d) => Number(d.revenue)), 100);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
              Executive Console
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">Platform Analytics & Financials</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Real-time business performance, revenue margins, fulfillment telemetry, and customer activities
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchDashboardData}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh Telemetry
          </Button>

          <Link to="/admin/services">
            <Button variant="primary" size="md" leftIcon={<Sliders className="w-4 h-4" />}>
              Manage Services
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <Card className="flex items-center justify-between border-blue-500/20 bg-[#181a20]">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Total Platform Revenue
            </span>
            <span className="text-2xl font-extrabold text-white mt-1 block">
              KES {overview ? Number(overview.total_revenue).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
            </span>
            <span className="text-[11px] text-blue-400 font-medium block mt-0.5">
              Wholesale Cost: KES {overview ? Number(overview.total_provider_cost).toFixed(2) : '0.00'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </Card>

        {/* Gross Profit & Margin */}
        <Card className="flex items-center justify-between border-emerald-500/20 bg-[#181a20]">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Gross Profit Earned
            </span>
            <span className="text-2xl font-extrabold text-emerald-400 mt-1 block">
              +KES {overview ? Number(overview.total_gross_profit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
            </span>
            <span className="text-[11px] text-emerald-300 font-semibold block mt-0.5">
              {overview ? overview.profit_margin_percent : '0'}% Profit Margin
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
        </Card>

        {/* Total Orders Volume */}
        <Card className="flex items-center justify-between border-purple-500/20 bg-[#181a20]">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Fulfillment Orders
            </span>
            <span className="text-2xl font-extrabold text-white mt-1 block">
              {overview ? overview.total_orders_count.toLocaleString() : '0'}
            </span>
            <span className="text-[11px] text-purple-300 font-medium block mt-0.5">
              {overview ? overview.total_completed_orders : 0} Completed Delivered
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
            <PackageCheck className="w-6 h-6" />
          </div>
        </Card>

        {/* Total Active Users & Deposits */}
        <Card className="flex items-center justify-between border-indigo-500/20 bg-[#181a20]">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Registered Accounts
            </span>
            <span className="text-2xl font-extrabold text-white mt-1 block">
              {overview ? overview.total_active_users.toLocaleString() : '0'}
            </span>
            <span className="text-[11px] text-indigo-300 font-medium block mt-0.5">
              Deposits: KES {overview ? Number(overview.total_deposits_volume).toFixed(0) : '0'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </Card>
      </div>

      {/* Daily Revenue Chart & Platform Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue & Profit Tracking Section (Calendar or Bar Chart) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 bg-[#11141a] p-1 rounded-2xl border border-[#2b303c]">
              <button
                type="button"
                onClick={() => setRevenueView('calendar')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                  revenueView === 'calendar'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>📅 Daily Calendar View</span>
              </button>
              <button
                type="button"
                onClick={() => setRevenueView('chart')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                  revenueView === 'chart'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>📊 14-Day Trajectory Bar</span>
              </button>
            </div>
          </div>

          {revenueView === 'calendar' ? (
            <DailyRevenueCalendar
              dailyData={dailyRevenue}
              onRefresh={fetchDashboardData}
            />
          ) : (
            <Card
              title="14-Day Revenue & Profit Trajectory"
              subtitle="Daily sales performance and gross earnings"
            >
              <div className="h-64 flex items-end gap-2 pt-8 pb-2 px-2">
                {dailyRevenue.slice(-14).map((d, i) => {
                  const rev = Number(d.revenue);
                  const prof = Number(d.profit);
                  const heightPercent = Math.max((rev / maxDailyRevenue) * 100, 6);
                  const profitHeight = Math.max((prof / maxDailyRevenue) * 100, 3);

                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group relative h-full justify-end">
                      {/* Tooltip on hover */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 z-20 bg-slate-950 border border-slate-700 px-2.5 py-1.5 rounded-lg text-[10px] text-white shadow-xl pointer-events-none whitespace-nowrap">
                        <p className="font-bold">{d.date_label}</p>
                        <p className="text-blue-400">Rev: KES {rev.toFixed(0)}</p>
                        <p className="text-emerald-400">Profit: +KES {prof.toFixed(0)}</p>
                      </div>

                      {/* Dual Bar (Revenue + Profit) */}
                      <div className="w-full flex items-end justify-center gap-0.5 h-full">
                        <div
                          className="w-1/2 bg-blue-600/80 group-hover:bg-blue-500 rounded-t-md transition-all duration-300"
                          style={{ height: `${heightPercent}%` }}
                        />
                        <div
                          className="w-1/2 bg-emerald-500/80 group-hover:bg-emerald-400 rounded-t-md transition-all duration-300"
                          style={{ height: `${profitHeight}%` }}
                        />
                      </div>

                      <span className="text-[10px] text-slate-500 transform -rotate-45 truncate origin-top-left mt-1">
                        {d.date_label.split(' ')[1]}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-center gap-6 pt-4 border-t border-slate-800 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-blue-600 inline-block" />
                  <span>Gross Revenue (KES)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
                  <span>Net Profit (KES)</span>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Platform Share Distribution */}
        <Card title="Platform Distribution" subtitle="Order volume by social network">
          <div className="space-y-3.5 mt-2">
            {platformMetrics.map((p) => (
              <div key={p.platform} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-300">
                      {p.platform}
                    </span>
                    <span className="font-semibold text-white">{p.name}</span>
                  </div>
                  <span className="font-mono text-emerald-400 font-bold">
                    +KES {Number(p.profit).toFixed(0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>{p.orders_count} orders</span>
                  <span>Rev: KES {Number(p.revenue).toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Top Services & Live Activity Feed Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Services Leaderboard */}
        <Card title="Top Performing Services" subtitle="Highest revenue generating growth packages">
          {topServices.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No service sales records yet. Place orders to generate performance statistics.
            </div>
          ) : (
            <div className="space-y-3 mt-1">
              {topServices.map((s, idx) => (
                <div
                  key={s.service_id}
                  className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                      #{idx + 1}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">{s.name}</h4>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span className="uppercase font-semibold text-slate-500">{s.platform}</span>
                        <span>•</span>
                        <span>{s.orders_count} orders fulfilled</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono flex-shrink-0">
                    <span className="text-xs font-extrabold text-white block">
                      KES {Number(s.total_revenue).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-emerald-400 font-semibold block">
                      +KES {Number(s.total_profit).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Live Activity Feed */}
        <Card title="Live Platform Activity" subtitle="Real-time stream of incoming orders and deposits">
          {recentActivity.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No activity recorded recently.</div>
          ) : (
            <div className="space-y-3 mt-1">
              {recentActivity.map((act) => (
                <div
                  key={act.id}
                  className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        act.event_type === 'deposit'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-blue-500/15 text-blue-400'
                      }`}
                    >
                      <Activity className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">{act.title}</h4>
                      <p className="text-[11px] text-slate-400 truncate">{act.subtitle}</p>
                    </div>
                  </div>

                  {act.amount !== undefined && (
                    <div className="text-right font-mono flex-shrink-0">
                      <span className="text-xs font-extrabold text-emerald-400 block">
                        {act.currency} {Number(act.amount).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
