import React, { useEffect, useState, useRef, useMemo } from 'react';
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
  Plus,
  CreditCard,
  Search,
  Star,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Music2,
  Instagram,
  Facebook,
  Youtube,
  Twitter,
  Send,
  Headphones,
  Globe,
  MessageSquare,
  Clock,
  Truck,
  Flame,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { servicesService } from '../../services/services';
import { ordersService } from '../../services/orders';
import { CustomerService, PlatformType } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { WhatsAppOrderPage } from './WhatsAppOrderPage';

interface PlatformOption {
  id: PlatformType | 'all' | 'whatsapp';
  name: string;
  icon: React.ReactNode;
}

const PLATFORM_OPTIONS: PlatformOption[] = [
  { id: 'tiktok', name: 'TikTok', icon: <Music2 className="w-4 h-4 text-cyan-400" /> },
  { id: 'facebook', name: 'Facebook', icon: <Facebook className="w-4 h-4 text-blue-400" /> },
  { id: 'instagram', name: 'Instagram', icon: <Instagram className="w-4 h-4 text-pink-400" /> },
  { id: 'whatsapp', name: 'WhatsApp', icon: <MessageSquare className="w-4 h-4 text-emerald-400" /> },
  { id: 'telegram', name: 'Telegram', icon: <Send className="w-4 h-4 text-sky-400" /> },
  { id: 'all', name: 'All Platforms', icon: <Globe className="w-4 h-4 text-indigo-400" /> },
];

type QuickFilter = 'all' | 'ordered' | 'favourites';
type SortOption = 'lowest' | 'recommended' | 'reliable' | 'highest';

export const NewOrderPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const preselectedServiceId = searchParams.get('service');

  const { user, refreshUserProfile } = useAuth();
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();

  // Selection states
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType | 'all' | 'whatsapp'>('tiktok');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');

  // Dropdown open states
  const [isPlatformOpen, setIsPlatformOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);

  // Category search state (for dropdown filter)
  const [categorySearchQuery, setCategorySearchQuery] = useState('');

  // Service search & filter states
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<QuickFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('lowest');

  // Loaded data
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [services, setServices] = useState<CustomerService[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);

  // Customer order history (for "Ordered before" filter)
  const [orderedServiceIds, setOrderedServiceIds] = useState<Set<string>>(new Set());

  // Customer favourites (stored in localStorage)
  const [favouriteServiceIds, setFavouriteServiceIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('smm_favourite_services');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Order input fields
  const [targetLink, setTargetLink] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [customComments, setCustomComments] = useState('');

  // Form states
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<any | null>(null);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOrderModalOpen && !submitting) {
        setIsOrderModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOrderModalOpen, submitting]);

  // Auto-open modal if service ID is present in URL
  useEffect(() => {
    if (preselectedServiceId && services.some((s) => s.id === preselectedServiceId)) {
      setIsOrderModalOpen(true);
    }
  }, [preselectedServiceId, services]);

  // Refs for click outside handling
  const platformRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const orderDetailsRef = useRef<HTMLFormElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (platformRef.current && !platformRef.current.contains(e.target as Node)) {
        setIsPlatformOpen(false);
      }
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) {
        setIsCategoryOpen(false);
      }
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setIsSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch customer orders once to populate "Ordered before" filter
  useEffect(() => {
    ordersService.getMyOrders({ limit: 200 })
      .then((orders) => {
        const ids = new Set(orders.map((o) => o.service_id));
        setOrderedServiceIds(ids);
      })
      .catch(() => {});
  }, []);

  // Toggle favorite
  const toggleFavourite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavouriteServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem('smm_favourite_services', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  // Load categories whenever selectedPlatform changes
  useEffect(() => {
    let isMounted = true;
    const fetchCategories = async () => {
      setLoadingCategories(true);
      try {
        const platformArg = selectedPlatform === 'whatsapp' ? 'other' : selectedPlatform;
        const catList = await servicesService.getCategories(platformArg);
          // Filter out any delix categories just in case
          const cleanCats = catList.filter((c) => !c.toLowerCase().includes('delix'));
          setCategories(cleanCats);
          if (cleanCats.length > 0) {
            // Pick first category or keep current if valid and belongs to current platform
            if (!cleanCats.includes(selectedCategory) || selectedCategory.toLowerCase().includes('delix')) {
              setSelectedCategory(cleanCats[0]);
            }
          } else {
            setSelectedCategory('');
          }
      } catch (err) {
        console.error('Failed to load categories', err);
      } finally {
        if (isMounted) setLoadingCategories(false);
      }
    };

    fetchCategories();
    return () => {
      isMounted = false;
    };
  }, [selectedPlatform]);

  // Load services whenever platform or category changes
  useEffect(() => {
    let isMounted = true;
    const fetchServices = async () => {
      setLoadingServices(true);
      try {
        const platformArg = selectedPlatform === 'whatsapp' ? 'other' : selectedPlatform;
        const data = await servicesService.getPublicServices({
          platform: platformArg !== 'all' ? (platformArg as PlatformType) : undefined,
          category: selectedCategory || undefined,
        });

        if (isMounted) {
          setServices(data);

          // Pre-select service if passed in query param, otherwise select first service
          if (preselectedServiceId && data.some((s) => s.id === preselectedServiceId)) {
            const match = data.find((s) => s.id === preselectedServiceId);
            if (match) {
              setSelectedServiceId(match.id);
              setQuantity(Math.max(match.min_quantity || 100, 100));
            }
          } else if (data.length > 0) {
            // Keep selected service if still in list, else choose first
            if (!data.some((s) => s.id === selectedServiceId)) {
              setSelectedServiceId(data[0].id);
              setQuantity(Math.max(data[0].min_quantity || 100, 100));
            }
          } else {
            setSelectedServiceId('');
          }
        }
      } catch (err) {
        console.error('Failed to load services', err);
      } finally {
        if (isMounted) setLoadingServices(false);
      }
    };

    fetchServices();
    return () => {
      isMounted = false;
    };
  }, [selectedPlatform, selectedCategory, preselectedServiceId]);

  // Active selected service object
  const currentService = services.find((s) => s.id === selectedServiceId);

  // If user selected WhatsApp platform and current service is WhatsApp numbers, render WhatsAppOrderPage
  const isWhatsApp =
    selectedPlatform === 'whatsapp' ||
    (currentService &&
      (currentService.provider_service_id === '6048' ||
        currentService.name.toLowerCase().includes('whatsapp number') ||
        currentService.category.toLowerCase().includes('whatsapp numbers')));

  if (isWhatsApp && selectedPlatform === 'whatsapp') {
    return <WhatsAppOrderPage />;
  }

  // Filtered and sorted services
  const filteredAndSortedServices = useMemo(() => {
    // 1. Strictly filter out any provider internal / delix branding
    let list = services.filter((s) => {
      const name = (s.name || '').toLowerCase();
      const cat = (s.category || '').toLowerCase();
      return !name.includes('delix') && !cat.includes('delix');
    });

    // 2. Search query filter
    if (serviceSearchQuery.trim()) {
      const q = serviceSearchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          (s.provider_service_id && s.provider_service_id.toLowerCase().includes(q)) ||
          s.category.toLowerCase().includes(q)
      );
    }

    // 3. Quick filter: Ordered before vs Favourites
    if (activeFilter === 'ordered') {
      list = list.filter((s) => orderedServiceIds.has(s.id));
    } else if (activeFilter === 'favourites') {
      list = list.filter((s) => favouriteServiceIds.has(s.id));
    }

    // 4. Sorting
    if (sortOption === 'lowest') {
      // Lowest price per 1,000 first
      list.sort((a, b) => Number(a.rate) - Number(b.rate));
    } else if (sortOption === 'highest') {
      // Highest price per 1,000 first
      list.sort((a, b) => Number(b.rate) - Number(a.rate));
    } else if (sortOption === 'reliable') {
      // Most reliable: Refill guaranteed must come first, then non-drop, then lowest price
      list.sort((a, b) => {
        if (a.refill_available !== b.refill_available) {
          return a.refill_available ? -1 : 1;
        }
        const aDrop = a.name.toLowerCase().includes('non drop') || a.name.toLowerCase().includes('no drop') || a.name.toLowerCase().includes('guarantee');
        const bDrop = b.name.toLowerCase().includes('non drop') || b.name.toLowerCase().includes('no drop') || b.name.toLowerCase().includes('guarantee');
        if (aDrop !== bDrop) return aDrop ? -1 : 1;
        return Number(a.rate) - Number(b.rate);
      });
    } else if (sortOption === 'recommended') {
      // Recommended: top-rated packages with refill guarantee + high quality / cheapest tags
      const getScore = (item: CustomerService) => {
        let score = 0;
        const name = item.name.toLowerCase();
        if (item.refill_available) score += 60;
        if (name.includes('recommended') || name.includes('best') || name.includes('exclusive')) score += 50;
        if (name.includes('cheapest')) score += 35;
        if (name.includes('real') || name.includes('hq') || name.includes('high quality')) score += 30;
        if (name.includes('non drop') || name.includes('no drop')) score += 25;
        if (name.includes('instant') || name.includes('fast')) score += 15;
        score -= (Number(item.rate) * 0.05);
        return score;
      };
      list.sort((a, b) => getScore(b) - getScore(a));
    }

    return list;
  }, [services, serviceSearchQuery, activeFilter, sortOption, orderedServiceIds, favouriteServiceIds]);

  // When sort option, platform, or category changes, automatically select the top service of the sorted list
  useEffect(() => {
    if (filteredAndSortedServices.length > 0) {
      setSelectedServiceId(filteredAndSortedServices[0].id);
      setQuantity(Math.max(filteredAndSortedServices[0].min_quantity || 100, 100));
    }
  }, [sortOption, selectedCategory, selectedPlatform]);

  // Check if service is package
  const isPackage = currentService
    ? currentService.service_type?.toLowerCase() === 'package' ||
      (currentService.min_quantity === 1 && currentService.max_quantity === 1) ||
      currentService.name.toLowerCase().includes('whatsapp number')
    : false;

  // Calculate live charge
  const numQuantity = typeof quantity === 'number' ? quantity : 0;
  const calculatedCharge = currentService
    ? isPackage
      ? Number((currentService.rate * numQuantity).toFixed(2))
      : Number(((currentService.rate * numQuantity) / 1000).toFixed(2))
    : 0;

  const userBalance = Number(user?.balance || 0);
  const hasInsufficientBalance = calculatedCharge > userBalance;

  // Handle service card click - directly opens the Order Details modal without scrolling downwards
  const handleSelectService = (service: CustomerService) => {
    setSelectedServiceId(service.id);
    setQuantity(Math.max(service.min_quantity || 100, 100));
    setError(null);
    setIsOrderModalOpen(true);
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
    const effectiveMin = isPackage ? (currentService.min_quantity || 1) : Math.max(currentService.min_quantity || 100, 100);
    if (!numQuantity || numQuantity < effectiveMin) {
      setError(`Minimum order quantity is ${effectiveMin.toLocaleString()}${!isPackage ? ' (orders below 100 are not permitted)' : ''}.`);
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

  const selectedPlatformObj = PLATFORM_OPTIONS.find((p) => p.id === selectedPlatform) || PLATFORM_OPTIONS[0];

  const filteredCategories = categories.filter((c) =>
    c.toLowerCase().includes(categorySearchQuery.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn pb-16">
      {/* Top Header & Balance Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Choose a service</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Select your platform, pick your category, and configure instant delivery
          </p>
        </div>

        {/* Live Balance Pill & Deposit Funds Button */}
        <div className="flex items-center gap-3">
          <Link
            to="/deposit"
            className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            title="Deposit funds via M-Pesa"
          >
            <CreditCard className="w-3.5 h-3.5 text-amber-400" />
            <span>Deposit Funds</span>
          </Link>

          <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-[#0b111e] border border-slate-800 shadow-inner">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Wallet className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block leading-tight">
                Balance
              </span>
              <span className="text-sm font-extrabold text-emerald-400 leading-tight">
                KES {userBalance.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Success Notification */}
      {successOrder && (
        <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-4 animate-fadeIn">
          <CheckCircle2 className="w-7 h-7 flex-shrink-0 text-emerald-400" />
          <div>
            <h4 className="text-base font-bold text-white">Order #{successOrder.id.substring(0, 8)} Dispatched!</h4>
            <p className="text-xs text-emerald-300/90 mt-0.5">
              Your order has been queued for instant delivery. Redirecting to your order history...
            </p>
          </div>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span>{error}</span>
            {hasInsufficientBalance && (
              <div className="mt-2.5 flex items-center gap-3">
                <Link to="/deposit">
                  <Button type="button" variant="primary" size="sm" leftIcon={<CreditCard className="w-3.5 h-3.5" />}>
                    Deposit Funds via M-Pesa
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CATEGORIZATION SELECTOR SECTION (Matching smm.africa UI) */}
      <div className="bg-[#0b111e]/90 border border-slate-800/90 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xl backdrop-blur-md">
        {/* Row 1: Platform & Category Dropdowns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Platform Dropdown */}
          <div className="space-y-1.5" ref={platformRef}>
            <label className="block text-xs font-semibold text-slate-400">Platform</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsPlatformOpen(!isPlatformOpen);
                  setIsCategoryOpen(false);
                  setIsSortOpen(false);
                }}
                className={`w-full px-4 py-3 bg-[#0d1424] border rounded-xl text-white text-sm flex items-center justify-between transition-all ${
                  isPlatformOpen
                    ? 'border-emerald-500 ring-1 ring-emerald-500/50 shadow-md shadow-emerald-950/40'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {selectedPlatformObj.icon}
                  <span className="font-semibold">{selectedPlatformObj.name}</span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                    isPlatformOpen ? 'transform rotate-180 text-emerald-400' : ''
                  }`}
                />
              </button>

              {/* Platform Menu Popover */}
              {isPlatformOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-[#0d1424] border border-slate-800 rounded-xl shadow-2xl py-1.5 max-h-72 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
                  {PLATFORM_OPTIONS.map((p) => {
                    const isSelected = selectedPlatform === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPlatform(p.id);
                          setIsPlatformOpen(false);
                          setServiceSearchQuery('');
                        }}
                        className={`w-full px-4 py-2.5 text-left text-sm flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-emerald-500/10 text-emerald-300 font-bold'
                            : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {p.icon}
                          <span>{p.name}</span>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Category Dropdown */}
          <div className="space-y-1.5" ref={categoryRef}>
            <label className="block text-xs font-semibold text-slate-400">Category</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsCategoryOpen(!isCategoryOpen);
                  setIsPlatformOpen(false);
                  setIsSortOpen(false);
                }}
                disabled={loadingCategories || categories.length === 0}
                className={`w-full px-4 py-3 bg-[#0d1424] border rounded-xl text-white text-sm flex items-center justify-between transition-all ${
                  isCategoryOpen
                    ? 'border-emerald-500 ring-1 ring-emerald-500/50 shadow-md shadow-emerald-950/40'
                    : 'border-slate-800 hover:border-slate-700'
                } ${loadingCategories ? 'opacity-70 cursor-wait' : ''}`}
              >
                <div className="truncate pr-2 text-left">
                  {loadingCategories ? (
                    <span className="text-slate-400 flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading categories...
                    </span>
                  ) : selectedCategory === 'all' ? (
                    <span className="font-semibold text-white">All Categories ({categories.length})</span>
                  ) : selectedCategory ? (
                    <span className="font-semibold text-white">{selectedCategory}</span>
                  ) : (
                    <span className="text-slate-500">No categories found</span>
                  )}
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200 ${
                    isCategoryOpen ? 'transform rotate-180 text-emerald-400' : ''
                  }`}
                />
              </button>

              {/* Category Menu Popover */}
              {isCategoryOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-[#0d1424] border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
                  {/* Mini search inside category dropdown if more than 6 categories */}
                  {categories.length > 6 && (
                    <div className="p-2 border-b border-slate-800">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={categorySearchQuery}
                          onChange={(e) => setCategorySearchQuery(e.target.value)}
                          placeholder="Filter categories..."
                          className="w-full pl-8 pr-3 py-1.5 bg-[#090d18] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  )}

                  <div className="max-h-72 overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-slate-700">
                    {/* All Categories Option */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory('all');
                        setIsCategoryOpen(false);
                        setCategorySearchQuery('');
                        setServiceSearchQuery('');
                      }}
                      className={`w-full px-4 py-2.5 text-left text-xs sm:text-sm flex items-center justify-between transition-colors ${
                        selectedCategory === 'all'
                          ? 'bg-emerald-500/10 text-emerald-300 font-bold'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <span className="truncate pr-2">All Categories ({categories.length})</span>
                      {selectedCategory === 'all' && <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                    </button>

                    {filteredCategories.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-slate-500 text-center">
                        No matching categories
                      </div>
                    ) : (
                      filteredCategories.map((cat) => {
                        const isSelected = selectedCategory === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setSelectedCategory(cat);
                              setIsCategoryOpen(false);
                              setCategorySearchQuery('');
                              setServiceSearchQuery('');
                            }}
                            className={`w-full px-4 py-2.5 text-left text-xs sm:text-sm flex items-center justify-between transition-colors ${
                              isSelected
                                ? 'bg-emerald-500/10 text-emerald-300 font-bold'
                                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                            }`}
                          >
                            <span className="truncate pr-2">{cat}</span>
                            {isSelected && <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Search this category */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-400">Search this category</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={serviceSearchQuery}
              onChange={(e) => setServiceSearchQuery(e.target.value)}
              placeholder="Service name or ID..."
              className="w-full pl-10 pr-10 py-2.5 bg-[#0d1424] border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
            />
            {serviceSearchQuery && (
              <button
                type="button"
                onClick={() => setServiceSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Row 3: Quick Filter Pills & Sort Dropdown */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1 border-t border-slate-800/60">
          {/* Filter Pills */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeFilter === 'all'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-[#0d1424] text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('ordered')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeFilter === 'ordered'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-[#0d1424] text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
              }`}
            >
              Ordered before {orderedServiceIds.size > 0 && `(${orderedServiceIds.size})`}
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('favourites')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeFilter === 'favourites'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-[#0d1424] text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
              }`}
            >
              <Star className={`w-3 h-3 ${activeFilter === 'favourites' ? 'fill-slate-950' : 'text-slate-400'}`} />
              Favourites {favouriteServiceIds.size > 0 && `(${favouriteServiceIds.size})`}
            </button>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2" ref={sortRef}>
            <span className="text-xs font-semibold text-slate-400">Sort</span>
            <div className="relative min-w-[150px]">
              <button
                type="button"
                onClick={() => {
                  setIsSortOpen(!isSortOpen);
                  setIsPlatformOpen(false);
                  setIsCategoryOpen(false);
                }}
                className="w-full px-3 py-1.5 bg-[#0d1424] border border-slate-800 rounded-lg text-xs font-medium text-white flex items-center justify-between hover:border-slate-700 transition-colors"
              >
                <span>
                  {sortOption === 'lowest' && 'Lowest price'}
                  {sortOption === 'recommended' && 'Recommended'}
                  {sortOption === 'reliable' && 'Most reliable'}
                  {sortOption === 'highest' && 'Highest price'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-2" />
              </button>

              {isSortOpen && (
                <div className="absolute right-0 mt-1.5 z-50 w-44 bg-[#0d1424] border border-slate-800 rounded-xl shadow-2xl py-1">
                  {[
                    { id: 'recommended', label: 'Recommended' },
                    { id: 'lowest', label: 'Lowest price' },
                    { id: 'reliable', label: 'Most reliable' },
                    { id: 'highest', label: 'Highest price' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSortOption(s.id as SortOption);
                        setIsSortOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between ${
                        sortOption === s.id
                          ? 'bg-emerald-500/10 text-emerald-300 font-bold'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <span>{s.label}</span>
                      {sortOption === s.id && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Service Count Line */}
        <div className="pt-2 text-xs text-slate-400 font-medium">
          {loadingServices ? (
            <span className="flex items-center gap-2">
              <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
              Loading services...
            </span>
          ) : (
            <span>
              {filteredAndSortedServices.length}{' '}
              {filteredAndSortedServices.length === 1 ? 'service' : 'services'} in this category
            </span>
          )}
        </div>

        {/* Services Cards Grid */}
        {loadingServices ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
            <RefreshCw className="w-7 h-7 animate-spin text-emerald-400" />
            <span className="text-sm">Fetching available packages...</span>
          </div>
        ) : filteredAndSortedServices.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-[#0d1424]/60 border border-slate-800/80">
            <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-300">No services found</p>
            <p className="text-xs text-slate-500 mt-1">
              {activeFilter === 'favourites'
                ? 'You have not starred any services in this category yet. Click the star icon on any card to add it to your favourites!'
                : activeFilter === 'ordered'
                ? 'You have not ordered any services from this category previously.'
                : 'Try adjusting your search terms or choose another category.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredAndSortedServices.map((service, index) => {
              const isSelected = selectedServiceId === service.id;
              const isFav = favouriteServiceIds.has(service.id);

              return (
                <div
                  key={service.id}
                  onClick={() => handleSelectService(service)}
                  className={`relative p-4 rounded-xl transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-[#0e1728] border-2 border-emerald-500 ring-1 ring-emerald-500/50 shadow-lg shadow-emerald-950/40'
                      : 'bg-[#0d1424] border border-slate-800/80 hover:border-slate-700 hover:bg-[#111a2f]'
                  }`}
                >
                  {/* Card Top: Title & Star */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isSelected && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-extrabold bg-emerald-500 text-slate-950 tracking-wider">
                            Selected
                          </span>
                        )}
                        {index === 0 && sortOption === 'lowest' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Cheapest
                          </span>
                        )}
                        {index === 0 && sortOption === 'highest' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Top Tier
                          </span>
                        )}
                        {sortOption === 'reliable' && service.refill_available && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            Guaranteed
                          </span>
                        )}
                        {index === 0 && sortOption === 'recommended' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Top Pick
                          </span>
                        )}
                        <h4 className="text-sm font-bold text-white leading-snug line-clamp-2">
                          {service.name.replace(/delix gains/gi, 'Social Pulse').replace(/delix/gi, 'Social Pulse')}
                        </h4>
                      </div>

                      {/* Favourite Star Button */}
                      <button
                        type="button"
                        onClick={(e) => toggleFavourite(service.id, e)}
                        className="p-1 rounded-md text-slate-500 hover:text-amber-400 transition-colors flex-shrink-0"
                        title={isFav ? 'Remove from favourites' : 'Add to favourites'}
                      >
                        <Star
                          className={`w-4 h-4 ${
                            isFav ? 'text-amber-400 fill-amber-400' : 'hover:text-amber-300'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Price Line */}
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-base font-extrabold text-white">
                        {Number(service.rate).toFixed(4)} KES
                      </span>
                      <span className="text-xs text-slate-400">
                        {service.service_type?.toLowerCase() === 'package' ? 'per package' : 'per 1,000 likes'}
                      </span>
                    </div>

                    {/* Min, Max, Refill Details */}
                    <div className="mt-1 text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span>Min: <strong className="text-slate-200">{service.min_quantity.toLocaleString()}</strong></span>
                      <span>Max: <strong className="text-slate-200">{service.max_quantity.toLocaleString()}</strong></span>
                      <span>
                        {service.refill_available ? (
                          <span className="text-emerald-400 font-semibold flex items-center gap-1 inline-flex">
                            <ShieldCheck className="w-3 h-3 inline" /> 30 Days Refill Guarantee
                          </span>
                        ) : (
                          <span>Refill terms not listed</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Card Bottom Meta Grid (Estimated start, Delivery rate, Service ID & Order Action) */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="block text-[10px] text-slate-500 leading-tight">Start</span>
                        <span className="text-slate-300 font-medium">1 min</span>
                      </div>
                      <div className="hidden sm:block">
                        <span className="block text-[10px] text-slate-500 leading-tight">Delivery</span>
                        <span className="text-slate-300 font-medium">Fast</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 leading-tight">ID</span>
                        <span className="text-slate-300 font-mono font-bold">
                          #{service.provider_service_id || service.id.substring(0, 6)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectService(service);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 hover:scale-105"
                    >
                      <span>Order</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FLOATING BOTTOM DOCK: Shows currently selected service & direct button to re-open details */}
      {!isOrderModalOpen && currentService && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-2xl bg-[#0b111e]/95 border border-emerald-500/50 rounded-2xl shadow-2xl shadow-emerald-950/70 p-3 sm:p-3.5 backdrop-blur-xl flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 border border-emerald-500/30">
              {selectedPlatformObj.icon}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 block truncate">
                Ready to Order • #{currentService.provider_service_id || currentService.id.slice(0, 6)}
              </span>
              <h5 className="text-xs sm:text-sm font-bold text-white truncate">
                {currentService.name.replace(/delix gains/gi, 'Social Pulse').replace(/delix/gi, 'Social Pulse')}
              </h5>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOrderModalOpen(true)}
            className="px-4 sm:px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs sm:text-sm font-extrabold flex items-center gap-1.5 transition-all flex-shrink-0 shadow-lg shadow-emerald-500/30 hover:scale-105"
          >
            <span>Order Details</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* DIRECT ORDER DETAILS MODAL */}
      {isOrderModalOpen && currentService && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          {/* Dark Glass Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
            onClick={() => !submitting && setIsOrderModalOpen(false)}
          />

          {/* Modal Container */}
          <div
            className="relative w-full max-w-xl bg-[#0b111e] border border-slate-800 rounded-2xl shadow-2xl shadow-emerald-950/40 overflow-hidden my-auto z-10 animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-800/90 flex items-center justify-between bg-[#0e1626]/90">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                  {selectedPlatformObj.icon}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Order Details</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-800 text-slate-300">
                      #{currentService.provider_service_id || currentService.id.slice(0, 6)}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">Configure parameters & instant delivery</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !submitting && setIsOrderModalOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Service Summary Card */}
            <div className="px-5 pt-4 pb-1">
              <div className="p-3 rounded-xl bg-[#0e172a] border border-slate-800 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-xs sm:text-sm font-bold text-white leading-snug">
                    {currentService.name.replace(/delix gains/gi, 'Social Pulse').replace(/delix/gi, 'Social Pulse')}
                  </h4>
                  {currentService.refill_available && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 flex-shrink-0">
                      <ShieldCheck className="w-3 h-3" /> 30d Refill
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 pt-0.5">
                  <div>
                    Rate: <span className="text-emerald-400 font-extrabold">KES {Number(currentService.rate).toFixed(4)}</span> / 1k
                  </div>
                  <div>•</div>
                  <div>
                    Min: <span className="text-slate-200 font-semibold">{Math.max(currentService.min_quantity || 100, 100).toLocaleString()}</span>
                  </div>
                  <div>•</div>
                  <div>
                    Max: <span className="text-slate-200 font-semibold">{currentService.max_quantity.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Order Form */}
            <form onSubmit={handleSubmit} className="px-5 py-3 space-y-3.5">
              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Target Link */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                  Target Link / URL <span className="text-emerald-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <LinkIcon className="w-4 h-4 text-emerald-400" />
                  </div>
                  <input
                    type="text"
                    autoFocus
                    value={targetLink}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const urlMatch = raw.match(/https?:\/\/[^\s<>"]+|www\.[^\s<>"]+/);
                      if (urlMatch) {
                        let clean = urlMatch[0];
                        if (
                          clean.includes('tiktok.com') ||
                          clean.includes('instagram.com') ||
                          clean.includes('facebook.com')
                        ) {
                          clean = clean.split('?')[0];
                        }
                        setTargetLink(clean);
                      } else {
                        setTargetLink(raw);
                      }
                    }}
                    placeholder={`Paste ${selectedPlatformObj.name} profile or post URL...`}
                    className="w-full pl-9 pr-3 py-2.5 bg-[#0e172a] border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500 font-mono transition-colors"
                    required
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Ensure account or post privacy is public for automated fulfillment.
                </p>
              </div>

              {/* Quantity */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Quantity <span className="text-emerald-400">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Min: {Math.max(currentService.min_quantity || 100, 100).toLocaleString()} • Max: {currentService.max_quantity.toLocaleString()}
                  </span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Hash className="w-4 h-4 text-emerald-400" />
                  </div>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="1000"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#0e172a] border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                    min={Math.max(currentService.min_quantity || 100, 100)}
                    max={currentService.max_quantity}
                    required
                  />
                </div>

                {/* Quick-Pick Quantity Buttons */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    Math.max(currentService.min_quantity || 100, 100),
                    500,
                    1000,
                    2500,
                    5000,
                    10000,
                  ]
                    .filter(
                      (val) =>
                        val >= (currentService.min_quantity || 100) &&
                        val <= currentService.max_quantity
                    )
                    .filter((val, idx, arr) => arr.indexOf(val) === idx)
                    .map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setQuantity(val)}
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold border transition-all ${
                          quantity === val
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                            : 'bg-slate-800/60 text-slate-300 border-slate-700/60 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        +{val.toLocaleString()}
                      </button>
                    ))}
                </div>
              </div>

              {/* Custom Comments */}
              {currentService?.service_type.toLowerCase().includes('comment') && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Custom Comments (1 per line)
                  </label>
                  <textarea
                    value={customComments}
                    onChange={(e) => setCustomComments(e.target.value)}
                    placeholder="Great post!🔥&#10;Love this picture! ❤️&#10;Keep it up! 👏"
                    rows={3}
                    className="w-full px-3 py-2 bg-[#0e172a] border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              )}

              {/* Financial Breakdown & Balance Status */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Total Order Charge:</span>
                  <span className="text-lg font-black text-emerald-400">
                    KES {calculatedCharge.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/80">
                  <span className="text-slate-400">Available Balance:</span>
                  <span className={`font-bold ${hasInsufficientBalance ? 'text-rose-400' : 'text-slate-200'}`}>
                    KES {userBalance.toFixed(2)}
                  </span>
                </div>
                {hasInsufficientBalance && (
                  <div className="pt-2 flex items-center justify-between text-xs text-rose-400 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                    <span>Insufficient funds for this order</span>
                    <Link
                      to="/deposit"
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-[10px] transition-colors"
                    >
                      Top Up Now
                    </Link>
                  </div>
                )}
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="pt-1 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsOrderModalOpen(false)}
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="flex-[2] py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold shadow-lg shadow-emerald-500/25 border-none text-xs"
                  isLoading={submitting}
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  Confirm & Place Order
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
