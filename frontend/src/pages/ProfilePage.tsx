import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  User as UserIcon,
  Mail,
  Phone,
  ShieldCheck,
  Calendar,
  Key,
  Copy,
  Check,
  AlertCircle,
  Lock,
  Wallet,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/auth';
import { resellerService } from '../services/reseller';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';

export const ProfilePage: React.FC = () => {
  const { user, refreshUserProfile } = useAuth();

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '');
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [copiedKey, setCopiedKey] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingProfile(true);
    setProfileSuccess(false);
    try {
      await authService.updateProfile({
        full_name: fullName,
        phone_number: phoneNumber,
      });
      await refreshUserProfile();
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    setUpdatingPassword(true);
    try {
      await authService.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 4000);
    } catch (err: any) {
      setPasswordError(err.response?.data?.detail || 'Failed to update password');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleGenerateKey = async () => {
    setGeneratingKey(true);
    try {
      await resellerService.generateApiKey();
      await refreshUserProfile();
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingKey(false);
    }
  };

  const copyApiKey = () => {
    if (user?.api_key) {
      navigator.clipboard.writeText(user.api_key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Account Profile & Security</h1>
        <p className="text-sm text-slate-400 mt-1">
          Manage your personal details, credentials, and Reseller API keys
        </p>
      </div>

      {/* Account Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-lg">
            {user?.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <span className="text-xs text-slate-400 uppercase font-semibold">Account</span>
            <h4 className="text-base font-bold text-white leading-snug">@{user?.username}</h4>
            <span className="inline-block mt-0.5 px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-blue-500/20 text-blue-300">
              {user?.role}
            </span>
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 uppercase font-semibold">Wallet Balance</span>
            <h4 className="text-lg font-extrabold text-emerald-400 leading-snug">
              {user?.currency} {Number(user?.balance).toFixed(2)}
            </h4>
            <Link to="/deposit" className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold">
              + Add Funds
            </Link>
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-600/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 uppercase font-semibold">Verification</span>
            <h4 className="text-base font-bold text-purple-300 leading-snug">
              {user?.is_verified ? 'Verified' : 'Standard'}
            </h4>
            <span className="text-[11px] text-slate-400">Level 1 Reseller</span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal Details Form */}
        <Card title="Personal Details" subtitle="Update your contact information">
          {profileSuccess && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4" /> Profile updated successfully!
            </div>
          )}

          <form onSubmit={handleProfileUpdate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-800/80 rounded-xl text-slate-400 text-sm cursor-not-allowed"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Email cannot be changed directly</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Phone Number</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+254 700 000 000"
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" variant="primary" size="md" isLoading={updatingProfile}>
                Save Profile Changes
              </Button>
            </div>
          </form>
        </Card>

        {/* Reseller API Key Box */}
        <Card title="Reseller API Credentials" subtitle="Access the standard SMM API programmatically">
          <div className="space-y-4">
            <p className="text-xs text-slate-400 leading-relaxed">
              Use this secret API key to automate orders through the SocialPulse Reseller API v2 standard.
            </p>

            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-emerald-400 font-bold truncate">
                {user?.api_key || 'No API key generated yet'}
              </span>
              {user?.api_key && (
                <button
                  onClick={copyApiKey}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex-shrink-0"
                  title="Copy API Key"
                >
                  {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGenerateKey}
                isLoading={generatingKey}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                {user?.api_key ? 'Regenerate API Key' : 'Generate API Key'}
              </Button>

              <Link
                to="/api-docs"
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
              >
                <span>View API Docs</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
              <p className="font-semibold mb-0.5">🔒 Keep your API key secure</p>
              <p className="text-[11px] text-blue-300/80">Never share your API key in frontend apps or public repos.</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Password Change Section */}
      <Card title="Security & Password" subtitle="Change your login password" className="max-w-2xl">
        {passwordError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{passwordError}</span>
          </div>
        )}
        {passwordSuccess && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4" /> Password changed successfully!
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                required
              />
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" variant="secondary" size="md" isLoading={updatingPassword}>
              Update Password
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
