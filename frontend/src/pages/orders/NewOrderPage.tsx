import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Zap,
  Layers,
  Link as LinkIcon,
  Hash,
  AlertCircle,
  CheckCircle2,
  Wallet,
  ArrowRight,
  Info,
  RefreshCw,
  Plus
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/auth';
import { servicesService } from '../../services/services';
import { ordersService } from '../../services/orders';
import { CustomerService, PlatformType } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

export const NewOrderPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const preselectedServiceId = searchParams.get('service');

  const { user, refreshUserProfile } = useAuth();
  const navigate = useNavigate();

  const [services, setServices] = useState<CustomerService[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);

  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');

  const [targetLink, setTargetLink] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [customComments, setCustomComments] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [addingFunds, setAddingFunds] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<any | null>(null);

  const fetchServices = async () => {
    setLoadingServices(true);
    try {
      const data = await servicesService.getPublicServices();
      setServices(data);

      // Pre-select service if passed in query param
      if (preselectedServiceId && data.some((s) => s.id === preselectedServiceId)) {
        const match = data.find((s) => s.id === preselectedServiceId);
        if (match) {
          setSelectedPlatform(match.platform);
          setSelectedCategory(match.category);
          setSelectedServiceId(match.id);
          setQuantity(Math.max(match.min_quantity || 100, 100));
        }
      } else if (data.length > 0) {
        setSelectedServiceId(data[0].id);
        setQuantity(Math.max(data[0].min_quantity || 100, 100));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingServices(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, [preselectedServiceId]);

  // Selected service object
  const currentService = services.find((s) => s.id === selectedServiceId);

  // Categories for current platform
  const availableCategories = Array.from(
    new Set(
      services
        .filter((s) => selectedPlatform === 'all' || s.platform === selectedPlatform)
        .map((s) => s.category)
    )
  ).filter(Boolean);

  // Filtered services for current platform & category
  const filteredServices = services.filter((s) => {
    const matchesPlatform = selectedPlatform === 'all' || s.platform === selectedPlatform;
    const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory;
    return matchesPlatform && matchesCategory;
  });

  // Calculate live charge
  const numQuantity = typeof quantity === 'number' ? quantity : 0;
  const calculatedCharge = currentService
    ? Number(((currentService.rate * numQuantity) / 1000).toFixed(2))
    : 0;

  const userBalance = Number(user?.balance || 0);
  const hasInsufficientBalance = calculatedCharge > userBalance;

  const handleAddTestFunds = async () => {
    setAddingFunds(true);
    try {
      await authService.addSandboxFunds(1000);
      await refreshUserProfile();
      setError(null);
    } catch (err: any) {
      console.error(err);
    } finally {
      setAddingFunds(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentService) {
      setError('Please select a valid service.');
      return;
    }
    if (!targetLink.trim()) {
      setError('Please enter a target profile or post link.');
      return;
    }
    const effectiveMin = Math.max(currentService.min_quantity || 100, 100);
    if (!numQuantity || numQuantity < effectiveMin) {
      setError(`Minimum order quantity is ${effectiveMin.toLocaleString()} (orders below 100 are not permitted).`);
      return;
    }
    if (numQuantity > currentService.max_quantity) {
      setError(`Maximum quantity for this service is ${currentService.max_quantity.toLocaleString()}.`);
      return;
    }
    if (hasInsufficientBalance) {
      setError(`Insufficient balance. Required: KES ${calculatedCharge.toFixed(2)} | Available: KES ${userBalance.toFixed(2)}. Add test funds or deposit to continue.`);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const order = await ordersService.createOrder({
        service_id: currentService.id,
        target_link: targetLink.trim(),
        quantity: numQuantity,
        custom_comments: customComments ? customComments.trim() : undefined,
      });

      await refreshUserProfile();
      setSuccessOrder(order);
      setTimeout(() => {
        navigate('/orders');
      }, 2000);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to place order. Please try again.';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Create New Order</h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure your campaign parameters and submit instant delivery orders
          </p>
        </div>

        {/* Live Balance Pill & Quick Add Funds Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAddTestFunds}
            disabled={addingFunds}
            className="px-3 py-2 rounded-2xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            title="Click to add KES 1,000 sandbox balance instantly for testing"
          >
            <Zap className="w-3.5 h-3.5 text-blue-400" />
            <span>{addingFunds ? 'Adding...' : '+KES 1,000 Test Funds'}</span>
          </button>

          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-inner">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block">
                Available Balance
              </span>
              <span className="text-sm font-extrabold text-emerald-400">
                KES {userBalance.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {successOrder && (
        <div className="p-6 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-4 animate-fadeIn">
          <CheckCircle2 className="w-8 h-8 flex-shrink-0 text-emerald-400" />
          <div>
            <h4 className="text-base font-bold text-white">Order #{successOrder.id.substring(0, 8)} Placed Successfully!</h4>
            <p className="text-xs text-emerald-300/90 mt-0.5">
              Your order has been dispatched to the delivery network. Redirecting to your order history...
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span>{error}</span>
            {hasInsufficientBalance && (
              <div className="mt-3 flex items-center gap-3">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleAddTestFunds}
                  isLoading={addingFunds}
                  leftIcon={<Zap className="w-3.5 h-3.5" />}
                >
                  Add Test Funds
                </Button>
                <Link to="/deposit">
                  <Button type="button" variant="secondary" size="sm">
                    Deposit Funds
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Order Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card title="1. Select Service & Platform" subtitle="Choose the exact growth package you wish to purchase">
          <div className="space-y-4">
            {/* Category Dropdown */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  const firstInCat = services.find(
                    (s) => e.target.value === 'all' || s.category === e.target.value
                  );
                  if (firstInCat) {
                    setSelectedServiceId(firstInCat.id);
                    setQuantity(Math.max(firstInCat.min_quantity || 100, 100));
                  }
                }}
                className="w-full px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Categories ({availableCategories.length})</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Service Selection */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Service Package
              </label>
              <select
                value={selectedServiceId}
                onChange={(e) => {
                  setSelectedServiceId(e.target.value);
                  const matched = services.find((s) => s.id === e.target.value);
                  if (matched) setQuantity(Math.max(matched.min_quantity || 100, 100));
                }}
                className="w-full px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
                required
              >
                {filteredServices.length === 0 ? (
                  <option value="">No services found. Please sync from Admin Console.</option>
                ) : (
                  filteredServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      [{s.platform.toUpperCase()}] {s.name} — KES {Number(s.rate).toFixed(2)}/1k
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Selected Service Features Info Box */}
            {currentService && (
              <div className="p-4 rounded-2xl bg-blue-950/20 border border-blue-500/20 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-300 font-semibold">
                    Rate: <span className="text-emerald-400 font-bold">KES {Number(currentService.rate).toFixed(2)}</span> per 1,000
                  </span>
                  <span className="text-slate-400">
                    Min: <strong className="text-white">{Math.max(currentService.min_quantity || 100, 100).toLocaleString()}</strong> | Max: <strong className="text-white">{currentService.max_quantity.toLocaleString()}</strong>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {currentService.refill_available && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Refill Guarantee
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Instant Start
                    </span>
                  </div>
                </div>

                {currentService.description && (
                  <p className="text-xs text-slate-300/80 pt-1 border-t border-slate-800/80 leading-relaxed">
                    {currentService.description}
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card title="2. Order Target & Quantity" subtitle="Enter your URL link and quantity">
          <div className="space-y-4">
            {/* Target Link */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Target Link / URL *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <LinkIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={targetLink}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const urlMatch = raw.match(/https?:\/\/[^\s<>"]+|www\.[^\s<>"]+/);
                    if (urlMatch) {
                      let clean = urlMatch[0];
                      if (clean.includes('tiktok.com') || clean.includes('instagram.com') || clean.includes('facebook.com')) {
                        clean = clean.split('?')[0];
                      }
                      setTargetLink(clean);
                    } else {
                      setTargetLink(raw);
                    }
                  }}
                  placeholder="Paste TikTok, Instagram, or Facebook link (e.g. https://www.tiktok.com/@user/video/...)"
                  className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 font-mono text-xs"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Make sure account or post privacy is set to Public.</p>
            </div>

            {/* Quantity Input */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Quantity *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Hash className="w-4 h-4" />
                </div>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="1000"
                  className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
                  min={Math.max(currentService?.min_quantity || 100, 100)}
                  max={currentService?.max_quantity || 100000}
                  required
                />
              </div>
            </div>

            {/* Custom comments if applicable */}
            {currentService?.service_type.toLowerCase().includes('comment') && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Custom Comments (1 per line)
                </label>
                <textarea
                  value={customComments}
                  onChange={(e) => setCustomComments(e.target.value)}
                  placeholder="Great post!🔥&#10;Love this picture! ❤️&#10;Keep it up! 👏"
                  rows={4}
                  className="w-full px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
          </div>
        </Card>

        {/* Price Summary & Submit Box */}
        <div className="p-6 glass-card rounded-3xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-2xl">
          <div>
            <span className="text-xs uppercase font-bold tracking-wider text-slate-400 block">
              Total Order Charge
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-extrabold text-emerald-400">
                KES {calculatedCharge.toFixed(2)}
              </span>
              <span className="text-xs text-slate-400">
                ({numQuantity.toLocaleString()} units @ KES {currentService?.rate || 0}/1k)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="px-8 shadow-lg shadow-blue-500/25"
              isLoading={submitting}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Confirm & Submit Order
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};
