import React from 'react';
import { useTenant } from '../../context/TenantContext';
import { Globe, X, Sparkles, Sliders, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const TenantSimulationBanner: React.FC = () => {
  const { isTenantMode, tenant, exitTenantMode } = useTenant();
  const navigate = useNavigate();

  if (!isTenantMode || !tenant) {
    return null;
  }

  const themeColor = tenant.theme_color || '#f59e0b';

  return (
    <div className="relative z-50 bg-gradient-to-r from-[#181a20] via-[#1f232b] to-[#181a20] border-b border-amber-500/40 text-xs px-3 sm:px-6 py-2 shadow-lg shadow-black/40">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Info */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-slate-950 shadow-sm"
            style={{ backgroundColor: themeColor }}
          >
            <Sparkles className="w-3 h-3" />
            Child Panel Mode
          </span>

          <div className="flex items-center gap-1.5 font-bold text-white">
            <span>{tenant.site_name}</span>
            <span className="text-slate-400 font-mono text-[11px] font-normal">
              ({tenant.domain})
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-bold text-[11px]">
            <span>Retail Markup:</span>
            <span className="font-black">+{tenant.default_markup_percent}%</span>
          </div>

          <span className="hidden md:inline text-slate-500 text-[11px]">
            • All service catalog prices now reflect your child panel's retail price
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/services')}
            className="px-2.5 py-1 rounded-lg bg-[#2b303c]/70 hover:bg-[#2b303c] text-slate-200 hover:text-white font-medium text-[11px] transition-colors flex items-center gap-1"
          >
            <span>View Marked-Up Services</span>
          </button>

          <button
            onClick={() => navigate('/child-panel')}
            className="px-2.5 py-1 rounded-lg bg-[#2b303c]/70 hover:bg-[#2b303c] text-slate-200 hover:text-white font-medium text-[11px] transition-colors flex items-center gap-1"
          >
            <Sliders className="w-3 h-3 text-amber-400" />
            <span>Manage Settings</span>
          </button>

          <button
            onClick={exitTenantMode}
            className="px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/30 font-bold text-[11px] transition-colors flex items-center gap-1"
            title="Return to main SocialPulse platform"
          >
            <X className="w-3 h-3" />
            <span>Exit Preview</span>
          </button>
        </div>
      </div>
    </div>
  );
};
