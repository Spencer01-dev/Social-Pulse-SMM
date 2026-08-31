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
  User as UserIcon
} from 'lucide-react';
import {
  ticketsService,
  TicketSummary,
  TicketDetail,
  TicketPriority,
  TicketStatus
} from '../../services/tickets';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

export const AdminTicketsPage: React.FC = () => {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [adminReplyText, setAdminReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

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

        <Button variant="ghost" size="sm" onClick={fetchTickets} leftIcon={<RefreshCw className="w-4 h-4" />}>
          Refresh
        </Button>
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
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-bold text-white">@{t.username}</span>
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
    </div>
  );
};
