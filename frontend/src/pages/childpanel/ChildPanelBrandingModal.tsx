import React, { useState } from 'react';
import { ChildPanelData, childPanelService } from '../../services/childPanels';
import { useTenant } from '../../context/TenantContext';
import { Button } from '../../components/common/Button';
import { X, Sparkles, Sliders, Check, Palette, DollarSign, Phone, Mail, HelpCircle, Image as ImageIcon, Upload, Trash2 } from 'lucide-react';

interface ChildPanelBrandingModalProps {
  panel: ChildPanelData;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (updatedPanel: ChildPanelData) => void;
}

const COLOR_PRESETS = [
  { name: 'Amber Gold', hex: '#f59e0b' },
  { name: 'Emerald Mint', hex: '#10b981' },
  { name: 'Cyan Tech', hex: '#06b6d4' },
  { name: 'Royal Purple', hex: '#8b5cf6' },
  { name: 'Neon Rose', hex: '#f43f5e' },
  { name: 'Sunset Orange', hex: '#f97316' },
];

export const ChildPanelBrandingModal: React.FC<ChildPanelBrandingModalProps> = ({
  panel,
  isOpen,
  onClose,
  onUpdated,
}) => {
  const { enterTenantMode, tenant: activeTenant, isTenantMode } = useTenant();
  const existing = panel.branding_json || {};

  const [siteName, setSiteName] = useState<string>(
    existing.site_name || `${panel.domain.split('.')[0].toUpperCase()} SMM`
  );
  const [tagline, setTagline] = useState<string>(
    existing.tagline || 'Premium Social Media Growth & Marketing'
  );
  const [themeColor, setThemeColor] = useState<string>(existing.theme_color || '#f59e0b');
  const [markupPercent, setMarkupPercent] = useState<number>(
    existing.default_markup_percent !== undefined ? existing.default_markup_percent : 0
  );
  const [contactEmail, setContactEmail] = useState<string>(
    existing.contact_email || `support@${panel.domain}`
  );
  const [whatsappSupport, setWhatsappSupport] = useState<string>(
    existing.whatsapp_support || ''
  );
  const [logoUrl, setLogoUrl] = useState<string>(existing.logo_url || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Wholesale calculation demonstration
  const exampleWholesale = 100;
  const exampleRetail = Math.round(exampleWholesale * (1 + markupPercent / 100));
  const exampleProfit = exampleRetail - exampleWholesale;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Logo file size must be less than 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoUrl(reader.result);
        setErrorMsg(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const updated = await childPanelService.updateBranding(panel.id, {
        site_name: siteName.trim(),
        tagline: tagline.trim(),
        logo_url: logoUrl.trim() || null,
        theme_color: themeColor,
        default_markup_percent: Number(markupPercent),
        contact_email: contactEmail.trim(),
        whatsapp_support: whatsappSupport.trim() || null,
      });
      setSuccessMsg('Branding & markup settings updated successfully!');
      onUpdated(updated);
      if (isTenantMode && activeTenant?.domain === panel.domain) {
        await enterTenantMode(panel.domain);
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.detail || 'Failed to update branding settings. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl bg-[#181a20] border border-[#2b303c] rounded-2xl shadow-2xl p-6 space-y-6 my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#2b303c] pb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-950 font-black shadow-md"
              style={{ backgroundColor: themeColor }}
            >
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                Child Panel Customization
              </h2>
              <p className="text-xs text-slate-400 font-mono">{panel.domain}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#222630] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4" />
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          {/* Site Name & Tagline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Panel Brand Name
              </label>
              <input
                type="text"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="e.g. Spencer SMM Pro"
                required
                className="w-full bg-[#121418] border border-[#2b303c] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Tagline</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. #1 SMM Reseller in Kenya"
                className="w-full bg-[#121418] border border-[#2b303c] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Custom Logo Upload & URL Section */}
          <div className="p-4 rounded-xl bg-[#121418] border border-[#2b303c] space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                Child Panel Custom Logo
              </label>
              <span className="text-[10px] text-slate-400">PNG, SVG, JPG, WEBP (Max 2MB)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Paste Image URL:</label>
                  <input
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="w-full bg-[#181a20] border border-[#2b303c] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500">OR</span>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#222630] hover:bg-[#2b303c] border border-slate-700/60 text-xs font-bold text-slate-200 transition-colors">
                    <Upload className="w-3.5 h-3.5 text-amber-400" />
                    Upload Image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 font-semibold px-2 py-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Live Logo Preview Box */}
              <div className="h-24 rounded-xl bg-[#181a20] border border-dashed border-[#2b303c] p-3 flex flex-col items-center justify-center relative overflow-hidden">
                {logoUrl ? (
                  <div className="flex flex-col items-center gap-1.5 max-w-full">
                    <img
                      src={logoUrl}
                      alt="Logo Preview"
                      className="max-h-12 max-w-[150px] object-contain"
                      onError={() => setErrorMsg('Could not load image from the provided URL/file.')}
                    />
                    <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                      <Check className="w-3 h-3" /> Logo Preview
                    </span>
                  </div>
                ) : (
                  <div className="text-center text-slate-500">
                    <ImageIcon className="w-5 h-5 mx-auto mb-1 opacity-40" />
                    <span className="text-[11px] block font-medium">No logo uploaded</span>
                    <span className="text-[9px] text-slate-600">Default brand icon will be shown</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Theme Accent Color */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-amber-400" />
              Theme Accent Color
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  onClick={() => setThemeColor(preset.hex)}
                  className={`h-9 rounded-xl flex items-center justify-center transition-all border ${
                    themeColor === preset.hex
                      ? 'border-white scale-105 shadow-md shadow-white/10'
                      : 'border-transparent opacity-75 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: preset.hex }}
                  title={preset.name}
                >
                  {themeColor === preset.hex && <Check className="w-4 h-4 text-slate-950 font-black" />}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Custom Hex:</span>
              <input
                type="text"
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value)}
                className="w-28 bg-[#121418] border border-[#2b303c] rounded-lg px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Markup & Profit Model */}
          <div className="p-4 rounded-xl bg-[#121418] border border-[#2b303c] space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                Default Retail Markup Percentage
              </label>
              <span className="text-xs font-black text-emerald-400 font-mono">
                +{markupPercent}% Markup
              </span>
            </div>

            <input
              type="range"
              min="0"
              max="500"
              step="5"
              value={markupPercent}
              onChange={(e) => setMarkupPercent(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />

            {/* Live Profit Preview Card */}
            <div className="p-3 rounded-lg bg-[#181a20] border border-[#222630] text-xs space-y-1">
              <div className="text-[11px] text-slate-400 uppercase tracking-wider font-bold">
                Live Profit Calculation Example
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>SocialPulse Base Price:</span>
                <span className="font-mono text-slate-400">KES {exampleWholesale.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-white font-bold">
                <span>Your Customer Pays:</span>
                <span className="font-mono text-amber-400">KES {exampleRetail.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-emerald-400 font-black border-t border-[#222630] pt-1">
                <span>Your Net Margin / Profit:</span>
                <span className="font-mono">+KES {exampleProfit.toFixed(2)} ({markupPercent}%)</span>
              </div>
            </div>
          </div>

          {/* Contact Support */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-blue-400" />
                Support Contact Email
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="support@yourpanel.com"
                className="w-full bg-[#121418] border border-[#2b303c] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                Support WhatsApp Number
              </label>
              <input
                type="text"
                value={whatsappSupport}
                onChange={(e) => setWhatsappSupport(e.target.value)}
                placeholder="+254712345678"
                className="w-full bg-[#121418] border border-[#2b303c] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#2b303c]">
            <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              leftIcon={<Sparkles className="w-4 h-4" />}
            >
              Save Branding & Markup
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
