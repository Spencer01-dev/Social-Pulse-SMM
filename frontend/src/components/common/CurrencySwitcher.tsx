import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Globe } from 'lucide-react';
import { useCurrency } from '../../context/CurrencyContext';
import { SupportedCurrency } from '../../types';

export const CurrencySwitcher: React.FC = () => {
  const { currency, setCurrency, currencies, currentMetadata } = useCurrency();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currencyList = Object.values(currencies);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#1b1f27] hover:bg-[#252a35] text-slate-200 hover:text-white rounded-xl border border-[#2b303c] transition-all text-xs font-bold shadow-sm active:scale-95 group"
        aria-label="Select Currency"
      >
        <span className="text-base leading-none select-none">{currentMetadata.flag}</span>
        <span className="font-extrabold tracking-wide text-amber-400 group-hover:text-amber-300">
          {currentMetadata.code}
        </span>
        <span className="text-slate-400 text-[11px] font-medium hidden sm:inline">
          ({currentMetadata.symbol})
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-amber-400' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-[#15181e]/95 backdrop-blur-xl border border-[#2b303c] rounded-2xl shadow-2xl z-50 p-2 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-2 border-b border-[#222630] flex items-center justify-between mb-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-amber-400" />
              Pan-African & Global Currencies
            </span>
            <span className="text-[10px] text-amber-400/80 font-mono">Live Rates</span>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {currencyList.map((item) => {
              const isSelected = item.code === currency;
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    setCurrency(item.code as SupportedCurrency);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
                    isSelected
                      ? 'bg-amber-500/15 border border-amber-500/30 text-white'
                      : 'hover:bg-[#1e232d] text-slate-300 hover:text-white border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl select-none">{item.flag}</span>
                    <div>
                      <div className="flex items-center gap-1.5 leading-tight">
                        <span className="text-xs font-bold text-white">{item.code}</span>
                        <span className="text-[11px] text-amber-400/90 font-semibold">({item.symbol})</span>
                      </div>
                      <div className="text-[11px] text-slate-400 leading-tight truncate max-w-[140px]">
                        {item.name}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.code !== 'KES' && (
                      <span className="text-[10px] text-slate-400 font-mono bg-[#11141a] px-1.5 py-0.5 rounded border border-[#2b303c]">
                        {item.rate_per_kes} {item.code}/KES
                      </span>
                    )}
                    {isSelected && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
