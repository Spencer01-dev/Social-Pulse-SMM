import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Package,
  LifeBuoy,
  Users,
  DollarSign,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  RefreshCcw,
  Sparkles,
  Globe,
  Send,
  ArrowLeft,
  ExternalLink,
  Copy,
  Check,
  Sliders,
  ShieldCheck,
  PlusCircle,
  MinusCircle,
  MessageSquare,
  ChevronDown,
  UserCheck,
  UserX,
  CreditCard,
  Hash,
  Smartphone,
  Key,
  Zap,
  Info,
  Save,
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useTenant } from '../../context/TenantContext';
import { formatExternalUrl } from '../../utils/url';
import {
  childPanelService,
  ChildPanelData,
  ChildPanelOrder,
  ChildPanelOrderStats,
  ChildPanelPaymentGatewayConfig,
  ChildPanelTicket,
  ChildPanelTicketDetail,
  ChildPanelUser,
} from '../../services/childPanels';
import { ChildPanelBrandingModal } from './ChildPanelBrandingModal';

type ActiveTab = 'orders' | 'tickets' | 'users' | 'payments';

export const ChildPanelManagePage: React.FC = () => {
  const { panelId } = useParams<{ panelId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { formatCurrency } = useCurrency();
  const { enterTenantMode } = useTenant();

  // Active tab state
  const initialTab = (searchParams.get('tab') as ActiveTab) || 'orders';
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);

  // Panels list & active selected panel
  const [panels, setPanels] = useState<ChildPanelData[]>([]);
  const [activePanel, setActivePanel] = useState<ChildPanelData | null>(null);
  const [loadingPanels, setLoadingPanels] = useState(true);

  // Branding Modal
  const [isBrandingOpen, setIsBrandingOpen] = useState(false);

  // Copy helper
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ---------------------------------------------------------------------------
  // TAB 1: ORDERS STATE
  // ---------------------------------------------------------------------------
  const [orders, setOrders] = useState<ChildPanelOrder[]>([]);
  const [orderStats, setOrderStats] = useState<ChildPanelOrderStats | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [orderSearch, setOrderSearch] = useState<string>('');
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // TAB 2: TICKETS STATE
  // ---------------------------------------------------------------------------
  const [tickets, setTickets] = useState<ChildPanelTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>('all');
  const [selectedTicket, setSelectedTicket] = useState<ChildPanelTicketDetail | null>(null);
  const [loadingTicketDetail, setLoadingTicketDetail] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [ticketSearch, setTicketSearch] = useState('');

  // ---------------------------------------------------------------------------
  // TAB 3: USERS STATE
  // ---------------------------------------------------------------------------
  const [usersList, setUsersList] = useState<ChildPanelUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // Balance adjustment modal
  const [adjustModalUser, setAdjustModalUser] = useState<ChildPanelUser | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<string>('500');
  const [adjustAction, setAdjustAction] = useState<'credit' | 'debit'>('credit');
  const [adjustReason, setAdjustReason] = useState<string>('Manual panel adjustment');
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  // Notifications
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // ---------------------------------------------------------------------------
  // TAB 4: PAYMENTS & TILL CONFIG STATE
  // ---------------------------------------------------------------------------
  const [gatewayConfig, setGatewayConfig] = useState<ChildPanelPaymentGatewayConfig>({
    gateway_provider: 'payhero',
    is_active: true,
    payhero_channel_id: '',
    payhero_api_key: '',
    payhero_api_secret: '',
    payhero_account_name: '',
    paystack_public_key: '',
    paystack_secret_key: '',
    manual_till_number: '',
    manual_account_name: '',
    manual_instructions: '',
  });
  const [loadingGateway, setLoadingGateway] = useState(false);
  const [savingGateway, setSavingGateway] = useState(false);

  const loadGatewayConfig = async () => {
    if (!activePanel) return;
    setLoadingGateway(true);
    try {
      const data = await childPanelService.getPanelPaymentGateway(activePanel.id);
      setGatewayConfig(data);
    } catch (err: any) {
      // Keep defaults
    } finally {
      setLoadingGateway(false);
    }
  };

  const handleSaveGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePanel) return;
    setSavingGateway(true);
    try {
      const updated = await childPanelService.updatePanelPaymentGateway(activePanel.id, gatewayConfig);
      setGatewayConfig(updated);
      showToast('success', 'Payment gateway settings saved successfully! Customer deposits will now go directly to your Till.');
    } catch (err: any) {
      showToast('error', err.response?.data?.detail || 'Failed to save payment gateway settings.');
    } finally {
      setSavingGateway(false);
    }
  };

  // Sync tab with URL
  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // Fetch initial panels owned by user
  useEffect(() => {
    const fetchPanels = async () => {
      setLoadingPanels(true);
      try {
        const myPanels = await childPanelService.getMyPanels();
        setPanels(myPanels);
        if (myPanels.length > 0) {
          if (panelId) {
            const match = myPanels.find((p) => p.id === panelId);
            setActivePanel(match || myPanels[0]);
          } else {
            setActivePanel(myPanels[0]);
          }
        }
      } catch (err: any) {
        showToast('error', err.response?.data?.detail || 'Failed to load child panels.');
      } finally {
        setLoadingPanels(false);
      }
    };
    fetchPanels();
  }, [panelId]);

  // Load orders data when activePanel or order filters change
  const loadOrders = async () => {
    if (!activePanel) return;
    setLoadingOrders(true);
    try {
      const [ordersData, statsData] = await Promise.all([
        childPanelService.getPanelOrders(activePanel.id, {
          status: orderStatusFilter !== 'all' ? orderStatusFilter : undefined,
          search: orderSearch.trim() || undefined,
        }),
        childPanelService.getPanelOrderStats(activePanel.id),
      ]);
      setOrders(ordersData);
      setOrderStats(statsData);
    } catch (err: any) {
      showToast('error', err.response?.data?.detail || 'Failed to load panel orders.');
    } finally {
      setLoadingOrders(false);
    }
  };

  // Load tickets data when activePanel or ticket filters change
  const loadTickets = async () => {
    if (!activePanel) return;
    setLoadingTickets(true);
    try {
      const ticketsData = await childPanelService.getPanelTickets(activePanel.id, {
        status: ticketStatusFilter !== 'all' ? ticketStatusFilter : undefined,
      });
      setTickets(ticketsData);
      if (ticketsData.length > 0 && !selectedTicket) {
        loadTicketDetail(ticketsData[0].id);
      }
    } catch (err: any) {
      showToast('error', err.response?.data?.detail || 'Failed to load support tickets.');
    } finally {
      setLoadingTickets(false);
    }
  };

  const loadTicketDetail = async (ticketId: string) => {
    if (!activePanel) return;
    setLoadingTicketDetail(true);
    try {
      const detail = await childPanelService.getPanelTicketDetail(activePanel.id, ticketId);
      setSelectedTicket(detail);
    } catch (err: any) {
      showToast('error', err.response?.data?.detail || 'Failed to load ticket details.');
    } finally {
      setLoadingTicketDetail(false);
    }
  };

  // Load users data when activePanel or user search change
  const loadUsers = async () => {
    if (!activePanel) return;
    setLoadingUsers(true);
    try {
      const usersData = await childPanelService.getPanelUsers(activePanel.id, {
        search: userSearch.trim() || undefined,
      });
      setUsersList(usersData);
    } catch (err: any) {
      showToast('error', err.response?.data?.detail || 'Failed to load registered customers.');
    } finally {
      setLoadingUsers(false);
    }
  };

  // Trigger loads based on activeTab
  useEffect(() => {
    if (!activePanel) return;
    if (activeTab === 'orders') {
      loadOrders();
    } else if (activeTab === 'tickets') {
      loadTickets();
    } else if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'payments') {
      loadGatewayConfig();
    }
  }, [activePanel, activeTab, orderStatusFilter, ticketStatusFilter]);

  // Order Cancel & Refund
  const handleCancelOrder = async (orderId: string, orderNumber?: number) => {
    if (!activePanel) return;
    if (!window.confirm(`Are you sure you want to cancel Order #${orderNumber || orderId.slice(0, 8)} and refund the customer wallet?`)) {
      return;
    }
    setCancelingOrderId(orderId);
    try {
      await childPanelService.cancelPanelOrder(activePanel.id, orderId);
      showToast('success', 'Order canceled and customer balance refunded successfully.');
      loadOrders();
    } catch (err: any) {
      showToast('error', err.response?.data?.detail || 'Failed to cancel order.');
    } finally {
      setCancelingOrderId(null);
    }
  };

  // Ticket Reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePanel || !selectedTicket || !replyMessage.trim()) return;
    setSendingReply(true);
    try {
      const updated = await childPanelService.replyPanelTicket(activePanel.id, selectedTicket.id, replyMessage.trim());
      setSelectedTicket(updated);
      setReplyMessage('');
      showToast('success', 'Staff reply sent.');
      loadTickets();
    } catch (err: any) {
      showToast('error', err.response?.data?.detail || 'Failed to send reply.');
    } finally {
      setSendingReply(false);
    }
  };

  // Ticket Status Toggle
  const handleToggleTicketStatus = async (newStatus: 'open' | 'closed') => {
    if (!activePanel || !selectedTicket) return;
    try {
      const updated = await childPanelService.updatePanelTicketStatus(activePanel.id, selectedTicket.id, newStatus);
      setSelectedTicket(updated);
      showToast('success', `Ticket marked as ${newStatus}.`);
      loadTickets();
    } catch (err: any) {
      showToast('error', err.response?.data?.detail || 'Failed to update ticket status.');
    }
  };

  // Toggle user active status
  const handleToggleUserStatus = async (userRecord: ChildPanelUser) => {
    if (!activePanel) return;
    const nextStatus = !userRecord.is_active;
    setUpdatingUserId(userRecord.id);
    try {
      await childPanelService.updatePanelUserStatus(activePanel.id, userRecord.id, nextStatus);
      showToast('success', `Customer @${userRecord.username} ${nextStatus ? 'activated' : 'suspended'}.`);
      loadUsers();
    } catch (err: any) {
      showToast('error', err.response?.data?.detail || 'Failed to update customer status.');
    } finally {
      setUpdatingUserId(null);
    }
  };

  // User Balance Adjust Submit
  const handleAdjustBalanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePanel || !adjustModalUser) return;
    const num = parseFloat(adjustAmount);
    if (isNaN(num) || num <= 0) {
      showToast('error', 'Please enter a valid amount.');
      return;
    }
    const finalAmount = adjustAction === 'credit' ? num : -num;
    setSubmittingAdjust(true);
    try {
      await childPanelService.adjustPanelUserBalance(
        activePanel.id,
        adjustModalUser.id,
        finalAmount,
        adjustReason.trim()
      );
      showToast('success', `Adjusted balance for @${adjustModalUser.username} by Ksh ${finalAmount.toFixed(2)}.`);
      setAdjustModalUser(null);
      loadUsers();
    } catch (err: any) {
      showToast('error', err.response?.data?.detail || 'Failed to adjust balance.');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  const handleLaunchLocalhostSimulation = async () => {
    if (!activePanel) return;
    await enterTenantMode(activePanel.domain);
    navigate('/services');
  };

  if (loadingPanels) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-3">
        <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
        <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Loading Panel Management Hub...</span>
      </div>
    );
  }

  if (!activePanel) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
          <Globe className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-white">No Child Panels Found</h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          You have not rented any child panels yet. Rent your own branded child panel to start hosting customers, selling marked-up services, and managing your independent SMM business!
        </p>
        <Button variant="primary" onClick={() => navigate('/child-panel')} leftIcon={<Sparkles className="w-4 h-4" />}>
          Rent a Child Panel
        </Button>
      </div>
    );
  }

  const filteredTickets = tickets.filter((t) => {
    if (!ticketSearch.trim()) return true;
    const s = ticketSearch.toLowerCase();
    return t.subject.toLowerCase().includes(s) || t.username.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-2xl border text-xs font-bold flex items-center gap-2.5 transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#181a20] p-5 rounded-2xl border border-[#2b303c] shadow-lg">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/child-panel')}
              className="p-1.5 rounded-lg bg-[#121418] hover:bg-[#222630] border border-[#2b303c] text-slate-400 hover:text-white transition-colors"
              title="Back to Child Panels"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                Child Panel Management Hub
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold uppercase">
                {activePanel.status}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <Globe className="w-6 h-6 text-amber-400" />
              <span>{activePanel.domain}</span>
            </h1>
            {/* Panel Switcher Dropdown if user owns multiple panels */}
            {panels.length > 1 && (
              <div className="relative">
                <select
                  value={activePanel.id}
                  onChange={(e) => {
                    const chosen = panels.find((p) => p.id === e.target.value);
                    if (chosen) {
                      setActivePanel(chosen);
                      navigate(`/child-panel/${chosen.id}/manage?tab=${activeTab}`);
                    }
                  }}
                  className="bg-[#121418] border border-[#2b303c] text-slate-300 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500 transition-colors"
                >
                  {panels.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.domain} ({p.status})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Dedicated administrator operations for your child panel: monitor customer orders, reply to helpdesk tickets, and manage user accounts.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLaunchLocalhostSimulation}
            leftIcon={<Sparkles className="w-3.5 h-3.5 text-amber-400" />}
            title="Simulate customer experience on localhost"
          >
            Open Localhost
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsBrandingOpen(true)}
            leftIcon={<Sliders className="w-3.5 h-3.5 text-cyan-400" />}
            title="Configure branding, markup & colors"
          >
            Branding & Markup
          </Button>
          <a
            href={`https://${activePanel.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-xl bg-[#121418] hover:bg-[#222630] border border-[#2b303c] text-slate-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5"
            title="Open external live domain"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            <span>Live Site</span>
          </a>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#2b303c] pb-3 overflow-x-auto">
        <button
          onClick={() => handleTabChange('orders')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeTab === 'orders'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-[#181a20]'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Orders Monitor</span>
          {orderStats && (
            <span
              className={`px-1.5 py-0.5 text-[10px] font-black rounded-full ${
                activeTab === 'orders' ? 'bg-slate-950/20 text-slate-950' : 'bg-[#222630] text-amber-300'
              }`}
            >
              {orderStats.total_orders}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('tickets')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeTab === 'tickets'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-[#181a20]'
          }`}
        >
          <LifeBuoy className="w-4 h-4" />
          <span>Support Helpdesk</span>
          {tickets.length > 0 && (
            <span
              className={`px-1.5 py-0.5 text-[10px] font-black rounded-full ${
                activeTab === 'tickets' ? 'bg-slate-950/20 text-slate-950' : 'bg-[#222630] text-amber-300'
              }`}
            >
              {tickets.filter((t) => t.status === 'open' || t.status === 'customer_reply').length} open
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('users')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeTab === 'users'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-[#181a20]'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Management</span>
          {usersList.length > 0 && (
            <span
              className={`px-1.5 py-0.5 text-[10px] font-black rounded-full ${
                activeTab === 'users' ? 'bg-slate-950/20 text-slate-950' : 'bg-[#222630] text-amber-300'
              }`}
            >
              {usersList.length}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('payments')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeTab === 'payments'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-[#181a20]'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Till & Payments</span>
          {gatewayConfig.payhero_channel_id ? (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Till Active" />
          ) : null}
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: ORDERS MONITOR */}
      {/* ===================================================================== */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* Order Financial & Volume Metrics Cards */}
          {orderStats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <Card className="p-3 bg-[#181a20] border-[#2b303c]">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Total Orders</span>
                <span className="text-xl font-black text-white">{orderStats.total_orders}</span>
              </Card>

              <Card className="p-3 bg-[#181a20] border-[#2b303c]">
                <span className="text-[10px] uppercase font-bold text-amber-400 block mb-0.5">Pending / In Prog</span>
                <span className="text-xl font-black text-amber-300">
                  {orderStats.pending_orders + orderStats.in_progress_orders + orderStats.processing_orders}
                </span>
              </Card>

              <Card className="p-3 bg-[#181a20] border-[#2b303c]">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-0.5">Completed</span>
                <span className="text-xl font-black text-emerald-400">{orderStats.completed_orders}</span>
              </Card>

              <Card className="p-3 bg-[#181a20] border-[#2b303c]">
                <span className="text-[10px] uppercase font-bold text-rose-400 block mb-0.5">Canceled</span>
                <span className="text-xl font-black text-rose-400">{orderStats.canceled_orders}</span>
              </Card>

              <Card className="p-3 bg-[#181a20] border-[#2b303c]">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Customer Turnover</span>
                <span className="text-base font-black text-white">
                  Ksh {Number(orderStats.total_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </Card>

              <Card className="p-3 bg-[#181a20] border-emerald-500/30 bg-emerald-500/5">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-0.5 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  Your Net Profit
                </span>
                <span className="text-base font-black text-emerald-400">
                  Ksh {Number(orderStats.total_profit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </Card>
            </div>
          )}

          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#181a20] p-3 rounded-xl border border-[#2b303c]">
            {/* Status Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: 'all', label: 'All' },
                { id: 'pending', label: 'Pending' },
                { id: 'in_progress', label: 'In Progress' },
                { id: 'completed', label: 'Completed' },
                { id: 'canceled', label: 'Canceled' },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => setOrderStatusFilter(s.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    orderStatusFilter === s.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-[#121418] text-slate-400 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search order #, link, customer..."
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadOrders()}
                className="w-full pl-9 pr-3 py-1.5 bg-[#121418] border border-[#2b303c] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <Button variant="outline" size="sm" onClick={loadOrders} isLoading={loadingOrders} leftIcon={<RefreshCcw className="w-3 h-3" />}>
              Refresh
            </Button>
          </div>

          {/* Orders Table */}
          <Card className="overflow-hidden border-[#2b303c] p-0 bg-[#181a20]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#121418] border-b border-[#2b303c] text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Target Link</th>
                    <th className="py-3 px-4 text-right">Quantity</th>
                    <th className="py-3 px-4 text-right">Charge</th>
                    <th className="py-3 px-4 text-right">Your Profit</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2b303c]/60 font-medium">
                  {loadingOrders ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-500">
                        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        Loading orders...
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-500">
                        No orders found for this child panel matching the filter.
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id} className="hover:bg-[#222630]/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-white">
                          #{o.order_number || o.id.slice(0, 8)}
                        </td>
                        <td className="py-3 px-4 font-bold text-amber-300">
                          @{o.username}
                        </td>
                        <td className="py-3 px-4 max-w-[200px] truncate" title={o.service_name}>
                          {o.service_name}
                        </td>
                        <td className="py-3 px-4 max-w-[180px]">
                          <div className="flex items-center gap-1.5">
                            <a
                              href={formatExternalUrl(o.target_link, undefined, o.service_name)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate text-amber-400 hover:text-amber-300 font-mono text-[11px] flex items-center gap-1"
                              title={formatExternalUrl(o.target_link, undefined, o.service_name)}
                            >
                              <span className="truncate">{o.target_link}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </a>
                            <button
                              onClick={() => copyToClipboard(o.target_link, o.id)}
                              className="text-slate-500 hover:text-white shrink-0"
                              title="Copy link"
                            >
                              {copiedId === o.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">
                          {Number(o.quantity).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">
                          Ksh {Number(o.charge).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                          +Ksh {Number(o.profit).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                              o.status === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : o.status === 'in_progress' || o.status === 'processing'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : o.status === 'canceled'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                            }`}
                          >
                            {o.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                          {new Date(o.created_at).toLocaleDateString()} {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {o.status !== 'completed' && o.status !== 'canceled' && (
                            <button
                              onClick={() => handleCancelOrder(o.id, o.order_number)}
                              disabled={cancelingOrderId === o.id}
                              className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 hover:text-rose-300 text-[10px] font-bold transition-colors cursor-pointer"
                              title="Cancel order and refund customer wallet"
                            >
                              {cancelingOrderId === o.id ? 'Refunding...' : 'Cancel & Refund'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: SUPPORT HELPDESK */}
      {/* ===================================================================== */}
      {activeTab === 'tickets' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Tickets List Column */}
          <div className="lg:col-span-5 space-y-3">
            {/* Filter & Search */}
            <div className="bg-[#181a20] p-3 rounded-xl border border-[#2b303c] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase text-slate-200 tracking-wider flex items-center gap-1.5">
                  <LifeBuoy className="w-3.5 h-3.5 text-amber-400" />
                  Panel Tickets
                </span>
                <Button variant="outline" size="sm" onClick={loadTickets} isLoading={loadingTickets} leftIcon={<RefreshCcw className="w-3 h-3" />}>
                  Refresh
                </Button>
              </div>

              {/* Status Tabs */}
              <div className="flex items-center gap-1">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'open', label: 'Open' },
                  { id: 'answered', label: 'Answered' },
                  { id: 'closed', label: 'Closed' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setTicketStatusFilter(s.id)}
                    className={`flex-1 py-1 text-center rounded text-[11px] font-bold transition-colors cursor-pointer ${
                      ticketStatusFilter === s.id
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-[#121418] text-slate-400 hover:text-white'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter by subject or customer..."
                  value={ticketSearch}
                  onChange={(e) => setTicketSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-[#121418] border border-[#2b303c] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Ticket Cards */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {loadingTickets ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Loading tickets...
                </div>
              ) : filteredTickets.length === 0 ? (
                <Card className="p-6 text-center text-slate-500 text-xs bg-[#181a20] border-[#2b303c]">
                  No tickets found.
                </Card>
              ) : (
                filteredTickets.map((t) => {
                  const isSelected = selectedTicket?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => loadTicketDetail(t.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#222630] border-amber-500/50 shadow-md shadow-amber-500/5'
                          : 'bg-[#181a20] border-[#2b303c] hover:border-slate-500/40 hover:bg-[#1c2027]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="font-bold text-xs text-white truncate max-w-[200px]">
                          {t.subject}
                        </div>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                            t.status === 'open' || t.status === 'customer_reply'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : t.status === 'answered'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-medium text-amber-400/90 font-mono">@{t.username}</span>
                        <span>{new Date(t.updated_at).toLocaleDateString()}</span>
                      </div>

                      {t.last_message && (
                        <p className="text-[11px] text-slate-400 truncate mt-1.5 line-clamp-1 italic">
                          "{t.last_message}"
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Conversation Thread Column */}
          <div className="lg:col-span-7">
            {selectedTicket ? (
              <Card className="p-0 bg-[#181a20] border-[#2b303c] overflow-hidden flex flex-col h-[650px]">
                {/* Header */}
                <div className="p-4 border-b border-[#2b303c] bg-[#14161a] flex items-center justify-between gap-2">
                  <div className="space-y-0.5 truncate">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-white truncate">{selectedTicket.subject}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#222630] border border-[#2b303c] text-amber-400 font-mono">
                        Priority: {selectedTicket.priority}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 block truncate">
                      From customer <strong className="text-white">@{selectedTicket.username}</strong>
                    </span>
                  </div>

                  {/* Close / Reopen button */}
                  <div className="shrink-0 flex items-center gap-1.5">
                    {selectedTicket.status !== 'closed' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleTicketStatus('closed')}
                        leftIcon={<XCircle className="w-3.5 h-3.5 text-rose-400" />}
                      >
                        Close Ticket
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleTicketStatus('open')}
                        leftIcon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                      >
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>

                {/* Messages Body */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#121418]/60">
                  {loadingTicketDetail ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-500">
                      Loading conversation...
                    </div>
                  ) : (
                    selectedTicket.messages.map((m) => {
                      const isStaff = m.is_admin_reply;
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${isStaff ? 'items-end' : 'items-start'}`}
                        >
                          <div className="flex items-center gap-2 mb-1 px-1 text-[10px]">
                            <span className={`font-bold ${isStaff ? 'text-amber-400' : 'text-slate-300'}`}>
                              {isStaff ? 'Panel Staff (You)' : `@${m.sender_username}`}
                            </span>
                            <span className="text-slate-500">
                              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div
                            className={`p-3.5 rounded-2xl max-w-[85%] text-xs leading-relaxed whitespace-pre-wrap ${
                              isStaff
                                ? 'bg-amber-500/15 border border-amber-500/30 text-amber-100 rounded-tr-none'
                                : 'bg-[#1e222a] border border-[#2b303c] text-slate-200 rounded-tl-none'
                            }`}
                          >
                            {m.message}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Reply Form Footer */}
                <form onSubmit={handleSendReply} className="p-3 border-t border-[#2b303c] bg-[#14161a] flex gap-2">
                  <input
                    type="text"
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type official staff reply to customer..."
                    disabled={sendingReply}
                    className="flex-1 px-3.5 py-2 bg-[#121418] border border-[#2b303c] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 placeholder:text-slate-600 font-medium"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!replyMessage.trim()}
                    isLoading={sendingReply}
                    leftIcon={<Send className="w-3.5 h-3.5" />}
                  >
                    Reply
                  </Button>
                </form>
              </Card>
            ) : (
              <Card className="h-[650px] flex flex-col items-center justify-center text-center p-8 bg-[#181a20] border-[#2b303c] text-slate-500 space-y-2">
                <MessageSquare className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-sm font-bold text-slate-300">No Ticket Selected</h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  Select a ticket from the left panel to inspect the threaded customer conversation and respond as support staff.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: USER MANAGEMENT */}
      {/* ===================================================================== */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Summary / Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#181a20] p-4 rounded-xl border border-[#2b303c]">
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" />
                <span>Registered Panel Customers</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                  {usersList.length} Accounts
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Customers registered directly on <span className="font-mono text-amber-300">{activePanel.domain}</span>.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search customer username, email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadUsers()}
                  className="w-full pl-9 pr-3 py-1.5 bg-[#121418] border border-[#2b303c] rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <Button variant="outline" size="sm" onClick={loadUsers} isLoading={loadingUsers} leftIcon={<RefreshCcw className="w-3 h-3" />}>
                Refresh
              </Button>
            </div>
          </div>

          {/* Customers Table */}
          <Card className="overflow-hidden border-[#2b303c] p-0 bg-[#181a20]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#121418] border-b border-[#2b303c] text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4 text-right">Wallet Balance</th>
                    <th className="py-3 px-4 text-right">Total Orders</th>
                    <th className="py-3 px-4 text-right">Total Spent</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4">Joined Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2b303c]/60 font-medium">
                  {loadingUsers ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        Loading registered customers...
                      </td>
                    </tr>
                  ) : usersList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        No registered customers yet on this child panel.
                      </td>
                    </tr>
                  ) : (
                    usersList.map((u) => (
                      <tr key={u.id} className="hover:bg-[#222630]/40 transition-colors">
                        <td className="py-3 px-4 font-bold text-amber-300 font-mono">
                          @{u.username}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {u.email}
                        </td>
                        <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                          {u.phone_number || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">
                          Ksh {Number(u.balance).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-300">
                          {u.total_orders}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                          Ksh {Number(u.total_spent).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              u.is_active
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {u.is_active ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setAdjustModalUser(u);
                                setAdjustAmount('500');
                                setAdjustAction('credit');
                              }}
                              className="px-2.5 py-1 rounded bg-[#222630] hover:bg-amber-500/15 border border-[#2b303c] hover:border-amber-500/30 text-amber-300 text-[11px] font-bold transition-colors cursor-pointer"
                              title="Credit or debit customer wallet balance"
                            >
                              Adjust Funds
                            </button>

                            <button
                              onClick={() => handleToggleUserStatus(u)}
                              disabled={updatingUserId === u.id}
                              className={`p-1.5 rounded border transition-colors cursor-pointer ${
                                u.is_active
                                  ? 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/25 text-rose-400'
                                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/25 text-emerald-400'
                              }`}
                              title={u.is_active ? 'Suspend customer' : 'Activate customer'}
                            >
                              {u.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: TILL & PAYMENTS GATEWAY CONFIGURATION */}
      {/* ===================================================================== */}
      {activeTab === 'payments' && (
        <div className="space-y-6">
          {/* Top Explanatory & Wallet Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Direct Till Card */}
            <Card className="p-5 bg-[#181a20] border-[#2b303c] space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Direct M-Pesa Till / Paybill</h3>
                  <p className="text-xs text-slate-400">Receive 100% of customer deposits in your own account</p>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Connect your Safaricom <strong>Buy Goods Till</strong> or <strong>Paybill</strong> using{' '}
                <a
                  href="https://payhero.co.ke"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 font-bold hover:underline inline-flex items-center gap-1"
                >
                  PayHero Kenya <ExternalLink className="w-3 h-3" />
                </a>
                . Automated STK push prompts appear on your customer’s phone with your Till’s name, and money lands directly into your mobile wallet.
              </p>
              <div className="flex items-center gap-2 pt-1 text-[11px] text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Zero Safaricom developer approvals required — ready in 2 minutes.</span>
              </div>
            </Card>

            {/* Wholesale Fuel Tank Card */}
            <Card className="p-5 bg-[#181a20] border-[#2b303c] space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">Parent Wholesale Balance</h3>
                    <p className="text-xs text-slate-400">Fuel tank for order fulfillment</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Available</span>
                  <span className="text-lg font-black font-mono text-cyan-400">
                    Ksh {Number(user?.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                When a customer purchases on <strong>{activePanel.domain}</strong>, the wholesale cost is automatically deducted from this balance. Keep this funded so customer orders are never paused.
              </p>
              <div className="pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/wallet/deposit')}
                  leftIcon={<DollarSign className="w-3.5 h-3.5 text-cyan-400" />}
                  className="w-full sm:w-auto"
                >
                  Top Up Parent Balance
                </Button>
              </div>
            </Card>
          </div>

          {/* Gateway Configuration Form Card */}
          <Card className="p-6 bg-[#181a20] border-[#2b303c] space-y-6">
            <div className="border-b border-[#2b303c] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-white flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-amber-400" />
                  Payment Gateway Settings
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure how customer deposits on <strong>{activePanel.domain}</strong> are processed.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    gatewayConfig.is_active && gatewayConfig.payhero_channel_id
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}
                >
                  {gatewayConfig.is_active && gatewayConfig.payhero_channel_id
                    ? '● Direct Till Connected'
                    : '○ Default Gateway Active'}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveGateway} className="space-y-6">
              {/* Provider Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">Select Payment Method</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setGatewayConfig({ ...gatewayConfig, gateway_provider: 'payhero' })}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                      gatewayConfig.gateway_provider === 'payhero'
                        ? 'bg-amber-500/10 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                        : 'bg-[#121418] border-[#2b303c] text-slate-400 hover:text-white hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-extrabold text-amber-400">PayHero Kenya</span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-black">
                        RECOMMENDED
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Lipa Na M-Pesa automated STK push straight to your Till or Paybill.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGatewayConfig({ ...gatewayConfig, gateway_provider: 'paystack' })}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                      gatewayConfig.gateway_provider === 'paystack'
                        ? 'bg-amber-500/10 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                        : 'bg-[#121418] border-[#2b303c] text-slate-400 hover:text-white hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-extrabold text-cyan-400">Paystack</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Cards, Bank Transfers & Pan-African mobile payments.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGatewayConfig({ ...gatewayConfig, gateway_provider: 'manual' })}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                      gatewayConfig.gateway_provider === 'manual'
                        ? 'bg-amber-500/10 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                        : 'bg-[#121418] border-[#2b303c] text-slate-400 hover:text-white hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-extrabold text-slate-300">Manual Till</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Display your Till number; customer manually enters M-Pesa transaction code.
                    </p>
                  </button>
                </div>
              </div>

              {/* PAYHERO CONFIGURATION FIELDS */}
              {gatewayConfig.gateway_provider === 'payhero' && (
                <div className="space-y-4 p-5 rounded-2xl bg-[#121418] border border-[#2b303c]">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                    <Key className="w-4 h-4" />
                    <span>PayHero Till & Credentials</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        PayHero Channel ID (Your Till/Paybill) <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={gatewayConfig.payhero_channel_id || ''}
                        onChange={(e) => setGatewayConfig({ ...gatewayConfig, payhero_channel_id: e.target.value })}
                        placeholder="e.g. 1245 or your Channel ID"
                        className="w-full px-3.5 py-2.5 bg-[#181a20] border border-[#2b303c] rounded-xl text-white text-xs font-mono font-bold focus:outline-none focus:border-amber-500"
                        required
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Found in your PayHero Dashboard under <strong>Channels</strong>.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        Business / Account Name <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={gatewayConfig.payhero_account_name || ''}
                        onChange={(e) => setGatewayConfig({ ...gatewayConfig, payhero_account_name: e.target.value })}
                        placeholder="e.g. Apex Media Reseller"
                        className="w-full px-3.5 py-2.5 bg-[#181a20] border border-[#2b303c] rounded-xl text-white text-xs font-bold focus:outline-none focus:border-amber-500"
                        required
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        The business name displayed to the customer during the M-Pesa prompt.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        PayHero API Key <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={gatewayConfig.payhero_api_key || ''}
                        onChange={(e) => setGatewayConfig({ ...gatewayConfig, payhero_api_key: e.target.value })}
                        placeholder="live_..."
                        className="w-full px-3.5 py-2.5 bg-[#181a20] border border-[#2b303c] rounded-xl text-white text-xs font-mono focus:outline-none focus:border-amber-500"
                        required
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Generate under <strong>Settings &gt; API Keys</strong> on payhero.co.ke.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        PayHero API Secret (Optional)
                      </label>
                      <input
                        type="password"
                        value={gatewayConfig.payhero_api_secret || ''}
                        onChange={(e) => setGatewayConfig({ ...gatewayConfig, payhero_api_secret: e.target.value })}
                        placeholder="Leave empty if using Bearer token"
                        className="w-full px-3.5 py-2.5 bg-[#181a20] border border-[#2b303c] rounded-xl text-white text-xs font-mono focus:outline-none focus:border-amber-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Only needed if your PayHero account uses Basic HTTP Authentication.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 p-3 bg-[#181a20] rounded-xl border border-[#2b303c] flex items-center justify-between text-xs text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-cyan-400" />
                      Webhook Callback URL (Already configured automatically):
                    </span>
                    <code className="text-amber-300 font-mono text-[11px] bg-black/40 px-2 py-0.5 rounded">
                      https://social-pulse-smm-0geu.onrender.com/api/v1/payments/payhero/callback
                    </code>
                  </div>
                </div>
              )}

              {/* PAYSTACK CONFIGURATION FIELDS */}
              {gatewayConfig.gateway_provider === 'paystack' && (
                <div className="space-y-4 p-5 rounded-2xl bg-[#121418] border border-[#2b303c]">
                  <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
                    <Key className="w-4 h-4" />
                    <span>Paystack API Credentials</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        Paystack Public Key <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={gatewayConfig.paystack_public_key || ''}
                        onChange={(e) => setGatewayConfig({ ...gatewayConfig, paystack_public_key: e.target.value })}
                        placeholder="pk_live_..."
                        className="w-full px-3.5 py-2.5 bg-[#181a20] border border-[#2b303c] rounded-xl text-white text-xs font-mono focus:outline-none focus:border-amber-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        Paystack Secret Key <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="password"
                        value={gatewayConfig.paystack_secret_key || ''}
                        onChange={(e) => setGatewayConfig({ ...gatewayConfig, paystack_secret_key: e.target.value })}
                        placeholder="sk_live_..."
                        className="w-full px-3.5 py-2.5 bg-[#181a20] border border-[#2b303c] rounded-xl text-white text-xs font-mono focus:outline-none focus:border-amber-500"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* MANUAL TILL FIELDS */}
              {gatewayConfig.gateway_provider === 'manual' && (
                <div className="space-y-4 p-5 rounded-2xl bg-[#121418] border border-[#2b303c]">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                    <Smartphone className="w-4 h-4 text-amber-400" />
                    <span>Manual Till Instructions</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        Till / Paybill Number <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={gatewayConfig.manual_till_number || ''}
                        onChange={(e) => setGatewayConfig({ ...gatewayConfig, manual_till_number: e.target.value })}
                        placeholder="e.g. 524123"
                        className="w-full px-3.5 py-2.5 bg-[#181a20] border border-[#2b303c] rounded-xl text-white text-xs font-bold focus:outline-none focus:border-amber-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        Business / Account Name
                      </label>
                      <input
                        type="text"
                        value={gatewayConfig.manual_account_name || ''}
                        onChange={(e) => setGatewayConfig({ ...gatewayConfig, manual_account_name: e.target.value })}
                        placeholder="e.g. Apex Media Services"
                        className="w-full px-3.5 py-2.5 bg-[#181a20] border border-[#2b303c] rounded-xl text-white text-xs font-bold focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        Instructions shown to customer
                      </label>
                      <textarea
                        rows={3}
                        value={gatewayConfig.manual_instructions || ''}
                        onChange={(e) => setGatewayConfig({ ...gatewayConfig, manual_instructions: e.target.value })}
                        placeholder="e.g. Go to Lipa Na M-Pesa > Buy Goods > Enter Till Number above. Then enter the transaction code below."
                        className="w-full px-3.5 py-2.5 bg-[#181a20] border border-[#2b303c] rounded-xl text-white text-xs focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Status Toggle & Submit */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-[#2b303c]">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gatewayConfig.is_active}
                    onChange={(e) => setGatewayConfig({ ...gatewayConfig, is_active: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-500 bg-[#121418] border-[#2b303c] focus:ring-0"
                  />
                  <span className="text-xs font-bold text-slate-300">
                    Enable custom payment gateway on <strong>{activePanel.domain}</strong>
                  </span>
                </label>

                <Button
                  variant="primary"
                  type="submit"
                  isLoading={savingGateway}
                  leftIcon={<Save className="w-4 h-4" />}
                >
                  Save Gateway Settings
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Adjust Balance Modal */}
      {adjustModalUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#181a20] border border-[#2b303c] rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2b303c] pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-black text-white">Adjust Customer Balance</h3>
              </div>
              <button
                onClick={() => setAdjustModalUser(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#222630]"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#121418] p-3 rounded-xl border border-[#2b303c] text-xs space-y-1">
              <div className="text-slate-400">
                Customer: <strong className="text-white">@{adjustModalUser.username}</strong> ({adjustModalUser.email})
              </div>
              <div className="text-slate-400">
                Current Balance:{' '}
                <strong className="text-amber-300 font-mono">Ksh {Number(adjustModalUser.balance).toFixed(2)}</strong>
              </div>
            </div>

            <form onSubmit={handleAdjustBalanceSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Action Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustAction('credit')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                      adjustAction === 'credit'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                        : 'bg-[#121418] border-[#2b303c] text-slate-400 hover:text-white'
                    }`}
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Credit (+ Deposit)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustAction('debit')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                      adjustAction === 'debit'
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                        : 'bg-[#121418] border-[#2b303c] text-slate-400 hover:text-white'
                    }`}
                  >
                    <MinusCircle className="w-3.5 h-3.5" />
                    Debit (- Deduct)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Amount (KES)</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-[#121418] border border-[#2b303c] rounded-xl text-white text-xs font-bold focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Reason / Note</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Received M-Pesa direct payment"
                  className="w-full px-3 py-2 bg-[#121418] border border-[#2b303c] rounded-xl text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" type="button" onClick={() => setAdjustModalUser(null)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" isLoading={submittingAdjust}>
                  Confirm Adjustment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Branding & Markup Modal */}
      {isBrandingOpen && activePanel && (
        <ChildPanelBrandingModal
          panel={activePanel}
          isOpen={isBrandingOpen}
          onClose={() => setIsBrandingOpen(false)}
          onUpdated={(updated) => {
            setActivePanel(updated);
            setPanels((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          }}
        />
      )}
    </div>
  );
};
