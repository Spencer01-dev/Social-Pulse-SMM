import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  Activity,
  Server,
  Zap,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Globe2,
  Clock
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { systemService } from '../services/api';
import { HealthStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';

export const DashboardHome: React.FC = () => {
  const { user } = useAuth();
  const { formatCurrency } = useCurrency();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loadingHealth, setLoadingHealth] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoadingHealth(true);
    setError(null);
    try {
      const data = await systemService.getHealth();
      setHealth(data);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to SocialPulse Backend API');
    } finally {
      setLoadingHealth(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const stats = [
    {
      title: 'Current Balance',
      value: formatCurrency(Number(user?.balance || 0)),
      change: 'Instant top-up ready',
      isPositive: true,
      icon: Zap,
      accent: 'from-amber-500 to-amber-600',
    },
    {
      title: 'Active Orders',
      value: '0',
      change: 'All orders processed',
      isPositive: true,
      icon: TrendingUp,
      accent: 'from-indigo-600 to-purple-600',
    },
    {
      title: 'Total Spent',
      value: 'KES 0.00',
      change: 'Lifetime expenditure',
      isPositive: true,
      icon: Activity,
      accent: 'from-emerald-600 to-teal-600',
    },
    {
      title: 'API Status',
      value: health?.status === 'healthy' ? 'Operational' : 'Initializing',
      change: health ? `Latency: ${health.database.latency_ms ?? 0}ms` : 'Checking backend...',
      isPositive: health?.status === 'healthy',
      icon: Server,
      accent: 'from-amber-600 to-orange-600',
    },
  ];

  const phases = [
    { id: 1, title: 'Phase 1: Project Core & Scaffolding', status: 'completed', desc: 'FastAPI, React/Vite, PostgreSQL, Docker Compose, Architecture' },
    { id: 2, title: 'Phase 2: Authentication & User Roles', status: 'upcoming', desc: 'JWT, Refresh tokens, Roles (Customer, Reseller, Admin)' },
    { id: 3, title: 'Phase 3: Services & Delix Gains Provider', status: 'completed', desc: 'Delix Gains sync, category mapping, price markup system' },
    { id: 4, title: 'Phase 4: Orders Engine & Workers', status: 'upcoming', desc: 'Order lifecycle, background status sync, auto-refunds' },
    { id: 5, title: 'Phase 5: Wallet Ledger & M-Pesa', status: 'upcoming', desc: 'Double-entry ledger, Daraja API STK Push, instant credit' },
    { id: 6, title: 'Phase 6: Crypto (OKX & Binance)', status: 'upcoming', desc: 'OKX Pay & Binance Merchant APIs, server-side validation' },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-purple-900/20 border border-blue-500/20 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-400/20 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-4">
              <SparklesIcon className="w-3.5 h-3.5" /> Next-Gen SMM SaaS Reseller
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
              Welcome to <span className="text-gradient">SocialPulse</span>
            </h1>
            <p className="mt-2 text-slate-300 text-sm sm:text-base leading-relaxed">
              High-throughput social media marketing automation platform powered by FastAPI, asynchronous PostgreSQL, and Delix Gains KE provider integration.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="md">
              Create New Order
            </Button>
            <Button variant="outline" size="md">
              Explore Services
            </Button>
          </div>
        </div>

        {/* Decorative ambient light */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i} className="relative overflow-hidden hover:border-slate-700/80 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {stat.title}
                </span>
                <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${stat.accent} flex items-center justify-center text-white shadow-md`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>

              <div className="mt-4">
                <div className="text-2xl font-extrabold text-white tracking-tight">
                  {stat.value}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                  <span>{stat.change}</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Grid: System Status Diagnostic & Platform Roadmap */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Diagnostic Panel */}
        <Card
          title="System Architecture Diagnostics"
          subtitle="Real-time connectivity check across core services"
          className="lg:col-span-1"
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchHealth}
              isLoading={loadingHealth}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh
            </Button>
          }
        >
          <div className="space-y-4">
            {/* Backend API status */}
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <Globe2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">FastAPI Backend</h4>
                  <p className="text-xs text-slate-400">REST API v1</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                health ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {health ? 'Online' : 'Pending'}
              </span>
            </div>

            {/* PostgreSQL status */}
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">PostgreSQL 16</h4>
                  <p className="text-xs text-slate-400">
                    {health?.database.message || 'Database connection pool'}
                  </p>
                </div>
              </div>
              <span className="text-xs font-medium text-slate-300">
                {health?.database.latency_ms ? `${health.database.latency_ms}ms` : 'Ready'}
              </span>
            </div>

            {/* Redis & Celery status */}
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Redis 7 & Celery</h4>
                  <p className="text-xs text-slate-400">
                    {health?.redis.message || 'Task broker & cache'}
                  </p>
                </div>
              </div>
              <span className="text-xs font-medium text-slate-300">
                {health?.redis.latency_ms ? `${health.redis.latency_ms}ms` : 'Ready'}
              </span>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>Backend offline. Start backend on port 8000.</span>
              </div>
            )}
          </div>
        </Card>

        {/* Development Roadmap */}
        <Card
          title="Modular Platform Roadmap"
          subtitle="Systematic 10-phase enterprise implementation progress"
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {phases.map((phase) => (
              <div
                key={phase.id}
                className={`p-4 rounded-xl border transition-all ${
                  phase.status === 'completed'
                    ? 'bg-blue-950/20 border-blue-500/30'
                    : 'bg-slate-950/40 border-slate-800/60 opacity-80'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    {phase.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-slate-500" />
                    )}
                    {phase.title}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                    phase.status === 'completed'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {phase.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">{phase.desc}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
      <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  );
}
