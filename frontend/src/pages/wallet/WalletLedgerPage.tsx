import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  PlusCircle,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  Check,
  CreditCard
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { paymentsService } from '../../services/payments';
import { Transaction, TransactionStatus, TransactionType } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

export const WalletLedgerPage: React.FC = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedType, setSelectedType] = useState<TransactionType | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const data = await paymentsService.getMyTransactions({
        type: selectedType !== 'all' ? selectedType : undefined,
      });
      setTransactions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [selectedType]);

  const copyRef = (ref: string) => {
    navigator.clipboard.writeText(ref);
    setCopiedRef(ref);
    setTimeout(() => setCopiedRef(null), 2000);
  };

  const getStatusBadge = (status: TransactionStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Completed
          </span>
        );
      case 'pending':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Pending
          </span>
        );
      case 'failed':
      case 'reversed':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            {status}
          </span>
        );
      default:
        return null;
    }
  };

  const typeTabs: { id: TransactionType | 'all'; label: string }[] = [
    { id: 'all', label: 'All Activity' },
    { id: 'deposit', label: 'Deposits' },
    { id: 'order_payment', label: 'Order Debits' },
    { id: 'order_refund', label: 'Refunds' },
    { id: 'bonus', label: 'Bonuses & Adjustments' },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Wallet Statement & Ledger</h1>
          <p className="text-sm text-slate-400 mt-1">
            Complete audit trail of every credit, debit, deposit, and refund on your account
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/deposit">
            <Button variant="primary" size="md" leftIcon={<PlusCircle className="w-4 h-4" />}>
              Deposit Funds
            </Button>
          </Link>
        </div>
      </div>

      {/* Balance Summary Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Available Balance
            </span>
            <span className="text-2xl font-extrabold text-emerald-400 mt-1 block">
              KES {Number(user?.balance || 0).toFixed(2)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
        </Card>

        <Card className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Total Deposits Made
            </span>
            <span className="text-2xl font-extrabold text-white mt-1 block">
              KES{' '}
              {transactions
                .filter((t) => t.type === 'deposit' && t.status === 'completed')
                .reduce((acc, t) => acc + Number(t.amount), 0)
                .toFixed(2)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </Card>

        <Card className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Total Ledger Entries
            </span>
            <span className="text-2xl font-extrabold text-purple-400 mt-1 block">
              {transactions.length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {typeTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedType(tab.id)}
            className={`px-4 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all ${
              selectedType === tab.id
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-sm'
                : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Transactions Table */}
      <Card title="Financial Statement Log" subtitle="Double-entry verified records with balance history">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-3" />
            <span className="text-xs text-slate-400">Loading ledger records...</span>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Wallet className="w-10 h-10 text-slate-600 mx-auto" />
            <h4 className="text-sm font-semibold text-white">No transactions recorded</h4>
            <p className="text-xs text-slate-400">Make your first deposit to fund your SocialPulse wallet.</p>
            <Link to="/deposit" className="inline-block mt-2">
              <Button variant="primary" size="sm">
                Deposit via M-Pesa
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Running Balance</th>
                  <th className="py-3 px-4">Method & Ref</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {transactions.map((tx) => {
                  const isCredit = ['deposit', 'order_refund', 'bonus'].includes(tx.type) && Number(tx.amount) >= 0;
                  return (
                    <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                            isCredit
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {isCredit ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          {tx.type.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-sm">
                        <span className={isCredit ? 'text-emerald-400' : 'text-slate-200'}>
                          {isCredit ? '+' : ''}
                          {tx.currency} {Number(tx.amount).toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-400 text-xs">
                        {Number(tx.balance_before).toFixed(2)} →{' '}
                        <strong className="text-white">{Number(tx.balance_after).toFixed(2)}</strong>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-300">
                          {tx.payment_method}
                        </span>
                        {tx.payment_reference && (
                          <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-400">
                            <span>{tx.payment_reference}</span>
                            <button
                              onClick={() => copyRef(tx.payment_reference!)}
                              className="text-slate-500 hover:text-slate-300"
                            >
                              {copiedRef === tx.payment_reference ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-300 max-w-xs truncate">{tx.description || '—'}</td>

                      <td className="py-3.5 px-4">{getStatusBadge(tx.status)}</td>

                      <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                        {new Date(tx.created_at).toLocaleDateString()}{' '}
                        {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
