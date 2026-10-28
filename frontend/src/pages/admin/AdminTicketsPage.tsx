import React, { useEffect, useState } from 'react';
import {
  LifeBuoy,
  MessageSquare,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  Check,
  User as UserIcon,
  Plus,
  X,
} from 'lucide-react';
import {
  ticketsService,
  TicketSummary,
  TicketDetail,
  TicketPriority,
  TicketStatus
} from '../../services/tickets';
import { analyticsService } from '../../services/analytics';
import { useTicketNotifications } from '../../context/TicketNotificationContext';
import { User } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

export const AdminTicketsPage: React.FC = () => {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  const { refreshCounts } = useTicketNotifications();

  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [adminReplyText, setAdminReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  // New Ticket / Contact Customer Modal
  const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState(false);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newPriority, setNewPriority] = useState<TicketPriority>('medium');
  const [newOrderId, setNewOrderId] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const handleOpenNewTicketModal = async () => {
    setIsNewTicketModalOpen(true);
    if (usersList.length === 0) {
      try {
        const users = await analyticsService.getUsers({ limit: 100 });
        setUsersList(users);
        if (users.length > 0 && !selectedUserId) {
          setSelectedUserId(users[0].id);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleCreateAdminTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !newSubject.trim() || !newMessage.trim()) return;

    setCreatingTicket(true);
    try {
      const created = await ticketsService.adminCreateTicket({
        user_id: selectedUserId,
        order_id: newOrderId.trim() || undefined,
        subject: newSubject.trim(),
        priority: newPriority,
        message: newMessage.trim(),
      });
      setIsNewTicketModalOpen(false);
      setNewSubject('');
      setNewMessage('');
      setNewOrderId('');
      await fetchTickets();
      setSelectedTicket(created);
      refreshCounts();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to send message to customer');
    } finally {
      setCreatingTicket(false);
    }
  };

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const data = await ticketsService.getAllTickets({
        status_filter: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setTickets(data);
      if (data.length > 0 && !selectedTicket) {
        loadTicketDetails(data[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadTicketDetails = async (id: string) => {
    setLoadingDetails(true);
    try {
      const detail = await ticketsService.getAdminTicketDetails(id);
      setSelectedTicket(detail);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [statusFilter]);

  const handleAdminReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !adminReplyText.trim()) return;

    setSubmittingReply(true);
    try {
      const updated = await ticketsService.adminReplyToTicket(selectedTicket.id, adminReplyText.trim());
      setSelectedTicket(updated);
      setAdminReplyText('');
      await fetchTickets();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (!selectedTicket) return;
    try {
      const updated = await ticketsService.updateTicketStatus(selectedTicket.id, newStatus);
      setSelectedTicket(updated);
      await fetchTickets();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredTickets = tickets.filter(
    (t) =>
      t.subject.toLowerCase().includes(search.toLowerCase()) ||
      t.username.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case 'answered':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Answered
          </span>
        );
      case 'customer_reply':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse">
            Needs Reply
          </span>
        );
      case 'closed':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700">
            Closed
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
            Open
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Admin Support Helpdesk Queue</h1>
          <p className="text-sm text-slate-400 mt-1">
            Resolve customer queries, address order complaints, and provide real-time support
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="sm" onClick={fetchTickets} leftIcon={<RefreshCw className="w-4 h-4" />}>
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenNewTicketModal}
            leftIcon={<Plus className="w-4 h-4" />}
            className="bg-indigo-600 hover:bg-indigo-500"
          >
            Contact Customer
          </Button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Ticket Queue List */}
        <Card title="Helpdesk Queue" subtitle={`${filteredTickets.length} tickets`} className="lg:col-span-1">
          <div className="space-y-3 mb-4">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search user or subject..."
                className="w-full pl-8 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs"
              />
            </div>

            {/* Filter Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[10px] font-semibold text-center">
              {(['all', 'open', 'customer_reply', 'answered', 'closed'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`py-1 rounded-lg capitalize transition-colors ${
                    statusFilter === st ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st === 'customer_reply' ? 'Reply' : st}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading queue...</div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No tickets found.</div>
          ) : (
            <div className="space-y-2.5 max-h-[550px] overflow-y-auto pr-1">
              {filteredTickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => loadTicketDetails(t.id)}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    selectedTicket?.id === t.id
                      ? 'bg-blue-950/30 border-blue-500/50 shadow-md'
                      : t.admin_unread
                      ? 'bg-rose-950/20 border-rose-500/40 border-l-4 border-l-rose-500'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white">@{t.username}</span>
                      {t.admin_unread && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Unread Customer Reply" />
                      )}
                    </div>
                    {getStatusBadge(t.status)}
                  </div>
                  <h4 className="text-xs font-semibold text-slate-300 line-clamp-1">{t.subject}</h4>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-800/80">
                    <span className="uppercase text-amber-400 font-bold">{t.priority}</span>
                    <span>{new Date(t.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Message Thread & Response Console */}
        <Card
          className="lg:col-span-2 flex flex-col h-[680px]"
          title={selectedTicket ? `Ticket: ${selectedTicket.subject}` : 'Staff Response Center'}
          subtitle={selectedTicket ? `Customer: @${selectedTicket.username}` : 'Select a ticket to inspect'}
        >
          {loadingDetails ? (
            <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-400">
              Loading conversation thread...
            </div>
          ) : !selectedTicket ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs p-8">
              Select a support ticket on the left to start responding.
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between overflow-hidden">
              {/* Header Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800 mb-3 text-xs">
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedTicket.status)}
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-900 text-slate-300 border border-slate-800">
                    Priority: {selectedTicket.priority}
                  </span>
                  {selectedTicket.order_id && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-slate-300 border border-slate-800">
                      Order: #{selectedTicket.order_id.slice(0, 8)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedTicket.status}
                    onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                    className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs"
                  >
                    <option value="open">Set Open</option>
                    <option value="answered">Set Answered</option>
                    <option value="customer_reply">Set Customer Reply</option>
                    <option value="closed">Set Closed</option>
                  </select>
                </div>
              </div>

              {/* Message Stream */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-3">
                {selectedTicket.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${
                      m.is_admin_reply ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className="text-[11px] font-bold text-slate-300">
                        {m.sender_username}
                      </span>
                      {m.is_admin_reply ? (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Staff (You)
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-blue-500/20 text-blue-300">
                          Customer
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div
                      className={`p-3.5 rounded-2xl max-w-lg text-xs leading-relaxed ${
                        m.is_admin_reply
                          ? 'bg-purple-950/40 border border-purple-500/40 text-white rounded-tr-sm shadow-md'
                          : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.message}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Staff Response Editor */}
              <form onSubmit={handleAdminReply} className="pt-3 border-t border-slate-800 space-y-2">
                <textarea
                  value={adminReplyText}
                  onChange={(e) => setAdminReplyText(e.target.value)}
                  placeholder="Type official support staff reply to customer..."
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-purple-500"
                  required
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    className="bg-purple-600 hover:bg-purple-500"
                    isLoading={submittingReply}
                    rightIcon={<Send className="w-3.5 h-3.5" />}
                  >
                    Send Official Reply
                  </Button>
                </div>
              </form>
            </div>
          )}
        </Card>
      </div>

      {/* Contact Customer / New Support Ticket Modal */}
      {isNewTicketModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-card rounded-3xl p-6 sm:p-7 border border-slate-800 relative space-y-5 animate-in fade-in duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <MessageSquare className="w-4 h-4" />
                  </span>
                  <h3 className="text-lg font-bold text-white">Contact Customer Personally</h3>
                </div>
                <p className="text-xs text-slate-400">
                  Open a new official support ticket thread. The customer will receive an instant notification badge.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewTicketModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAdminTicket} className="space-y-4">
              {/* Select Customer */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Select Customer
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search username or email..."
                    className="w-full px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs"
                  />
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-- Choose Customer --</option>
                    {usersList
                      .filter(
                        (u) =>
                          u.username.toLowerCase().includes(customerSearch.toLowerCase()) ||
                          u.email.toLowerCase().includes(customerSearch.toLowerCase())
                      )
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.username} ({u.email})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Subject & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Subject Line
                  </label>
                  <input
                    type="text"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    placeholder="e.g. Account Notice, Order Fulfillment Update..."
                    required
                    className="w-full px-3.5 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Priority
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TicketPriority)}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Optional Order ID */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Linked Order ID (Optional)
                </label>
                <input
                  type="text"
                  value={newOrderId}
                  onChange={(e) => setNewOrderId(e.target.value)}
                  placeholder="Paste UUID or leave blank"
                  className="w-full px-3.5 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Message Content
                </label>
                <textarea
                  rows={4}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message to the customer..."
                  required
                  className="w-full p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setIsNewTicketModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={creatingTicket}
                  rightIcon={<Send className="w-3.5 h-3.5" />}
                  className="bg-indigo-600 hover:bg-indigo-500"
                >
                  Send Message
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
