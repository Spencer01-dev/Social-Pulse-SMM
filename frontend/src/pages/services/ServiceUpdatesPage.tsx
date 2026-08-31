import React, { useState } from 'react';
import { Bell, ArrowUpRight, ArrowDownRight, PlusCircle, CheckCircle, Search, Filter } from 'lucide-react';
import { Card } from '../../components/common/Card';

interface ServiceUpdateItem {
  id: string;
  service_name: string;
  platform: string;
  update_type: 'new' | 'price_decrease' | 'price_increase' | 'enabled';
  previous_rate?: string;
  new_rate?: string;
  date: string;
}

export const ServiceUpdatesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const updates: ServiceUpdateItem[] = [
    {
      id: '1',
      service_name: 'Instagram Real Active Followers [HQ | Instant | 30 Days Refill]',
      platform: 'Instagram',
      update_type: 'new',
      new_rate: 'Ksh 216.00 / 1k',
      date: 'Today, 10:45 AM',
    },
    {
      id: '2',
      service_name: 'TikTok Video Views [Super Instant | FYP Boost]',
      platform: 'TikTok',
      update_type: 'price_decrease',
      previous_rate: 'Ksh 24.00',
      new_rate: 'Ksh 18.00 / 1k',
      date: 'Today, 08:30 AM',
    },
    {
      id: '3',
      service_name: 'YouTube Subscribers [Non-Drop | Organic Speed]',
      platform: 'YouTube',
      update_type: 'enabled',
      new_rate: 'Ksh 1,170.00 / 1k',
      date: 'Yesterday',
    },
    {
      id: '4',
      service_name: 'Facebook Page Followers & Likes [Real Worldwide | Fast]',
      platform: 'Facebook',
      update_type: 'new',
      new_rate: 'Ksh 324.00 / 1k',
      date: 'Yesterday',
    },
    {
      id: '5',
      service_name: 'Instagram Super Fast Likes [Instant Start | Non-Drop]',
      platform: 'Instagram',
      update_type: 'price_decrease',
      previous_rate: 'Ksh 95.00',
      new_rate: 'Ksh 81.00 / 1k',
      date: '2 days ago',
    },
  ];

  const filtered = updates.filter(
    (u) =>
      u.service_name.toLowerCase().includes(search.toLowerCase()) ||
      u.platform.toLowerCase().includes(search.toLowerCase())
  );

  const getBadge = (type: ServiceUpdateItem['update_type']) => {
    switch (type) {
      case 'new':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-[#f59e0b]/20 text-[#f59e0b] border border-amber-500/30 flex items-center gap-1">
            <PlusCircle className="w-3 h-3" /> New Service
          </span>
        );
      case 'price_decrease':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
            <ArrowDownRight className="w-3 h-3" /> Price Reduced
          </span>
        );
      case 'price_increase':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" /> Price Increase
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Service Updated
          </span>
        );
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Services Updates & Changelog</h1>
        <p className="text-xs text-slate-400 mt-1">
          Live stream of new service additions, price reductions, and platform status changes
        </p>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm w-full">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search service updates..."
            className="w-full pl-9 pr-4 py-2.5 bg-[#181a20] border border-[#2b303c] rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-[#f59e0b]"
          />
        </div>
      </div>

      {/* Updates List */}
      <div className="space-y-3">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="p-4 rounded-2xl bg-[#181a20] border border-[#2b303c] flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-amber-500/40 transition-colors"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-[#222630] text-slate-300">
                  {item.platform}
                </span>
                <span className="text-[10px] text-slate-500">{item.date}</span>
              </div>
              <h4 className="text-xs font-bold text-white">{item.service_name}</h4>
              {item.previous_rate && (
                <span className="text-[11px] text-slate-400 line-through mr-2">
                  Old: {item.previous_rate}
                </span>
              )}
              {item.new_rate && (
                <span className="text-xs font-extrabold text-[#f59e0b]">
                  {item.new_rate}
                </span>
              )}
            </div>

            <div>{getBadge(item.update_type)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
