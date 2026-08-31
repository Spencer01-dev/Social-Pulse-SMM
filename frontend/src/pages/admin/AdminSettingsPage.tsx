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
                <span className="font-mono text-slate-300">{settings.providers.delix?.api_url || 'https://delixgainske.com/api/v2'}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">API Key Status</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    settings.providers.delix?.has_api_key
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {settings.providers.delix?.has_api_key ? 'Configured' : 'Mock Mode Active'}
                </span>
              </div>
            </div>
          </Card>

          {/* Payment Gateways Config */}
          <Card title="Payment Gateway Integrations" subtitle="Daraja, OKX, and Binance configurations">
            <div className="space-y-3 mt-1 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Safaricom Daraja (M-Pesa)</span>
                <span className="font-mono text-emerald-400 font-bold">
                  Shortcode {settings.payments.mpesa.shortcode} ({settings.payments.mpesa.environment})
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">OKX Web3 Multi-Chain</span>
                <span className="font-mono text-blue-400 font-semibold">
                  TRC20, TON, Polygon (Active)
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">Binance Pay Merchant</span>
                <span className="font-mono text-amber-400 font-semibold">
                  {settings.payments.binance.has_api_key ? 'Merchant Configured' : 'Simulation Active'}
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
