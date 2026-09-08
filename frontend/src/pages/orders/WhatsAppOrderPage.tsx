import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Copy,
  Check,
  Star,
  HelpCircle,
  Phone,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { servicesService } from '../../services/services';
import { ordersService } from '../../services/orders';
import { CustomerService } from '../../types';

interface CountryPreset {
  id: string; // provider_service_id or service id
  code: string;
  name: string;
  flag: string;
  prefix: string;
  price: number;
  locationName: string;
  quality: string;
  title: string;
  providerId: string;
}

const COUNTRY_PRESETS: CountryPreset[] = [
  {
    id: '6048',
    providerId: '6048',
    code: 'us',
    name: 'USA',
    flag: '🇺🇸',
    prefix: '+1',
    price: 500,
    locationName: 'United States 🇺🇸',
    quality: 'Verified & Stable USA Numbers',
    title: '7️⃣ WhatsApp Numbers 🇺🇸 +1 | USA Numbers | Verified & Stable 💎 | Fast Delivery 🚀',
  },
  {
    id: '6049',
    providerId: '6049',
    code: 'ca',
    name: 'Canada',
    flag: '🇨🇦',
    prefix: '+1',
    price: 285,
    locationName: 'Canada 🇨🇦',
    quality: 'High Quality 💫 | Instant Start ⚡',
    title: '6️⃣ WhatsApp Numbers 🇨🇦 +1 | Canada Numbers | High Quality 💫 | Instant Start ⚡',
  },
  {
    id: '6051',
    providerId: '6051',
    code: 'uk',
    name: 'England',
    flag: '🏴',
    prefix: '+44',
    price: 450,
    locationName: 'England 🏴',
    quality: 'Real & Trusted ✅ | Fast Delivery ⚡',
    title: '4️⃣ WhatsApp Numbers 🏴 +44 | England Numbers | Real & Trusted ✅ | Fast Delivery ⚡',
  },
  {
    id: '6052',
    providerId: '6052',
    code: 'za',
    name: 'South Africa',
    flag: '🇿🇦',
    prefix: '+27',
    price: 285,
    locationName: 'South Africa 🇿🇦',
    quality: 'Real Users 🌍 | Instant Delivery 🚀',
    title: '5️⃣ WhatsApp Numbers 🇿🇦 +27 | South Africa Numbers | Real Users 🌍 | Instant Delivery 🚀',
  },
  {
    id: '6053',
    providerId: '6053',
    code: 'fr',
    name: 'France',
    flag: '🇫🇷',
    prefix: '+33',
    price: 1050,
    locationName: 'France 🇫🇷',
    quality: 'Premium Quality 🔥 | Instant Delivery ⚡',
    title: '8️⃣ WhatsApp Numbers 🇫🇷 +33 | France Numbers | Premium Quality 🔥 | Instant Delivery ⚡',
  },
];

export const WhatsAppOrderPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const preselectedService = searchParams.get('service');
  const navigate = useNavigate();
  const { user, refreshUserProfile } = useAuth();

  const [availableServices, setAvailableServices] = useState<CustomerService[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<CountryPreset>(COUNTRY_PRESETS[0]);
  const [targetLink, setTargetLink] = useState('');
  const [dripFeed, setDripFeed] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [showDripTooltip, setShowDripTooltip] = useState(false);
  const [showSpeedTooltip, setShowSpeedTooltip] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<any | null>(null);

  // Fetch live backend services to bind real UUIDs
  useEffect(() => {
    const loadServices = async () => {
      try {
        const list = await servicesService.getPublicServices();
        setAvailableServices(list);

        // Check if preselected matches any preset by provider_service_id or id
        if (preselectedService) {
          const matchedByDbId = list.find((s) => s.id === preselectedService);
          if (matchedByDbId) {
            const foundPreset = COUNTRY_PRESETS.find(
              (p) =>
                p.providerId === matchedByDbId.provider_service_id ||
                matchedByDbId.name.toLowerCase().includes(p.name.toLowerCase())
            );
            if (foundPreset) {
              setSelectedPreset(foundPreset);
            }
          } else {
            const foundPreset = COUNTRY_PRESETS.find(
              (p) => p.providerId === preselectedService || p.id === preselectedService
            );
            if (foundPreset) {
              setSelectedPreset(foundPreset);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load services', err);
      } finally {
        setLoading(false);
      }
    };
    loadServices();
  }, [preselectedService]);

  // Helper to dynamically find the live platform selling service & rate
  const getPresetService = (preset: CountryPreset) => {
    return availableServices.find((s) => {
      if (s.provider_service_id && String(s.provider_service_id) === String(preset.providerId)) return true;
      if (s.name.includes(preset.providerId)) return true;
      if (s.id === preset.id) return true;
      if (
        s.name.toLowerCase().includes('whatsapp number') &&
        s.name.toLowerCase().includes(preset.name.toLowerCase())
      ) {
        return true;
      }
      return false;
    });
  };

  const getPresetPrice = (preset: CountryPreset): number => {
    const s = getPresetService(preset);
    return s ? Number(s.rate) : preset.price;
  };

  // Find corresponding active DB service for selected preset
  const currentDbService = getPresetService(selectedPreset);

  const priceKsh = getPresetPrice(selectedPreset);

  const userBalance = Number(user?.balance || 0);
  const hasInsufficientBalance = userBalance < priceKsh;

  const handleCopyServiceId = () => {
    navigator.clipboard.writeText(selectedPreset.providerId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!targetLink.trim()) {
      setError('Please enter your WhatsApp phone number as the order link.');
      return;
    }

    if (!currentDbService) {
      setError('Selected WhatsApp number service is currently being provisioned. Please try again in a moment.');
      return;
    }

    if (hasInsufficientBalance) {
      setError(
        `Insufficient wallet balance. Required: ${priceKsh} Ksh | Available: ${userBalance.toFixed(
          1
        )} Ksh. Please add funds to proceed.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const order = await ordersService.createOrder({
        service_id: currentDbService.id,
        target_link: targetLink.trim(),
        quantity: 1,
        custom_comments: dripFeed ? 'Drip-feed requested' : undefined,
      });

      await refreshUserProfile();
      setSuccessOrder(order);
      setTimeout(() => {
        navigate('/orders');
      }, 2500);
    } catch (err: any) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        err.message ||
        'Failed to place order. Please try again.';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-100 flex flex-col justify-between -m-3 sm:-m-6 md:-m-8 p-4 sm:p-6 md:p-10 font-sans selection:bg-purple-600 selection:text-white">
      {/* Container limited to standard clean width */}
      <div className="max-w-3xl mx-auto w-full space-y-6">
        {/* Top Bar */}
        <div className="flex items-center justify-between gap-4">
          {/* Back Pill Button */}
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-purple-800/50 bg-[#1e1738]/60 hover:bg-[#2e2154] text-purple-300 text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer shadow-sm hover:border-purple-600"
          >
            <ArrowLeft className="w-4 h-4 text-purple-400" />
            <span>Back</span>
          </button>

          {/* Balance & Add Funds Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#161b26] border border-slate-800 text-xs sm:text-sm font-semibold shadow-inner">
            <span className="text-white font-mono">
              {userBalance.toFixed(1)} Ksh
            </span>
            <Link
              to="/deposit"
              className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-bold transition-colors ml-1"
            >
              <div className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
                <Plus className="w-3 h-3" />
              </div>
              <span>Add funds</span>
            </Link>
          </div>
        </div>

        {/* Optional Country Preset Switcher Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {COUNTRY_PRESETS.map((preset) => {
            const isCurrent = selectedPreset.providerId === preset.providerId;
            return (
              <button
                key={preset.providerId}
                type="button"
                onClick={() => {
                  setSelectedPreset(preset);
                  setError(null);
                }}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
                  isCurrent
                    ? 'bg-purple-600/30 text-purple-200 border border-purple-500/60 shadow-sm'
                    : 'bg-[#161b26]/80 text-slate-400 hover:text-slate-200 border border-slate-800/80 hover:bg-[#1f2636]'
                }`}
              >
                <span>{preset.flag}</span>
                <span>{preset.name}</span>
                <span className="text-[10px] opacity-75">({getPresetPrice(preset)} Ksh)</span>
              </button>
            );
          })}
        </div>

        {/* Service Title with WhatsApp Icon */}
        <div className="flex items-start sm:items-center gap-3 pt-1">
          <div className="w-10 h-10 rounded-xl bg-[#111827] border border-slate-800 flex items-center justify-center shrink-0 shadow-md">
            {/* WhatsApp Logo */}
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6 fill-[#25D366]"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
          </div>

          <h1 className="text-base sm:text-lg md:text-xl font-bold text-white tracking-normal leading-snug">
            {selectedPreset.title}
          </h1>
        </div>

        {/* Success Alert Banner */}
        {successOrder && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-3 animate-fadeIn">
            <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-400" />
            <div className="text-xs sm:text-sm">
              <span className="font-bold text-white block">
                Order #{successOrder.id.substring(0, 8)} Placed Successfully!
              </span>
              Dispatched to the delivery network. Redirecting to your orders...
            </div>
          </div>
        )}

        {/* Error Alert Banner */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs sm:text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>{error}</span>
              {hasInsufficientBalance && (
                <div className="mt-2.5">
                  <Link
                    to="/deposit"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Deposit Funds via M-Pesa</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Order Form Card (Two Columns) */}
        <form onSubmit={handleCreateOrder}>
          <div className="rounded-2xl sm:rounded-3xl bg-[#131722] border border-slate-800/80 p-5 sm:p-7 shadow-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
              {/* Left Column: Form Controls */}
              <div className="space-y-4">
                {/* Link Field */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                    Link
                  </label>
                  <input
                    type="text"
                    value={targetLink}
                    onChange={(e) => setTargetLink(e.target.value)}
                    placeholder="Your current WhatsApp number"
                    className="w-full px-4 py-3 rounded-xl bg-[#1d2330] border border-slate-700/60 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:border-purple-500 transition-colors"
                    required
                  />
                </div>

                {/* Drip Feed Switch Row */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={dripFeed}
                    onClick={() => setDripFeed(!dripFeed)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out border border-transparent ${
                      dripFeed ? 'bg-purple-600' : 'bg-[#2b3345]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out mt-0.5 ${
                        dripFeed ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                  <span className="text-xs sm:text-sm font-medium text-slate-300">
                    Drip feed
                  </span>
                  <div className="relative">
                    <button
                      type="button"
                      onMouseEnter={() => setShowDripTooltip(true)}
                      onMouseLeave={() => setShowDripTooltip(false)}
                      onClick={() => setShowDripTooltip(!showDripTooltip)}
                      className="text-slate-500 hover:text-slate-300 transition-colors"
                      title="Drip feed information"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                    {showDripTooltip && (
                      <div className="absolute left-6 -top-2 z-20 w-48 p-2 text-[11px] bg-slate-900 border border-slate-700 rounded-lg text-slate-300 shadow-xl">
                        Gradually stagger delivery across time intervals.
                      </div>
                    )}
                  </div>
                </div>

                {/* Amount Row */}
                <div className="flex items-center justify-between py-2 border-b border-slate-800/60 text-xs sm:text-sm">
                  <span className="font-medium text-slate-300">Amount</span>
                  <span className="font-bold text-white font-mono">1</span>
                </div>

                {/* Price Row */}
                <div className="flex items-center justify-between py-2 text-xs sm:text-sm">
                  <span className="font-medium text-slate-300">Price</span>
                  <span className="font-extrabold text-white text-base sm:text-lg">
                    {priceKsh} Ksh
                  </span>
                </div>

                {/* Create Order Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3.5 px-6 rounded-full font-bold text-white bg-[#7c3aed] hover:bg-[#6d28d9] active:scale-[0.99] transition-all duration-200 shadow-lg shadow-purple-900/30 text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing Order...</span>
                      </>
                    ) : (
                      <span>Create order</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Right Column: Service Metadata & Speedometer Gauge */}
              <div className="flex flex-col justify-between space-y-5 border-t md:border-t-0 md:border-l border-slate-800/60 pt-5 md:pt-0 md:pl-8">
                {/* Service ID Row */}
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-medium text-slate-300">
                    Service ID
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyServiceId}
                    className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-white hover:text-purple-300 transition-colors group cursor-pointer"
                    title="Click to copy Service ID"
                  >
                    <span className="font-mono">{selectedPreset.providerId}</span>
                    {copiedId ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-300" />
                    )}
                  </button>
                </div>

                {/* Favorite Toggle Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-300">
                    <Star
                      className={`w-3.5 h-3.5 ${
                        isFavorite ? 'text-amber-400 fill-amber-400' : 'text-slate-400'
                      }`}
                    />
                    <span>Favorite</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isFavorite}
                    onClick={() => setIsFavorite(!isFavorite)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out border border-transparent ${
                      isFavorite ? 'bg-purple-600' : 'bg-[#2b3345]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out mt-0.5 ${
                        isFavorite ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Speedometer Gauge Visual */}
                <div className="flex flex-col items-center justify-center pt-2 pb-1">
                  <div className="relative w-44 sm:w-48 h-24 flex items-end justify-center">
                    {/* SVG Semicircle Arc Gauge */}
                    <svg
                      viewBox="0 0 160 90"
                      className="w-full h-full overflow-visible"
                    >
                      <defs>
                        {/* Orange active segment gradient */}
                        <linearGradient id="speedOrange" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#ff5722" />
                          <stop offset="100%" stopColor="#f97316" />
                        </linearGradient>
                      </defs>

                      {/* Segment 1 (Left 0 to 60 deg) - Active Orange */}
                      <path
                        d="M 18 80 A 62 62 0 0 1 49 26"
                        fill="none"
                        stroke="url(#speedOrange)"
                        strokeWidth="16"
                        strokeLinecap="round"
                      />

                      {/* Segment 2 (Middle 60 to 120 deg) - Inactive Dark Slate */}
                      <path
                        d="M 57 20 A 62 62 0 0 1 103 20"
                        fill="none"
                        stroke="#1f2937"
                        strokeWidth="16"
                      />

                      {/* Segment 3 (Right 120 to 180 deg) - Inactive Dark Slate */}
                      <path
                        d="M 111 26 A 62 62 0 0 1 142 80"
                        fill="none"
                        stroke="#1f2937"
                        strokeWidth="16"
                        strokeLinecap="round"
                      />
                    </svg>

                    {/* Centered Gauge Text */}
                    <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center pb-1">
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <span>Speed</span>
                        <HelpCircle
                          className="w-3 h-3 text-slate-500 cursor-pointer hover:text-slate-300"
                          onClick={() => setShowSpeedTooltip(!showSpeedTooltip)}
                        />
                      </div>
                      <span className="text-base sm:text-lg font-bold text-white tracking-wide">
                        Slow
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Specs & Notes Section (Screenshot 2) */}
        <div className="space-y-4 pt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
          {/* Warning Header */}
          <div className="flex items-center gap-2 font-bold text-amber-400 text-sm sm:text-base">
            <span className="text-base">⚠️</span>
            <span className="text-white font-bold">Please Read Before Ordering</span>
          </div>

          {/* Key Attributes List */}
          <div className="space-y-1.5 pl-0.5 text-slate-300">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Link:</span>
              <span>Your current WhatsApp number</span>
              <span>📱</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Location:</span>
              <span>{selectedPreset.locationName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Quality:</span>
              <span>{selectedPreset.quality}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Start:</span>
              <span>0–5 Minutes</span>
              <span>⏱️</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Speed:</span>
              <span>Instant Start</span>
              <span>🚀</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Drop Rate:</span>
              <span>Extremely Low</span>
              <span>💧</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Refill Time:</span>
              <span>No Refill</span>
              <span>⚠️</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Cancel Button:</span>
              <span>Active</span>
              <span>🚫</span>
            </div>
          </div>

          {/* Notes Section */}
          <div className="pt-3 space-y-1.5 pl-0.5">
            <div className="font-bold text-white text-sm">Notes:</div>
            <p>Use your WhatsApp number as the order link.</p>
            <p>All numbers are valid and safe for long-term use.</p>
            <div className="flex items-center gap-1 text-slate-300">
              <span className="text-rose-400 font-bold">❌</span>
              <span>No replacement if the number is banned.</span>
            </div>
            <p>Avoid placing multiple orders at once.</p>
          </div>
        </div>
      </div>

      {/* Floating Call Us Now Button (Screenshot 2) */}
      <a
        href="https://wa.me/254700000000?text=Hello%20SocialPulse%20Support,%20I%20need%20assistance%20with%20WhatsApp%20Numbers."
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#22c55e] hover:bg-[#16a34a] text-white font-bold text-xs sm:text-sm shadow-xl shadow-emerald-600/30 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
      >
        <Phone className="w-4 h-4 fill-white text-white" />
        <span>Call Us Now</span>
      </a>

      {/* Bottom Footer Links (Screenshot 2) */}
      <footer className="pt-12 pb-4 text-center">
        <div className="flex items-center justify-center gap-6 text-xs text-slate-500">
          <Link to="/api-docs" className="hover:text-slate-300 transition-colors">
            legal
          </Link>
          <Link to="/api-docs" className="hover:text-slate-300 transition-colors">
            Terms of service
          </Link>
          <Link to="/api-docs" className="hover:text-slate-300 transition-colors">
            Privacy policy
          </Link>
        </div>
      </footer>
    </div>
  );
};
