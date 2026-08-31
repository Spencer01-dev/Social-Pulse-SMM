import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Zap,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
  Filter,
  CheckCircle2,
  AlertCircle,
  Instagram,
  Facebook,
  Youtube,
  Music2,
  Twitter,
  Send,
  Headphones,
  Globe
} from 'lucide-react';
import { servicesService } from '../../services/services';
import { CustomerService, PlatformSummary, PlatformType } from '../../types';
import { useCurrency } from '../../context/CurrencyContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

export const ServicesPage: React.FC = () => {
  const { formatCurrency } = useCurrency();
  const [services, setServices] = useState<CustomerService[]>([]);
  const [platforms, setPlatforms] = useState<PlatformSummary[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCatalog = async () => {
    setLoading(true);
    setError(null);
    try {
      const [platformData, servicesData] = await Promise.all([
        servicesService.getPlatforms(),
        servicesService.getPublicServices({
          platform: selectedPlatform !== 'all' ? selectedPlatform : undefined,
          search: searchQuery || undefined,
        }),
      ]);
      setPlatforms(platformData);
      setServices(servicesData);
    } catch (err: any) {
      setError(err.message || 'Failed to load services catalog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, [selectedPlatform]);

  // Extract unique categories from current services list
  const categories = Array.from(new Set(services.map((s) => s.category))).filter(Boolean);

  const filteredServices = services.filter((s) => {
    const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getPlatformIcon = (platform: PlatformType) => {
    switch (platform) {
      case 'instagram':
        return <Instagram className="w-4 h-4 text-pink-400" />;
      case 'facebook':
        return <Facebook className="w-4 h-4 text-blue-400" />;
      case 'youtube':
        return <Youtube className="w-4 h-4 text-red-400" />;
      case 'tiktok':
        return <Music2 className="w-4 h-4 text-cyan-400" />;
      case 'twitter':
        return <Twitter className="w-4 h-4 text-sky-400" />;
      case 'telegram':
        return <Send className="w-4 h-4 text-blue-300" />;
      case 'spotify':
        return <Headphones className="w-4 h-4 text-emerald-400" />;
      default:
        return <Globe className="w-4 h-4 text-indigo-400" />;
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Services & Pricing <span className="text-gradient">Catalog</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Instant delivery, high-retention social media growth packages at wholesale prices
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/orders/new">
            <Button variant="primary" size="md" rightIcon={<ArrowRight className="w-4 h-4" />}>
              Create Order
            </Button>
          </Link>
        </div>
      </div>

      {/* Platform Selector Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none -mx-3.5 px-3.5 sm:mx-0 sm:px-0">
        <button
          onClick={() => {
            setSelectedPlatform('all');
            setSelectedCategory('all');
          }}
          className={`px-3.5 sm:px-4 py-2 rounded-xl sm:rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 shrink-0 ${
            selectedPlatform === 'all'
              ? 'bg-[#f59e0b] text-slate-950 shadow-lg shadow-amber-500/25 border border-amber-400'
              : 'bg-[#1b1f27] text-slate-300 hover:text-white hover:bg-[#252a35] border border-[#2b303c]'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>All Platforms</span>
        </button>

        {platforms.map((p) => (
          <button
            key={p.platform}
            onClick={() => {
              setSelectedPlatform(p.platform);
              setSelectedCategory('all');
            }}
            className={`px-3.5 sm:px-4 py-2 rounded-xl sm:rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 shrink-0 ${
              selectedPlatform === p.platform
                ? 'bg-[#f59e0b] text-slate-950 shadow-lg shadow-amber-500/25 border border-amber-400'
                : 'bg-[#1b1f27] text-slate-300 hover:text-white hover:bg-[#252a35] border border-[#2b303c]'
            }`}
          >
            {getPlatformIcon(p.platform)}
            <span>{p.name}</span>
            {p.service_count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                selectedPlatform === p.platform
                  ? 'bg-slate-950/20 text-slate-950 font-black'
                  : 'bg-slate-800 text-slate-300'
              }`}>
                {p.service_count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search & Category Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2 relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by service name, type (e.g. Followers, Likes, Views, Monetization)..."
            className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-800 rounded-2xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>

        <div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-2xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="all">All Categories ({categories.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Services List / Cards */}
      {loading ? (
        <div className="p-16 flex flex-col items-center justify-center glass-card rounded-3xl">
          <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-3" />
          <span className="text-sm text-slate-400">Loading catalog from database...</span>
        </div>
      ) : error ? (
        <div className="p-8 glass-card rounded-3xl text-center border-rose-500/30 bg-rose-950/10">
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-rose-300">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchCatalog} className="mt-4">
            Try Again
          </Button>
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="p-12 glass-card rounded-3xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto">
            <Filter className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">No services found</h3>
            <p className="text-xs text-slate-400 mt-1">
              Try adjusting your search query or sync the latest services from the Admin console.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredServices.map((service) => (
            <div
              key={service.id}
              className="glass-card rounded-2xl p-5 hover:border-slate-700/80 transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Platform & Badges header */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                      {getPlatformIcon(service.platform)}
                    </div>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {service.category}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {service.refill_available && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                        <RefreshCw className="w-2.5 h-2.5" /> Refill
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Instant
                    </span>
                  </div>
                </div>

                {/* Service Name */}
                <h4 className="text-sm sm:text-base font-bold text-white group-hover:text-blue-400 transition-colors leading-snug">
                  {service.name}
                </h4>

                {/* Description if present */}
                {service.description && (
                  <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                    {service.description}
                  </p>
                )}
              </div>

              {/* Pricing & Min/Max footer */}
              <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                    Rate per 1,000
                  </span>
                  <span className="text-lg font-extrabold text-amber-400">
                    {formatCurrency(Number(service.rate))}
                  </span>
                </div>

                <div className="text-right text-xs text-slate-400">
                  <span className="block text-[10px] uppercase font-semibold">Min / Max</span>
                  <span className="font-medium text-slate-300">
                    {service.min_quantity.toLocaleString()} – {service.max_quantity.toLocaleString()}
                  </span>
                </div>

                <Link to={`/orders/new?service=${service.id}`}>
                  <Button variant="primary" size="sm">
                    Order
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
