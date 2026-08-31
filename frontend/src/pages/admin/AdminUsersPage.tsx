import React, { useEffect, useState } from 'react';
import {
  Users,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Edit2,
  DollarSign,
  CheckCircle2,
  Key,
  AlertCircle,
  Clock,
  MoreVertical
} from 'lucide-react';
import { analyticsService } from '../../services/analytics';
import { paymentsService } from '../../services/payments';
import { Role, User } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

export const AdminUsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role | 'all'>('all');

  // Role Edit Modal
  const [editUserRole, setEditUserRole] = useState<User | null>(null);
  const [newRole, setNewRole] = useState<Role>('customer');
  const [savingRole, setSavingRole] = useState(false);

  // Balance Adjust Modal
  const [adjustUser, setAdjustUser] = useState<User | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<string>('1000');
  const [adjustReason, setAdjustReason] = useState<string>('Admin credit adjustment');
  const [savingAdjust, setSavingAdjust] = useState(false);

  const [notification, setNotification] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await analyticsService.getUsers({
        role: selectedRole !== 'all' ? selectedRole : undefined,
        search: search || undefined,
      });
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [selectedRole]);

  const handleToggleStatus = async (user: User) => {
    try {
      const updated = await analyticsService.updateUserStatus(user.id, !user.is_active);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
      setNotification(`User ${user.username} status updated to ${updated.is_active ? 'Active' : 'Deactivated'}.`);
    } catch (err: any) {
      setNotification(`Error: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUserRole) return;
    setSavingRole(true);
    try {
      const updated = await analyticsService.updateUserRole(editUserRole.id, newRole);
      setUsers((prev) => prev.map((u) => (u.id === editUserRole.id ? updated : u)));
      setNotification(`User ${editUserRole.username} role updated to ${newRole.toUpperCase()}.`);
      setEditUserRole(null);
    } catch (err: any) {
      setNotification(`Error: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSavingRole(false);
    }
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustUser || !adjustAmount) return;
    setSavingAdjust(true);
    try {
      await paymentsService.adjustUserBalance({
        user_id: adjustUser.id,
        amount: Number(adjustAmount),
        reason: adjustReason,
      });
      await fetchUsers();
      setNotification(`Wallet of ${adjustUser.username} adjusted by KES ${adjustAmount}.`);
      setAdjustUser(null);
    } catch (err: any) {
      setNotification(`Error: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSavingAdjust(false);
    }
  };

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'super_admin':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
            Super Admin
          </span>
        );
      case 'admin':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
            Admin
          </span>
        );
      case 'reseller':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
            Reseller
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-800 text-slate-300">
            Customer
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Global User Management</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage user roles, grant reseller privileges, adjust wallet credits, and audit accounts
          </p>
        </div>
      </div>

      {notification && (
        <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center justify-between animate-fadeIn">
          <span>{notification}</span>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative max-w-sm w-full">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
            placeholder="Search by username, email, name..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value as Role | 'all')}
          className="px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-xs"
        >
          <option value="all">All Roles</option>
          <option value="customer">Customer</option>
          <option value="reseller">Reseller</option>
          <option value="admin">Admin</option>
          <option value="super_admin">Super Admin</option>
        </select>
      </div>

      {/* Users Directory Table */}
      <Card title="User Accounts Directory" subtitle={`Showing ${users.length} registered accounts`}>
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-3" />
            <span className="text-xs text-slate-400">Fetching user profiles...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Wallet Balance</th>
                  <th className="py-3 px-4">API Key</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Joined</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-white block">{u.username}</span>
                      <span className="text-[11px] text-slate-400">{u.email}</span>
                    </td>
                    <td className="py-3.5 px-4">{getRoleBadge(u.role)}</td>
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">
                      {u.currency} {Number(u.balance).toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-400">
                      {u.api_key ? (
                        <span className="text-indigo-300 flex items-center gap-1">
                          <Key className="w-3 h-3" /> Enabled
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-colors ${
                          u.is_active
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {u.is_active ? 'Active' : 'Deactivated'}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setAdjustUser(u);
                            setAdjustAmount('1000');
                          }}
                          className="p-1.5 rounded-lg text-emerald-400 hover:text-white hover:bg-emerald-600/20 transition-colors"
                          title="Adjust Balance"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setEditUserRole(u);
                            setNewRole(u.role);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                          title="Change Role"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Role Changer Modal */}
      {editUserRole && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-card rounded-3xl p-6 border border-slate-800 relative">
            <h3 className="text-lg font-bold text-white mb-1">
              Modify Role for {editUserRole.username}
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              Change account permission level and access rights.
            </p>

            <form onSubmit={handleSaveRole} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Select Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm"
                >
                  <option value="customer">Customer (Standard User)</option>
                  <option value="reseller">Reseller (API Access & Wholesale)</option>
                  <option value="admin">Admin (Fulfillment & Service Management)</option>
                  <option value="super_admin">Super Admin (Full Root Access)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <Button type="button" variant="ghost" size="md" onClick={() => setEditUserRole(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="md" isLoading={savingRole}>
                  Save Role
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Balance Adjustment Modal */}
      {adjustUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-card rounded-3xl p-6 border border-slate-800 relative">
            <h3 className="text-lg font-bold text-white mb-1">
              Adjust Balance for {adjustUser.username}
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              Current balance: <strong className="text-emerald-400">KES {Number(adjustUser.balance).toFixed(2)}</strong>
            </p>

            <form onSubmit={handleSaveAdjustment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Adjustment Amount (KES) - positive to credit, negative to debit
                </label>
                <input
                  type="number"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="1000"
                  step="0.01"
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Audit Reason</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Reason for adjustment (e.g. manual top up, bonus)"
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <Button type="button" variant="ghost" size="md" onClick={() => setAdjustUser(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="md" isLoading={savingAdjust}>
                  Apply Adjustment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
