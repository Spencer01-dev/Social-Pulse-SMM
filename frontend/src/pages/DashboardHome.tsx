import React from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  Zap,
  ShieldCheck,
  Globe2,
  Sparkles,
  ShoppingBag,
  CreditCard,
  Headphones,
  CheckCircle2,
  ArrowRight,
  Flame
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';

export const DashboardHome: React.FC = () => {
  const { user } = useAuth();
  const { formatCurrency } = useCurrency();

  const stats = [
    {
      title: 'Current Balance',
      value: formatCurrency(Number(user?.balance || 0)),
      change: 'Instant top-up ready',
      icon: Zap,
      accent: 'from-amber-500 to-amber-600',
    },
    {
      title: 'Active Campaigns',
      value: 'Instant Start',
      change: 'Zero delivery delay',
      icon: TrendingUp,
      accent: 'from-emerald-500 to-emerald-600',
    },
    {
      title: 'High-Speed Fulfillment',
      value: '99.9%',
      change: 'Automated live tracking',
      icon: Globe2,
      accent: 'from-blue-500 to-blue-600',
    },
    {
      title: 'Supported Gateways',
      value: 'M-Pesa & Card',
      change: 'Instant automated credit',
      icon: ShieldCheck,
      accent: 'from-orange-500 to-orange-600',
    },
  ];

  const quickCategories = [
    { name: 'TikTok Growth', tag: 'High Speed', icon: '🎵', desc: 'Views, Likes, Followers & Shares with start-count tracking', path: '/orders/new' },
    { name: 'Instagram Boost', tag: '0% Drop', icon: '📸', desc: 'Verified profile followers, post likes & reel impressions', path: '/orders/new' },
    { name: 'YouTube Campaigns', tag: 'Non-Drop', icon: '▶️', desc: 'Watch time hours, video views & organic channel subscribers', path: '/orders/new' },
    { name: 'Facebook Services', tag: 'Instant', icon: '👍', desc: 'Page likes, post reactions, video views & group members', path: '/orders/new' },
  ];

  const platformFeatures = [
    {
      title: 'Automated Start-Count Tracking',
      desc: 'Our intelligent tracking engine captures the exact initial baseline count of your post and monitors delivery progression in real-time.',
      icon: Zap,
    },
    {
      title: 'Instant Pan-African Top-Ups',
      desc: 'Deposit instantly with M-Pesa STK push, debit cards, and cryptocurrency with zero manual delays.',
      icon: CreditCard,
    },
    {
      title: 'Guaranteed Retention & Auto-Refill',
      desc: 'Premium high-quality services backed by automated refills and transparent order lifecycle updates.',
      icon: CheckCircle2,
    },
    {
      title: '24/7 Priority Support Helpdesk',
      desc: 'Dedicated support ticket system with rapid agent turnaround times for all campaign inquiries.',
      icon: Headphones,
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-amber-950/40 p-6 sm:p-10 border border-slate-800 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-wider mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Premier Social Growth Platform</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Scale Your Reach with <span className="text-[#f59e0b]">SocialPulse</span>
            </h1>
            <p className="mt-3 text-slate-300 text-sm sm:text-base leading-relaxed">
              The premier social media marketing platform for creators, brands, and agencies with instant automated fulfillment, verified high-retention services, and real-time live tracking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link to="/orders/new">
              <Button variant="primary" size="lg" className="shadow-lg shadow-amber-500/25">
                <ShoppingBag className="w-4 h-4 mr-2" />
                <span>Create New Order</span>
              </Button>
            </Link>
            <Link to="/services">
              <Button variant="outline" size="lg">
                <span>View Service Catalog</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Decorative ambient light */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
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
                <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${stat.accent} flex items-center justify-center text-slate-950 font-bold shadow-md`}>
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

      {/* Featured Growth Categories */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-400" />
              <span>Trending Growth Categories</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Select a platform to configure and launch your campaign instantly
            </p>
          </div>
          <Link to="/services" className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1">
            <span>All Services</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickCategories.map((cat, idx) => (
            <Link
              key={idx}
              to={cat.path}
              className="p-5 rounded-2xl bg-slate-950/40 hover:bg-slate-900/60 border border-slate-800/80 hover:border-amber-500/40 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl">{cat.icon}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {cat.tag}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                  {cat.name}
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  {cat.desc}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400 group-hover:text-white">
                <span className="font-medium">Order Now</span>
                <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Platform Features Grid */}
      <Card
        title="Why Choose SocialPulse"
        subtitle="Built for reliability, maximum retention, and seamless campaign execution"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {platformFeatures.map((feat, index) => {
            const Icon = feat.icon;
            return (
              <div
                key={index}
                className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/60 flex items-start gap-3.5"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">{feat.title}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};
