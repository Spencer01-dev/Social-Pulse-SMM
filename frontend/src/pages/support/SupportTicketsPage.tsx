import React, { useEffect, useState } from 'react';
import {
  LifeBuoy,
  Plus,
  MessageSquare,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldAlert,
  Check,
  ChevronRight,
  Lock,
  RefreshCw
} from 'lucide-react';
import {
  ticketsService,
  TicketSummary,
  TicketDetail,
  TicketPriority,
  TicketStatus
} from '../../services/tickets';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

export const SupportTicketsPage: React.FC = () => {
  const { user } = useAuth();

  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // New Ticket Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newPriority, setNewPriority] = useState<TicketPriority>('medium');
  const [newOrderId, setNewOrderId] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);

  // Reply State
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const data = await ticketsService.getMyTickets();
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
      const detail = await ticketsService.getTicketDetails(id);
      setSelectedTicket(detail);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newMessage.trim()) return;

    setCreatingTicket(true);
    try {
      const created = await ticketsService.createTicket({
        subject: newSubject.trim(),
        priority: newPriority,
        order_id: newOrderId.trim() || undefined,
        message: newMessage.trim(),
      });
      setIsModalOpen(false);
      setNewSubject('');
      setNewMessage('');
      setNewOrderId('');
      await fetchTickets();
      setSelectedTicket(created);
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;

    setSubmittingReply(true);
    try {
      const updated = await ticketsService.replyToTicket(selectedTicket.id, replyText.trim());
      setSelectedTicket(updated);
      setReplyText('');
      await fetchTickets();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket) return;
    try {
      const updated = await ticketsService.closeTicket(selectedTicket.id);
      setSelectedTicket(updated);
      await fetchTickets();
    } catch (err) {
      console.error(err);
    }
  };

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
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
            Your Reply
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

  const getPriorityBadge = (p: TicketPriority) => {
    switch (p) {
      case 'urgent':
        return <span className="text-[10px] font-extrabold uppercase text-rose-400">● Urgent</span>;
      case 'high':
        return <span className="text-[10px] font-bold uppercase text-amber-400">● High</span>;
      case 'low':
        return <span className="text-[10px] font-medium uppercase text-slate-400">● Low</span>;
      default:
        return <span className="text-[10px] font-semibold uppercase text-blue-400">● Medium</span>;
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Support Tickets & Helpdesk</h1>
          <p className="text-sm text-slate-400 mt-1">
            Open support inquiries, report order fulfillment issues, or message our 24/7 resolution team
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchTickets}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={() => setIsModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Open New Ticket
          </Button>
        </div>
      </div>

      {/* Main Support Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Ticket List Drawer */}
        <Card title="Your Tickets" subtitle={`${tickets.length} support requests`} className="lg:col-span-1">
          {loading ? (
            <div className="p-8 flex flex-col items-center justify-center">
              <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-2" />
              <span className="text-xs text-slate-400">Loading tickets...</span>
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 space-y-3">
              <LifeBuoy className="w-10 h-10 text-slate-600 mx-auto" />
              <p>You have no active support tickets.</p>
              <Button size="sm" variant="secondary" onClick={() => setIsModalOpen(true)}>
                Create Ticket
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
              {tickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => loadTicketDetails(t.id)}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    selectedTicket?.id === t.id
                      ? 'bg-blue-950/30 border-blue-500/50 shadow-md'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    {getPriorityBadge(t.priority)}
                    {getStatusBadge(t.status)}
                  </div>
                  <h4 className="text-xs font-bold text-white line-clamp-1">{t.subject}</h4>
                  {t.last_message && (
                    <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{t.last_message}</p>
                  )}
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-800/80">
                    <span>ID: #{t.id.slice(0, 8)}</span>
                    <span>{new Date(t.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Threaded Message Conversation View */}
        <Card
          className="lg:col-span-2 flex flex-col h-[650px]"
          title={selectedTicket ? selectedTicket.subject : 'Ticket Conversation'}
          subtitle={
            selectedTicket
              ? `Created ${new Date(selectedTicket.created_at).toLocaleString()}`
              : 'Select a ticket on the left to view the thread'
          }
        >
          {loadingDetails ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-2" />
              <span className="text-xs text-slate-400">Loading conversation...</span>
            </div>
          ) : !selectedTicket ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs p-8 text-center">
              <MessageSquare className="w-12 h-12 text-slate-700 mb-3" />
              <p>No ticket selected.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between overflow-hidden">
              {/* Header Info Banner */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4 text-xs">
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedTicket.status)}
                  {getPriorityBadge(selectedTicket.priority)}
                  {selectedTicket.order_id && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-slate-300 border border-slate-800">
                      Order: #{selectedTicket.order_id.slice(0, 8)}
                    </span>
                  )}
                </div>

                {selectedTicket.status !== 'closed' && (
                  <Button variant="ghost" size="sm" onClick={handleCloseTicket}>
                    Close Ticket
                  </Button>
                )}
              </div>

              {/* Chat Message Stream */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4">
                {selectedTicket.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${
                      m.is_admin_reply ? 'items-start' : 'items-end'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className="text-[11px] font-bold text-slate-300">
                        {m.sender_username}
                      </span>
                      {m.is_admin_reply && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Staff
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div
                      className={`p-3.5 rounded-2xl max-w-lg text-xs leading-relaxed ${
                        m.is_admin_reply
                          ? 'bg-slate-900 border border-purple-500/30 text-white rounded-tl-sm'
                          : 'bg-blue-600 text-white rounded-tr-sm shadow-md'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.message}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply Box */}
              {selectedTicket.status === 'closed' ? (
                <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-center text-xs text-slate-400">
                  🔒 This support ticket has been closed.
                </div>
              ) : (
                <form onSubmit={handleSendReply} className="pt-3 border-t border-slate-800 flex gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your response message..."
                    className="flex-1 px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500"
                    required
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    isLoading={submittingReply}
                    rightIcon={<Send className="w-3.5 h-3.5" />}
                  >
                    Send Reply
                  </Button>
                </form>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Create Ticket Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-card rounded-3xl p-6 border border-slate-800 relative animate-scaleUp">
            <h3 className="text-lg font-bold text-white mb-1">Open a Support Ticket</h3>
            <p className="text-xs text-slate-400 mb-5">
              Describe your question or issue and our team will get back to you promptly.
            </p>

            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Subject *</label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="e.g. Order #8a34 hasn't started / Payment query"
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TicketPriority)}
                    className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-xs"
                  >
                    <option value="low">Low (General Inquiry)</option>
                    <option value="medium">Medium (Standard)</option>
                    <option value="high">High (Order Issue)</option>
                    <option value="urgent">Urgent (Billing / Failed Order)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Order ID (Optional)</label>
                  <input
                    type="text"
                    value={newOrderId}
                    onChange={(e) => setNewOrderId(e.target.value)}
                    placeholder="Paste order UUID"
                    className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Message Description *</label>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Provide all relevant details (e.g., target link, expected results)..."
                  rows={4}
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <Button type="button" variant="ghost" size="md" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="md" isLoading={creatingTicket}>
                  Submit Ticket
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
