import React, { useEffect, useState } from 'react';
import {
  Settings,
  ShieldCheck,
  Server,
  Zap,
  CreditCard,
  RefreshCw,
  Sliders,
  DollarSign,
  Lock,
  Globe
} from 'lucide-react';
import { analyticsService, PlatformSettings } from '../../services/analytics';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

export const AdminSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await analyticsService.getSettings();
      setSettings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Platform Configuration & System Health</h1>
          <p className="text-sm text-slate-400 mt-1">
            Core environment parameters, payment gateways, exchange rates, and provider connectivity
          </p>
        </div>

        <Button variant="ghost" size="sm" onClick={fetchSettings} leftIcon={<RefreshCw className="w-4 h-4" />}>
          Refresh
        </Button>
      </div>

      {loading || !settings ? (
        <div className="p-12 flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-3" />
          <span className="text-xs text-slate-400">Loading system configuration...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* General Platform Environment */}
          <Card title="System Environment" subtitle="Core runtime parameters and flags">
            <div className="space-y-3 mt-1 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Project Brand</span>
                <span className="font-bold text-white">{settings.project_name}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Environment</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/20 text-blue-300">
                  {settings.environment}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Primary Currency</span>
                <span className="font-bold text-emerald-400">{settings.primary_currency}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">Sandbox Simulation Mode</span>
                <span className="font-semibold text-purple-300">
                  {settings.use_mock_providers ? 'Active (Testing)' : 'Live Production'}
                </span>
              </div>
            </div>
          </Card>

          {/* External SMM Providers */}
          <Card title="SMM Provider API (Delix Gains KE)" subtitle="Wholesale supplier connectivity">
            <div className="space-y-3 mt-1 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Provider Endpoint</span>
                <span className="font-mono text-slate-300">{settings.providers?.delix?.api_url || 'https://delixgainske.com/api/v2'}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">API Key Status</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    settings.providers?.delix?.has_api_key
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {settings.providers?.delix?.has_api_key ? 'Configured' : 'Mock Mode Active'}
                </span>
              </div>
            </div>
          </Card>

          <Card title="SMM Provider API (SMM Africa)" subtitle="Wholesale supplier connectivity & failover">
            <div className="space-y-3 mt-1 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Provider Endpoint</span>
                <span className="font-mono text-slate-300">{settings.providers?.smm_africa?.api_url || 'https://smm.africa/api/v3'}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">API Key Status</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    settings.providers?.smm_africa?.has_api_key
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {settings.providers?.smm_africa?.has_api_key ? 'Configured' : 'Mock Mode Active'}
                </span>
              </div>
            </div>
          </Card>

          {/* Payment Gateways Config */}
          <Card title="Payment Gateway Integrations" subtitle="Safaricom M-Pesa & Paystack live configurations">
            <div className="space-y-3 mt-1 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <div>
                  <span className="text-slate-300 font-medium block">Safaricom Daraja (M-Pesa STK)</span>
                  <span className="text-[10px] text-slate-500 font-mono">Shortcode: {settings.payments.mpesa.shortcode}</span>
                </div>
                <span className="font-mono text-emerald-400 font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  {settings.payments.mpesa.environment.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <div>
                  <span className="text-slate-300 font-medium block">Paystack Multi-Currency Gateway</span>
                  <span className="text-[10px] text-slate-500 font-mono">KES, NGN, GHS, ZAR, USD</span>
                </div>
                <span className={`font-mono text-xs font-bold ${settings.payments.paystack?.has_secret_key ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {settings.payments.paystack?.has_secret_key ? 'Active (API Live)' : 'Configured'}
                </span>
              </div>
            </div>
          </Card>

          {/* Exchange Rates Engine */}
          <Card title="Currency Engine" subtitle="Base crypto conversion values">
            <div className="space-y-3 mt-1 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Base USD / KES Rate</span>
                <span className="font-bold text-white">1 USD = KES {settings.exchange_rates.default_usd_to_kes}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Base USDT / KES Rate</span>
                <span className="font-bold text-emerald-400">1 USDT = KES {settings.exchange_rates.default_usdt_to_kes}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">Exchange Margin Spread</span>
                <span className="font-semibold text-slate-300">+{settings.exchange_rates.markup_percent}%</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
