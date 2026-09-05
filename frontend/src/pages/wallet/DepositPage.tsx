import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Smartphone,
  Zap,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wallet,
  History,
  ExternalLink,
  CreditCard,
  Building2,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { paymentsService } from '../../services/payments';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

type CountryTab = 'ke' | 'ng' | 'gh' | 'za' | 'cards';

export const DepositPage: React.FC = () => {
  const { user, refreshUserProfile } = useAuth();
  const { convertToKes, formatCurrency } = useCurrency();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab State
  const [activeTab, setActiveTab] = useState<CountryTab>('ke');

  // Unified Verification Modal / State
  const [verifyingExternal, setVerifyingExternal] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean;
    message: string;
    credited?: number;
    currency?: string;
  } | null>(null);

  // General Status & Errors
  const [error, setError] = useState<string | null>(null);

  // ==========================================
  // KENYA (M-PESA) STATE
  // ==========================================
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '');
  const [mpesaAmountKes, setMpesaAmountKes] = useState<number | ''>(500);
  const [submittingMpesa, setSubmittingMpesa] = useState(false);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<'prompted' | 'completed' | 'failed' | null>(null);
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(45);
  const [mpesaGateway, setMpesaGateway] = useState<'palpluss' | 'daraja'>('palpluss');

  // ==========================================
  // NIGERIA STATE (Paystack NGN)
  // ==========================================
  const [ngnAmount, setNgnAmount] = useState<number | ''>(5000);
  const [submittingNgn, setSubmittingNgn] = useState(false);

  // ==========================================
  // GHANA STATE (Paystack GHS)
  // ==========================================
  const [ghsAmount, setGhsAmount] = useState<number | ''>(100);
  const [submittingGhs, setSubmittingGhs] = useState(false);

  // ==========================================
  // SOUTH AFRICA STATE (Paystack ZAR)
  // ==========================================
  const [zarAmount, setZarAmount] = useState<number | ''>(150);
  const [submittingZar, setSubmittingZar] = useState(false);

  // ==========================================
  // GLOBAL CARDS (Paystack USD)
  // ==========================================
  const [cardAmountUsd, setCardAmountUsd] = useState<number | ''>(20);
  const [submittingCard, setSubmittingCard] = useState(false);

  // Simulator Modal State
  const [simulatorModal, setSimulatorModal] = useState<{
    isOpen: boolean;
    txRef: string;
    currency: string;
    amount: number;
  } | null>(null);

  // ==========================================
  // AUTO-HANDLE RETURN CALLBACKS (PAYSTACK)
  // ==========================================
  useEffect(() => {
    const handleUrlCallback = async () => {
      const pstkRef = searchParams.get('reference') || searchParams.get('trxref') || searchParams.get('simulator_pstk');

      if (pstkRef) {
        setVerifyingExternal(true);
        try {
          const res = await paymentsService.verifyPaystack(pstkRef);
          if (res.success) {
            setVerificationResult({
              success: true,
              message: res.message || 'Paystack deposit credited to wallet!',
              credited: res.credited_kes,
              currency: res.currency_paid,
            });
            await refreshUserProfile();
          } else {
            setVerificationResult({
              success: false,
              message: res.message || 'Payment verification failed or pending.',
            });
          }
        } catch (err: any) {
          setVerificationResult({
            success: false,
            message: err.response?.data?.detail || 'Unable to verify Paystack payment.',
          });
        } finally {
          setVerifyingExternal(false);
          setSearchParams({});
        }
      }
    };

    handleUrlCallback();
  }, [searchParams]);

  // ==========================================
  // M-PESA STK POLLING
  // ==========================================
  const handleInitiateMpesa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      setError('Please enter a valid M-Pesa phone number (e.g. 0712345678).');
      return;
    }
    const numAmount = typeof mpesaAmountKes === 'number' ? mpesaAmountKes : 0;
    if (!numAmount || numAmount < 50) {
      setError('Minimum deposit amount is KES 50.00.');
      return;
    }

    setError(null);
    setSubmittingMpesa(true);
    try {
      if (mpesaGateway === 'palpluss') {
        const res = await paymentsService.initiatePalplussSTK({
          phone_number: phoneNumber.trim(),
          amount: numAmount,
        });
        setCheckoutId(res.transaction_id);
      } else {
        const res = await paymentsService.initiateMpesaSTK({
          phone_number: phoneNumber.trim(),
          amount: numAmount,
        });
        setCheckoutId(res.checkout_request_id);
      }

      setPollStatus('prompted');
      setCountdown(45);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to initiate M-Pesa STK Push.';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSubmittingMpesa(false);
    }
  };

  useEffect(() => {
    let interval: any = null;
    if (checkoutId && pollStatus === 'prompted') {
      interval = setInterval(async () => {
        try {
          const statusResp = mpesaGateway === 'palpluss'
            ? await paymentsService.queryPalplussStatus(checkoutId)
            : await paymentsService.queryMpesaStatus(checkoutId);
          if (statusResp.status === 'completed') {
            setPollStatus('completed');
            setReceiptNumber(statusResp.mpesa_receipt || 'Confirmed');
            await refreshUserProfile();
            if (interval) clearInterval(interval);
          } else if (statusResp.status === 'failed') {
            setPollStatus('failed');
            setError('Payment was cancelled or failed on the handset.');
            if (interval) clearInterval(interval);
          }
        } catch (err) {
          // keep polling
        }
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [checkoutId, pollStatus, mpesaGateway]);

  useEffect(() => {
    let timer: any = null;
    if (pollStatus === 'prompted' && countdown > 0) {
      timer = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [pollStatus, countdown]);

  // ==========================================
  // PAYSTACK GENERIC INITIATOR
  // ==========================================
  const initiatePaystackDeposit = async (amount: number, currency: string, setSubmitting: (b: boolean) => void) => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await paymentsService.initiatePaystack({
        amount,
        currency,
        callback_url: window.location.origin + '/wallet/deposit',
      });
      if (res.is_simulator) {
        setSimulatorModal({
          isOpen: true,
          txRef: res.reference,
          currency,
          amount,
        });
      } else if (res.authorization_url) {
        window.location.href = res.authorization_url;
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || `Failed to initiate Paystack checkout for ${currency}.`);
    } finally {
      setSubmitting(false);
    }
  };

  // Nigeria Submit
  const handleInitiateNigeria = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = typeof ngnAmount === 'number' ? ngnAmount : 0;
    if (!numAmount || numAmount < 100) {
      setError('Minimum deposit is ₦ 100.00.');
      return;
    }
    await initiatePaystackDeposit(numAmount, 'NGN', setSubmittingNgn);
  };

  // Ghana Submit
  const handleInitiateGhana = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = typeof ghsAmount === 'number' ? ghsAmount : 0;
    if (!numAmount || numAmount < 5) {
      setError('Minimum deposit is GH₵ 5.00.');
      return;
    }
    await initiatePaystackDeposit(numAmount, 'GHS', setSubmittingGhs);
  };

  // South Africa Submit
  const handleInitiateSouthAfrica = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = typeof zarAmount === 'number' ? zarAmount : 0;
    if (!numAmount || numAmount < 10) {
      setError('Minimum deposit is R 10.00 ZAR.');
      return;
    }
    await initiatePaystackDeposit(numAmount, 'ZAR', setSubmittingZar);
  };

  // Cards (USD) Submit
  const handleInitiateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = typeof cardAmountUsd === 'number' ? cardAmountUsd : 0;
    if (!numAmount || numAmount < 1) {
      setError('Minimum deposit is $1.00 USD.');
      return;
    }
    await initiatePaystackDeposit(numAmount, 'USD', setSubmittingCard);
  };

  // Simulator Confirmation
  const handleConfirmSimulation = async () => {
    if (!simulatorModal) return;
    setVerifyingExternal(true);
    try {
      const res = await paymentsService.verifyPaystack(simulatorModal.txRef);
      setVerificationResult({
        success: res.success,
        message: 'Paystack simulation successful! Wallet credited.',
        credited: res.credited_kes,
        currency: simulatorModal.currency,
      });
      await refreshUserProfile();
    } catch (err: any) {
      setVerificationResult({
        success: false,
        message: err.response?.data?.detail || 'Simulation verification error.',
      });
    } finally {
      setVerifyingExternal(false);
      setSimulatorModal(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Verification Overlay Modal */}
      {verifyingExternal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#1b1f27] border border-amber-500/30 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
            <Loader2 className="w-12 h-12 text-amber-400 animate-spin mx-auto" />
            <h3 className="text-lg font-black text-white">Verifying Paystack Payment...</h3>
            <p className="text-xs text-slate-400">
              Connecting with Paystack secure gateway and crediting your wallet balance in real-time.
            </p>
          </div>
        </div>
      )}

      {/* Simulator Modal */}
      {simulatorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#161a22] border border-amber-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-5 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/20">
              <Zap className="w-7 h-7 fill-amber-400 text-amber-400" />
            </div>
            <div>
              <div className="inline-block px-3 py-1 bg-amber-500/10 text-amber-400 text-[11px] font-extrabold uppercase tracking-wider rounded-full border border-amber-500/20 mb-2">
                Sandbox Simulator
              </div>
              <h3 className="text-xl font-extrabold text-white">
                Simulate Paystack Checkout
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Deposit of <strong className="text-white">{simulatorModal.currency} {simulatorModal.amount.toLocaleString()}</strong>
              </p>
            </div>

            <div className="p-4 bg-[#11141a] rounded-2xl border border-[#2b303c] text-left space-y-2 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Reference:</span>
                <span className="text-amber-400 font-bold">{simulatorModal.txRef}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Est. Wallet Credit:</span>
                <span className="text-emerald-400 font-bold">
                  KES {convertToKes(simulatorModal.amount, simulatorModal.currency as any).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => setSimulatorModal(null)}
                className="w-1/2"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmSimulation}
                className="w-1/2"
                leftIcon={<Sparkles className="w-4 h-4" />}
              >
                Simulate Success
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Verification Result Banner */}
      {verificationResult && (
        <div
          className={`p-4 sm:p-6 rounded-3xl border flex items-start gap-4 ${
            verificationResult.success
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
          }`}
        >
          {verificationResult.success ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <h4 className="font-extrabold text-white text-base">
              {verificationResult.success ? 'Payment Verified & Credited!' : 'Payment Verification Issue'}
            </h4>
            <p className="text-xs mt-1 text-slate-300">{verificationResult.message}</p>
            {verificationResult.credited && (
              <p className="text-xs font-bold text-emerald-400 mt-1">
                + KES {Number(verificationResult.credited).toLocaleString()} credited to your balance.
              </p>
            )}
          </div>
          <button
            onClick={() => setVerificationResult(null)}
            className="text-xs px-3 py-1 rounded-lg bg-black/40 hover:bg-black/60 text-slate-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Hero Wallet Balance Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-[#181a20] p-6 sm:p-8 border border-[#2b303c] shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" />
                SocialPulse Multi-Currency Wallet
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Deposit Funds</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Instant Kenyan Lipa Na M-Pesa STK push & seamless Paystack multi-currency checkout.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-[#12151c]/90 px-5 py-4 rounded-2xl border border-[#2b303c]">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Balance</div>
              <div className="text-xl sm:text-2xl font-black text-amber-400">
                {formatCurrency(Number(user?.balance || 0))}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                ≈ KES {Number(user?.balance || 0).toLocaleString()} Base
              </div>
            </div>
            <Link to="/wallet/ledger">
              <Button variant="ghost" size="sm" leftIcon={<History className="w-3.5 h-3.5" />}>
                Ledger
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Payment Gateway Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
        <button
          onClick={() => { setActiveTab('ke'); setError(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-extrabold text-xs whitespace-nowrap transition-all border ${
            activeTab === 'ke'
              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20 scale-[1.02]'
              : 'bg-[#181c24] hover:bg-[#202530] text-slate-300 border-[#2b303c]'
          }`}
        >
          <span className="text-base">🇰🇪</span>
          <span>Kenya (M-Pesa)</span>
        </button>

        <button
          onClick={() => { setActiveTab('ng'); setError(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-extrabold text-xs whitespace-nowrap transition-all border ${
            activeTab === 'ng'
              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20 scale-[1.02]'
              : 'bg-[#181c24] hover:bg-[#202530] text-slate-300 border-[#2b303c]'
          }`}
        >
          <span className="text-base">🇳🇬</span>
          <span>Nigeria (Paystack / ₦)</span>
        </button>

        <button
          onClick={() => { setActiveTab('gh'); setError(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-extrabold text-xs whitespace-nowrap transition-all border ${
            activeTab === 'gh'
              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20 scale-[1.02]'
              : 'bg-[#181c24] hover:bg-[#202530] text-slate-300 border-[#2b303c]'
          }`}
        >
          <span className="text-base">🇬🇭</span>
          <span>Ghana (Paystack / GH₵)</span>
        </button>

        <button
          onClick={() => { setActiveTab('za'); setError(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-extrabold text-xs whitespace-nowrap transition-all border ${
            activeTab === 'za'
              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20 scale-[1.02]'
              : 'bg-[#181c24] hover:bg-[#202530] text-slate-300 border-[#2b303c]'
          }`}
        >
          <span className="text-base">🇿🇦</span>
          <span>South Africa (Paystack / R)</span>
        </button>

        <button
          onClick={() => { setActiveTab('cards'); setError(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-extrabold text-xs whitespace-nowrap transition-all border ${
            activeTab === 'cards'
              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20 scale-[1.02]'
              : 'bg-[#181c24] hover:bg-[#202530] text-slate-300 border-[#2b303c]'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Global Cards (Paystack / USD $)</span>
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: KENYA (LIPA NA M-PESA) */}
      {/* ========================================================================= */}
      {activeTab === 'ke' && (
        <Card className="p-6 sm:p-8 bg-[#181c24] border-[#2b303c]">
          <div className="max-w-xl mx-auto space-y-6">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-xl font-black mb-3">
                🇰🇪
              </div>
              <h2 className="text-xl font-black text-white">Lipa Na M-Pesa STK Push</h2>
              <p className="text-xs text-slate-400">
                Enter your Safaricom mobile number and amount. You will receive an instant PIN prompt on your phone.
              </p>
            </div>

            {pollStatus === 'completed' ? (
              <div className="p-6 rounded-3xl bg-emerald-950/30 border border-emerald-500/40 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h3 className="text-lg font-black text-white">Payment Received!</h3>
                <p className="text-xs text-slate-300 font-mono">Receipt: {receiptNumber}</p>
                <p className="text-xs text-emerald-400 font-bold">Your wallet balance has been updated instantly.</p>
                <Button
                  variant="primary"
                  onClick={() => {
                    setPollStatus(null);
                    setCheckoutId(null);
                  }}
                >
                  Make Another Deposit
                </Button>
              </div>
            ) : pollStatus === 'prompted' ? (
              <div className="p-6 rounded-3xl bg-amber-950/20 border border-amber-500/30 text-center space-y-4 animate-pulse">
                <Clock className="w-10 h-10 text-amber-400 mx-auto animate-spin" />
                <div>
                  <h3 className="text-base font-extrabold text-white">Check Your Phone</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Enter your M-Pesa PIN on your phone to complete deposit of KES {mpesaAmountKes}.
                  </p>
                </div>
                <div className="text-xs font-mono text-amber-400">Auto-polling status... ({countdown}s)</div>
              </div>
            ) : (
              <form onSubmit={handleInitiateMpesa} className="space-y-5">
                <div className="p-3 bg-[#11141a] rounded-2xl border border-[#2b303c] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-slate-300 uppercase tracking-wider">Gateway Route</span>
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">
                      PalPluss Live API
                    </span>
                  </div>
                  <div className="w-full">
                    <div className="px-3.5 py-2.5 rounded-xl text-xs font-bold border bg-amber-500/15 text-amber-300 border-amber-500/40 flex items-center justify-between">
                      <span className="flex items-center gap-2">⚡ PalPluss Live Lipa Na M-Pesa</span>
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                        Active
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-2">
                    M-Pesa Mobile Number
                  </label>
                  <input
                    type="tel"
                    placeholder="0712345678 or 254712345678"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-4 py-3 bg-[#11141a] border border-[#2b303c] rounded-2xl text-white text-sm font-mono focus:border-amber-400 focus:outline-none transition-colors"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-2">
                    Deposit Amount (KES)
                  </label>
                  <input
                    type="number"
                    min="50"
                    placeholder="e.g. 50"
                    value={mpesaAmountKes}
                    onChange={(e) => setMpesaAmountKes(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-4 py-3 bg-[#11141a] border border-[#2b303c] rounded-2xl text-white text-sm font-bold focus:border-amber-400 focus:outline-none transition-colors"
                    required
                  />

                  {/* Presets */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {[50, 100, 200, 500, 1000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setMpesaAmountKes(preset)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all ${
                          mpesaAmountKes === preset
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                            : 'bg-[#11141a] hover:bg-[#1a1e27] text-slate-400 border-[#2b303c]'
                        }`}
                      >
                        KES {preset.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full py-3.5 font-black text-sm"
                  disabled={submittingMpesa}
                  leftIcon={submittingMpesa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                >
                  {submittingMpesa ? 'Sending STK Push...' : `Send STK Push (KES ${mpesaAmountKes || 0})`}
                </Button>
              </form>
            )}
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: NIGERIA (PAYSTACK NGN) */}
      {/* ========================================================================= */}
      {activeTab === 'ng' && (
        <Card className="p-6 sm:p-8 bg-[#181c24] border-[#2b303c]">
          <div className="max-w-xl mx-auto space-y-6">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-xl font-black mb-3">
                🇳🇬
              </div>
              <h2 className="text-xl font-black text-white">Nigeria Paystack Checkout</h2>
              <p className="text-xs text-slate-400">
                Pay via Instant Bank Transfer, USSD, Apple Pay, or Nigerian Verve/Mastercard/Visa.
              </p>
            </div>

            <form onSubmit={handleInitiateNigeria} className="space-y-5">
              <div>
                <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-2">
                  Deposit Amount (NGN ₦)
                </label>
                <input
                  type="number"
                  min="100"
                  placeholder="e.g. 5000"
                  value={ngnAmount}
                  onChange={(e) => setNgnAmount(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-4 py-3 bg-[#11141a] border border-[#2b303c] rounded-2xl text-white text-sm font-bold focus:border-amber-400 focus:outline-none transition-colors"
                  required
                />

                {/* Presets */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {[2000, 5000, 10000, 25000, 50000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNgnAmount(preset)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all ${
                        ngnAmount === preset
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-[#11141a] hover:bg-[#1a1e27] text-slate-400 border-[#2b303c]'
                      }`}
                    >
                      ₦ {preset.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conversion Preview */}
              <div className="p-4 bg-[#11141a] rounded-2xl border border-[#2b303c] flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Estimated Wallet Credit:</span>
                <span className="text-emerald-400 font-mono font-bold text-sm">
                  ≈ KES {convertToKes(Number(ngnAmount || 0), 'NGN').toLocaleString()}
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full py-3.5 font-black text-sm"
                disabled={submittingNgn}
                leftIcon={submittingNgn ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              >
                {submittingNgn ? 'Connecting Paystack...' : `Proceed to Paystack (₦ ${Number(ngnAmount || 0).toLocaleString()})`}
              </Button>
            </form>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: GHANA (PAYSTACK GHS) */}
      {/* ========================================================================= */}
      {activeTab === 'gh' && (
        <Card className="p-6 sm:p-8 bg-[#181c24] border-[#2b303c]">
          <div className="max-w-xl mx-auto space-y-6">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-xl font-black mb-3">
                🇬🇭
              </div>
              <h2 className="text-xl font-black text-white">Ghana Paystack Checkout (GHS)</h2>
              <p className="text-xs text-slate-400">
                Instant checkout for MTN Mobile Money, Vodafone Cash, AirtelTigo, and local cards.
              </p>
            </div>

            <form onSubmit={handleInitiateGhana} className="space-y-5">
              <div>
                <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-2">
                  Deposit Amount (GHS GH₵)
                </label>
                <input
                  type="number"
                  min="5"
                  placeholder="e.g. 100"
                  value={ghsAmount}
                  onChange={(e) => setGhsAmount(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-4 py-3 bg-[#11141a] border border-[#2b303c] rounded-2xl text-white text-sm font-bold focus:border-amber-400 focus:outline-none transition-colors"
                  required
                />

                <div className="flex flex-wrap gap-2 mt-3">
                  {[50, 100, 250, 500, 1000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setGhsAmount(preset)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all ${
                        ghsAmount === preset
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-[#11141a] hover:bg-[#1a1e27] text-slate-400 border-[#2b303c]'
                      }`}
                    >
                      GH₵ {preset.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conversion Preview */}
              <div className="p-4 bg-[#11141a] rounded-2xl border border-[#2b303c] flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Estimated Wallet Credit:</span>
                <span className="text-emerald-400 font-mono font-bold text-sm">
                  ≈ KES {convertToKes(Number(ghsAmount || 0), 'GHS').toLocaleString()}
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full py-3.5 font-black text-sm"
                disabled={submittingGhs}
                leftIcon={submittingGhs ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              >
                {submittingGhs ? 'Generating Link...' : `Deposit GH₵ ${Number(ghsAmount || 0).toLocaleString()}`}
              </Button>
            </form>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: SOUTH AFRICA (PAYSTACK ZAR) */}
      {/* ========================================================================= */}
      {activeTab === 'za' && (
        <Card className="p-6 sm:p-8 bg-[#181c24] border-[#2b303c]">
          <div className="max-w-xl mx-auto space-y-6">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto text-xl font-black mb-3">
                🇿🇦
              </div>
              <h2 className="text-xl font-black text-white">South Africa Paystack Checkout (ZAR)</h2>
              <p className="text-xs text-slate-400">
                Supports South African Cards, EFT and local payment methods.
              </p>
            </div>

            <form onSubmit={handleInitiateSouthAfrica} className="space-y-5">
              <div>
                <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-2">
                  Deposit Amount (ZAR R)
                </label>
                <input
                  type="number"
                  min="10"
                  placeholder="e.g. 150"
                  value={zarAmount}
                  onChange={(e) => setZarAmount(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-4 py-3 bg-[#11141a] border border-[#2b303c] rounded-2xl text-white text-sm font-bold focus:border-amber-400 focus:outline-none transition-colors"
                  required
                />

                <div className="flex flex-wrap gap-2 mt-3">
                  {[50, 100, 250, 500, 1000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setZarAmount(preset)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all ${
                        zarAmount === preset
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-[#11141a] hover:bg-[#1a1e27] text-slate-400 border-[#2b303c]'
                      }`}
                    >
                      R {preset.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conversion Preview */}
              <div className="p-4 bg-[#11141a] rounded-2xl border border-[#2b303c] flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Estimated Wallet Credit:</span>
                <span className="text-emerald-400 font-mono font-bold text-sm">
                  ≈ KES {convertToKes(Number(zarAmount || 0), 'ZAR').toLocaleString()}
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full py-3.5 font-black text-sm"
                disabled={submittingZar}
                leftIcon={submittingZar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
              >
                {submittingZar ? 'Opening Paystack...' : `Deposit R ${Number(zarAmount || 0).toLocaleString()}`}
              </Button>
            </form>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: GLOBAL CARDS (USD) */}
      {/* ========================================================================= */}
      {activeTab === 'cards' && (
        <Card className="p-6 sm:p-8 bg-[#181c24] border-[#2b303c]">
          <div className="max-w-xl mx-auto space-y-6">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto text-xl font-black mb-3">
                💳
              </div>
              <h2 className="text-xl font-black text-white">Global Visa / Mastercard via Paystack</h2>
              <p className="text-xs text-slate-400">
                Deposit internationally using any Debit or Credit card in USD ($).
              </p>
            </div>

            <form onSubmit={handleInitiateCard} className="space-y-5">
              <div>
                <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-2">
                  Deposit Amount (USD $)
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 20"
                  value={cardAmountUsd}
                  onChange={(e) => setCardAmountUsd(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-4 py-3 bg-[#11141a] border border-[#2b303c] rounded-2xl text-white text-sm font-bold focus:border-amber-400 focus:outline-none transition-colors"
                  required
                />

                <div className="flex flex-wrap gap-2 mt-3">
                  {[10, 25, 50, 100, 250].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCardAmountUsd(preset)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all ${
                        cardAmountUsd === preset
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-[#11141a] hover:bg-[#1a1e27] text-slate-400 border-[#2b303c]'
                      }`}
                    >
                      ${preset} USD
                    </button>
                  ))}
                </div>
              </div>

              {/* Conversion Preview */}
              <div className="p-4 bg-[#11141a] rounded-2xl border border-[#2b303c] flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Estimated Wallet Credit:</span>
                <span className="text-emerald-400 font-mono font-bold text-sm">
                  ≈ KES {convertToKes(Number(cardAmountUsd || 0), 'USD').toLocaleString()}
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full py-3.5 font-black text-sm"
                disabled={submittingCard}
                leftIcon={submittingCard ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              >
                {submittingCard ? 'Launching Paystack...' : `Pay $${Number(cardAmountUsd || 0).toLocaleString()} USD`}
              </Button>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
};
