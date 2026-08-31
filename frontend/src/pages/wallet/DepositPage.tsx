import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Smartphone,
  Zap,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  Wallet,
  Coins,
  History,
  Copy,
  Check,
  ExternalLink,
  CreditCard,
  Building2,
  Globe,
  Radio,
  Sparkles,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { paymentsService } from '../../services/payments';
import { cryptoService, CryptoDepositIntent, BinancePayOrder } from '../../services/crypto';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

type CountryTab = 'ke' | 'ng' | 'gh' | 'tz' | 'bi' | 'crypto' | 'cards';

export const DepositPage: React.FC = () => {
  const { user, refreshUserProfile } = useAuth();
  const { currency, setCurrency, currencies, convertFromKes, convertToKes, formatCurrency } = useCurrency();
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
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

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

  // ==========================================
  // NIGERIA STATE (Paystack / Flutterwave)
  // ==========================================
  const [ngnProvider, setNgnProvider] = useState<'paystack' | 'flutterwave'>('paystack');
  const [ngnAmount, setNgnAmount] = useState<number | ''>(5000);
  const [submittingNgn, setSubmittingNgn] = useState(false);

  // ==========================================
  // GHANA STATE (MTN MoMo / Vodafone)
  // ==========================================
  const [ghsProvider, setGhsProvider] = useState<'paystack' | 'flutterwave'>('flutterwave');
  const [ghsAmount, setGhsAmount] = useState<number | ''>(100);
  const [ghsPhone, setGhsPhone] = useState('');
  const [submittingGhs, setSubmittingGhs] = useState(false);

  // ==========================================
  // TANZANIA STATE (M-Pesa / Tigo / Airtel)
  // ==========================================
  const [tzsAmount, setTzsAmount] = useState<number | ''>(20000);
  const [tzsPhone, setTzsPhone] = useState('');
  const [submittingTzs, setSubmittingTzs] = useState(false);

  // ==========================================
  // BURUNDI STATE (Burundi Franc BIF)
  // ==========================================
  const [bifAmount, setBifAmount] = useState<number | ''>(25000);
  const [submittingBif, setSubmittingBif] = useState(false);

  // ==========================================
  // GLOBAL CARDS (USD / Visa / Mastercard)
  // ==========================================
  const [cardProvider, setCardProvider] = useState<'paystack' | 'flutterwave'>('flutterwave');
  const [cardAmountUsd, setCardAmountUsd] = useState<number | ''>(20);
  const [submittingCard, setSubmittingCard] = useState(false);

  // ==========================================
  // CRYPTO & OKX STATE
  // ==========================================
  const [cryptoNetwork, setCryptoNetwork] = useState<'TRC20' | 'TON' | 'POLYGON'>('TRC20');
  const [cryptoAmountKes, setCryptoAmountKes] = useState<number | ''>(1300);
  const [cryptoIntent, setCryptoIntent] = useState<CryptoDepositIntent | null>(null);
  const [loadingCrypto, setLoadingCrypto] = useState(false);
  const [txHashInput, setTxHashInput] = useState('');
  const [verifyingTx, setVerifyingTx] = useState(false);
  const [cryptoSuccessMsg, setCryptoSuccessMsg] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedMemo, setCopiedMemo] = useState(false);

  // ==========================================
  // BINANCE PAY STATE
  // ==========================================
  const [binanceAmountKes, setBinanceAmountKes] = useState<number | ''>(1300);
  const [binanceOrder, setBinanceOrder] = useState<BinancePayOrder | null>(null);
  const [loadingBinance, setLoadingBinance] = useState(false);

  // Simulator Modal State
  const [simulatorModal, setSimulatorModal] = useState<{
    isOpen: boolean;
    provider: 'flutterwave' | 'paystack';
    txRef: string;
    currency: string;
    amount: number;
  } | null>(null);

  // ==========================================
  // AUTO-HANDLE RETURN CALLBACKS & WEBHOOKS
  // ==========================================
  useEffect(() => {
    const handleUrlCallback = async () => {
      const flwRef = searchParams.get('tx_ref') || searchParams.get('transaction_id') || searchParams.get('simulator_flw');
      const pstkRef = searchParams.get('reference') || searchParams.get('trxref') || searchParams.get('simulator_pstk');

      if (flwRef) {
        setVerifyingExternal(true);
        try {
          const res = await paymentsService.verifyFlutterwave(flwRef);
          if (res.success) {
            setVerificationResult({
              success: true,
              message: res.message || 'Deposit successfully credited!',
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
            message: err.response?.data?.detail || 'Unable to verify Flutterwave payment.',
          });
        } finally {
          setVerifyingExternal(false);
          // Clear query params
          setSearchParams({});
        }
      } else if (pstkRef) {
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
    if (!numAmount || numAmount < 10) {
      setError('Minimum deposit amount is KES 10.00.');
      return;
    }

    setError(null);
    setSubmittingMpesa(true);
    try {
      const res = await paymentsService.initiateMpesaSTK({
        phone_number: phoneNumber.trim(),
        amount: numAmount,
      });

      setCheckoutId(res.checkout_request_id);
      setPollStatus('prompted');
      setCountdown(45);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to initiate M-Pesa STK Push.';
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
          const statusResp = await paymentsService.queryMpesaStatus(checkoutId);
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
  }, [checkoutId, pollStatus]);

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
  // NIGERIA PAYMENT HANDLER
  // ==========================================
  const handleInitiateNigeria = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = typeof ngnAmount === 'number' ? ngnAmount : 0;
    if (!numAmount || numAmount < 100) {
      setError('Minimum deposit is ₦ 100.00.');
      return;
    }
    setError(null);
    setSubmittingNgn(true);

    try {
      if (ngnProvider === 'paystack') {
        const res = await paymentsService.initiatePaystack({
          amount: numAmount,
          currency: 'NGN',
          callback_url: window.location.origin + '/wallet/deposit',
        });
        if (res.is_simulator) {
          setSimulatorModal({
            isOpen: true,
            provider: 'paystack',
            txRef: res.reference,
            currency: 'NGN',
            amount: numAmount,
          });
        } else if (res.authorization_url) {
          window.location.href = res.authorization_url;
        }
      } else {
        const res = await paymentsService.initiateFlutterwave({
          amount: numAmount,
          currency: 'NGN',
          redirect_url: window.location.origin + '/wallet/deposit',
        });
        if (res.is_simulator) {
          setSimulatorModal({
            isOpen: true,
            provider: 'flutterwave',
            txRef: res.tx_ref,
            currency: 'NGN',
            amount: numAmount,
          });
        } else if (res.link) {
          window.location.href = res.link;
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to initiate Nigeria checkout.');
    } finally {
      setSubmittingNgn(false);
    }
  };

  // ==========================================
  // GHANA PAYMENT HANDLER
  // ==========================================
  const handleInitiateGhana = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = typeof ghsAmount === 'number' ? ghsAmount : 0;
    if (!numAmount || numAmount < 5) {
      setError('Minimum deposit is GH₵ 5.00.');
      return;
    }
    setError(null);
    setSubmittingGhs(true);

    try {
      if (ghsProvider === 'paystack') {
        const res = await paymentsService.initiatePaystack({
          amount: numAmount,
          currency: 'GHS',
          callback_url: window.location.origin + '/wallet/deposit',
        });
        if (res.is_simulator) {
          setSimulatorModal({
            isOpen: true,
            provider: 'paystack',
            txRef: res.reference,
            currency: 'GHS',
            amount: numAmount,
          });
        } else if (res.authorization_url) {
          window.location.href = res.authorization_url;
        }
      } else {
        const res = await paymentsService.initiateFlutterwave({
          amount: numAmount,
          currency: 'GHS',
          phone_number: ghsPhone,
          redirect_url: window.location.origin + '/wallet/deposit',
        });
        if (res.is_simulator) {
          setSimulatorModal({
            isOpen: true,
            provider: 'flutterwave',
            txRef: res.tx_ref,
            currency: 'GHS',
            amount: numAmount,
          });
        } else if (res.link) {
          window.location.href = res.link;
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to initiate Ghana Mobile Money checkout.');
    } finally {
      setSubmittingGhs(false);
    }
  };

  // ==========================================
  // TANZANIA PAYMENT HANDLER
  // ==========================================
  const handleInitiateTanzania = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = typeof tzsAmount === 'number' ? tzsAmount : 0;
    if (!numAmount || numAmount < 1000) {
      setError('Minimum deposit is TSh 1,000.');
      return;
    }
    setError(null);
    setSubmittingTzs(true);

    try {
      const res = await paymentsService.initiateFlutterwave({
        amount: numAmount,
        currency: 'TZS',
        phone_number: tzsPhone,
        redirect_url: window.location.origin + '/wallet/deposit',
      });
      if (res.is_simulator) {
        setSimulatorModal({
          isOpen: true,
          provider: 'flutterwave',
          txRef: res.tx_ref,
          currency: 'TZS',
          amount: numAmount,
        });
      } else if (res.link) {
        window.location.href = res.link;
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to initiate Tanzania Mobile Money checkout.');
    } finally {
      setSubmittingTzs(false);
    }
  };

  // ==========================================
  // BURUNDI PAYMENT HANDLER
  // ==========================================
  const handleInitiateBurundi = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = typeof bifAmount === 'number' ? bifAmount : 0;
    if (!numAmount || numAmount < 1000) {
      setError('Minimum deposit is FBu 1,000.');
      return;
    }
    setError(null);
    setSubmittingBif(true);

    try {
      const res = await paymentsService.initiateFlutterwave({
        amount: numAmount,
        currency: 'BIF',
        redirect_url: window.location.origin + '/wallet/deposit',
      });
      if (res.is_simulator) {
        setSimulatorModal({
          isOpen: true,
          provider: 'flutterwave',
          txRef: res.tx_ref,
          currency: 'BIF',
          amount: numAmount,
        });
      } else if (res.link) {
        window.location.href = res.link;
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to initiate Burundi checkout.');
    } finally {
      setSubmittingBif(false);
    }
  };

  // ==========================================
  // GLOBAL CARDS HANDLER
  // ==========================================
  const handleInitiateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = typeof cardAmountUsd === 'number' ? cardAmountUsd : 0;
    if (!numAmount || numAmount < 1) {
      setError('Minimum deposit is $1.00 USD.');
      return;
    }
    setError(null);
    setSubmittingCard(true);

    try {
      const res = await paymentsService.initiateFlutterwave({
        amount: numAmount,
        currency: 'USD',
        redirect_url: window.location.origin + '/wallet/deposit',
      });
      if (res.is_simulator) {
        setSimulatorModal({
          isOpen: true,
          provider: 'flutterwave',
          txRef: res.tx_ref,
          currency: 'USD',
          amount: numAmount,
        });
      } else if (res.link) {
        window.location.href = res.link;
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to initiate Card checkout.');
    } finally {
      setSubmittingCard(false);
    }
  };

  // ==========================================
  // SIMULATOR AUTO-COMPLETE
  // ==========================================
  const handleConfirmSimulation = async () => {
    if (!simulatorModal) return;
    setVerifyingExternal(true);
    try {
      if (simulatorModal.provider === 'paystack') {
        const res = await paymentsService.verifyPaystack(simulatorModal.txRef);
        setVerificationResult({
          success: res.success,
          message: 'Simulation successful! Wallet credited.',
          credited: res.credited_kes,
          currency: simulatorModal.currency,
        });
      } else {
        const res = await paymentsService.verifyFlutterwave(simulatorModal.txRef);
        setVerificationResult({
          success: res.success,
          message: 'Simulation successful! Wallet credited.',
          credited: res.credited_kes,
          currency: simulatorModal.currency,
        });
      }
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

  // ==========================================
  // OKX CRYPTO HANDLERS
  // ==========================================
  const handleGenerateCryptoAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = typeof cryptoAmountKes === 'number' ? cryptoAmountKes : 0;
    if (!numAmount || numAmount < 100) {
      setError('Minimum crypto deposit is KES 100.');
      return;
    }
    setError(null);
    setLoadingCrypto(true);
    try {
      const intent = await cryptoService.createCryptoDeposit({
        network: cryptoNetwork,
        amount_kes: numAmount,
      });
      setCryptoIntent(intent);
      setTxHashInput('');
      setCryptoSuccessMsg(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate crypto deposit address.');
    } finally {
      setLoadingCrypto(false);
    }
  };

  const handleVerifyCryptoTx = async () => {
    if (!cryptoIntent || !txHashInput.trim()) {
      setError('Please paste the Transaction Hash (TxID) from your wallet.');
      return;
    }
    setError(null);
    setVerifyingTx(true);
    try {
      const res = await cryptoService.verifyCryptoTx({
        deposit_id: cryptoIntent.deposit_id,
        tx_hash: txHashInput.trim(),
        network: cryptoIntent.network,
        amount_usdt: cryptoIntent.amount_usdt,
      });
      if (res.is_valid) {
        setCryptoSuccessMsg(`Successfully credited KES ${res.amount_kes.toLocaleString()} to your wallet!`);
        await refreshUserProfile();
        setCryptoIntent(null);
      } else {
        setError(res.message || 'Transaction is still confirming on the blockchain. Please try again shortly.');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to verify transaction hash.');
    } finally {
      setVerifyingTx(false);
    }
  };

  // ==========================================
  // BINANCE PAY HANDLER
  // ==========================================
  const handleCreateBinanceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = typeof binanceAmountKes === 'number' ? binanceAmountKes : 0;
    if (!numAmount || numAmount < 100) {
      setError('Minimum Binance Pay deposit is KES 100.');
      return;
    }
    setError(null);
    setLoadingBinance(true);
    try {
      const order = await cryptoService.createBinanceOrder({
        amount_kes: numAmount,
      });
      setBinanceOrder(order);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create Binance Pay order.');
    } finally {
      setLoadingBinance(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Verification Overlay Modal */}
      {verifyingExternal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#1b1f27] border border-amber-500/30 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
            <Loader2 className="w-12 h-12 text-amber-400 animate-spin mx-auto" />
            <h3 className="text-lg font-black text-white">Verifying Pan-African Payment...</h3>
            <p className="text-xs text-slate-400">
              Connecting with payment gateway and crediting your wallet balance in real-time.
            </p>
          </div>
        </div>
      )}

      {/* Simulator Modal */}
      {simulatorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#161a22] border border-amber-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-5 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-2xl font-black">
              ⚡
            </div>
            <div>
              <div className="inline-block px-3 py-1 bg-amber-500/10 text-amber-400 text-[11px] font-extrabold uppercase tracking-wider rounded-full border border-amber-500/20 mb-2">
                Sandbox Simulator
              </div>
              <h3 className="text-xl font-extrabold text-white">
                Simulate {simulatorModal.provider === 'paystack' ? 'Paystack' : 'Flutterwave'} Checkout
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
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#191d26] via-[#202532] to-[#191d26] p-6 sm:p-8 border border-[#2b303c] shadow-xl">
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
              Instant Pan-African mobile money, Nigerian bank transfers, global cards & crypto Web3 deposits.
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

      {/* Country & Payment Method Tabs */}
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
          <span>Nigeria (Bank / NGN)</span>
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
          <span>Ghana (MTN MoMo)</span>
        </button>

        <button
          onClick={() => { setActiveTab('tz'); setError(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-extrabold text-xs whitespace-nowrap transition-all border ${
            activeTab === 'tz'
              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20 scale-[1.02]'
              : 'bg-[#181c24] hover:bg-[#202530] text-slate-300 border-[#2b303c]'
          }`}
        >
          <span className="text-base">🇹🇿</span>
          <span>Tanzania (M-Pesa)</span>
        </button>

        <button
          onClick={() => { setActiveTab('bi'); setError(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-extrabold text-xs whitespace-nowrap transition-all border ${
            activeTab === 'bi'
              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20 scale-[1.02]'
              : 'bg-[#181c24] hover:bg-[#202530] text-slate-300 border-[#2b303c]'
          }`}
        >
          <span className="text-base">🇧🇮</span>
          <span>Burundi (BIF)</span>
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
          <span>Global Cards (USD)</span>
        </button>

        <button
          onClick={() => { setActiveTab('crypto'); setError(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-extrabold text-xs whitespace-nowrap transition-all border ${
            activeTab === 'crypto'
              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20 scale-[1.02]'
              : 'bg-[#181c24] hover:bg-[#202530] text-slate-300 border-[#2b303c]'
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>Crypto & Web3</span>
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
                    min="10"
                    placeholder="e.g. 500"
                    value={mpesaAmountKes}
                    onChange={(e) => setMpesaAmountKes(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-4 py-3 bg-[#11141a] border border-[#2b303c] rounded-2xl text-white text-sm font-bold focus:border-amber-400 focus:outline-none transition-colors"
                    required
                  />

                  {/* Presets */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {[200, 500, 1000, 2500, 5000].map((preset) => (
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
      {/* TAB 2: NIGERIA (PAYSTACK & FLUTTERWAVE NGN) */}
      {/* ========================================================================= */}
      {activeTab === 'ng' && (
        <Card className="p-6 sm:p-8 bg-[#181c24] border-[#2b303c]">
          <div className="max-w-xl mx-auto space-y-6">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-xl font-black mb-3">
                🇳🇬
              </div>
              <h2 className="text-xl font-black text-white">Nigeria Instant Bank & Card Checkout</h2>
              <p className="text-xs text-slate-400">
                Pay via Instant Bank Transfer, USSD, Apple Pay, or Nigerian Verve/Mastercard.
              </p>
            </div>

            {/* Provider Switcher */}
            <div className="grid grid-cols-2 gap-3 p-1.5 bg-[#11141a] rounded-2xl border border-[#2b303c]">
              <button
                type="button"
                onClick={() => setNgnProvider('paystack')}
                className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                  ngnProvider === 'paystack'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                Paystack (1-Click)
              </button>
              <button
                type="button"
                onClick={() => setNgnProvider('flutterwave')}
                className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                  ngnProvider === 'flutterwave'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Flutterwave (Bank / USSD)
              </button>
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
                {submittingNgn ? 'Connecting Gateway...' : `Proceed to Checkout (₦ ${Number(ngnAmount || 0).toLocaleString()})`}
              </Button>
            </form>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: GHANA (MTN MOMO / VODAFONE / AIRTELTIGO) */}
      {/* ========================================================================= */}
      {activeTab === 'gh' && (
        <Card className="p-6 sm:p-8 bg-[#181c24] border-[#2b303c]">
          <div className="max-w-xl mx-auto space-y-6">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-xl font-black mb-3">
                🇬🇭
              </div>
              <h2 className="text-xl font-black text-white">Ghana Mobile Money (MTN MoMo)</h2>
              <p className="text-xs text-slate-400">
                Instant checkout for MTN Mobile Money, Vodafone Cash, and AirtelTigo.
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
                leftIcon={submittingGhs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
              >
                {submittingGhs ? 'Generating Link...' : `Deposit GH₵ ${Number(ghsAmount || 0).toLocaleString()}`}
              </Button>
            </form>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: TANZANIA (TZS VODACOM / TIGO / AIRTEL) */}
      {/* ========================================================================= */}
      {activeTab === 'tz' && (
        <Card className="p-6 sm:p-8 bg-[#181c24] border-[#2b303c]">
          <div className="max-w-xl mx-auto space-y-6">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto text-xl font-black mb-3">
                🇹🇿
              </div>
              <h2 className="text-xl font-black text-white">Tanzania Mobile Money (TZS)</h2>
              <p className="text-xs text-slate-400">
                Supports Vodacom M-Pesa Tanzania, Tigo Pesa, and Airtel Money via Flutterwave.
              </p>
            </div>

            <form onSubmit={handleInitiateTanzania} className="space-y-5">
              <div>
                <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-2">
                  Deposit Amount (TZS TSh)
                </label>
                <input
                  type="number"
                  min="1000"
                  placeholder="e.g. 20000"
                  value={tzsAmount}
                  onChange={(e) => setTzsAmount(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-4 py-3 bg-[#11141a] border border-[#2b303c] rounded-2xl text-white text-sm font-bold focus:border-amber-400 focus:outline-none transition-colors"
                  required
                />

                <div className="flex flex-wrap gap-2 mt-3">
                  {[10000, 25000, 50000, 100000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTzsAmount(preset)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all ${
                        tzsAmount === preset
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-[#11141a] hover:bg-[#1a1e27] text-slate-400 border-[#2b303c]'
                      }`}
                    >
                      TSh {preset.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conversion Preview */}
              <div className="p-4 bg-[#11141a] rounded-2xl border border-[#2b303c] flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Estimated Wallet Credit:</span>
                <span className="text-emerald-400 font-mono font-bold text-sm">
                  ≈ KES {convertToKes(Number(tzsAmount || 0), 'TZS').toLocaleString()}
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full py-3.5 font-black text-sm"
                disabled={submittingTzs}
                leftIcon={submittingTzs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
              >
                {submittingTzs ? 'Opening Gateway...' : `Deposit TSh ${Number(tzsAmount || 0).toLocaleString()}`}
              </Button>
            </form>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: BURUNDI (BIF) */}
      {/* ========================================================================= */}
      {activeTab === 'bi' && (
        <Card className="p-6 sm:p-8 bg-[#181c24] border-[#2b303c]">
          <div className="max-w-xl mx-auto space-y-6">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-xl font-black mb-3">
                🇧🇮
              </div>
              <h2 className="text-xl font-black text-white">Burundi Franc (BIF)</h2>
              <p className="text-xs text-slate-400">
                Deposit using Lumicash, Ecocash, or local payment channels via Flutterwave.
              </p>
            </div>

            <form onSubmit={handleInitiateBurundi} className="space-y-5">
              <div>
                <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-2">
                  Deposit Amount (BIF FBu)
                </label>
                <input
                  type="number"
                  min="1000"
                  placeholder="e.g. 25000"
                  value={bifAmount}
                  onChange={(e) => setBifAmount(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-4 py-3 bg-[#11141a] border border-[#2b303c] rounded-2xl text-white text-sm font-bold focus:border-amber-400 focus:outline-none transition-colors"
                  required
                />

                <div className="flex flex-wrap gap-2 mt-3">
                  {[10000, 25000, 50000, 100000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBifAmount(preset)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all ${
                        bifAmount === preset
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-[#11141a] hover:bg-[#1a1e27] text-slate-400 border-[#2b303c]'
                      }`}
                    >
                      FBu {preset.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conversion Preview */}
              <div className="p-4 bg-[#11141a] rounded-2xl border border-[#2b303c] flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Estimated Wallet Credit:</span>
                <span className="text-emerald-400 font-mono font-bold text-sm">
                  ≈ KES {convertToKes(Number(bifAmount || 0), 'BIF').toLocaleString()}
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full py-3.5 font-black text-sm"
                disabled={submittingBif}
                leftIcon={submittingBif ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
              >
                {submittingBif ? 'Opening Gateway...' : `Deposit FBu ${Number(bifAmount || 0).toLocaleString()}`}
              </Button>
            </form>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: GLOBAL CARDS (USD) */}
      {/* ========================================================================= */}
      {activeTab === 'cards' && (
        <Card className="p-6 sm:p-8 bg-[#181c24] border-[#2b303c]">
          <div className="max-w-xl mx-auto space-y-6">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto text-xl font-black mb-3">
                💳
              </div>
              <h2 className="text-xl font-black text-white">Global Visa / Mastercard</h2>
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
                {submittingCard ? 'Launching Modal...' : `Pay $${Number(cardAmountUsd || 0).toLocaleString()} USD`}
              </Button>
            </form>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: CRYPTO & WEB3 */}
      {/* ========================================================================= */}
      {activeTab === 'crypto' && (
        <div className="space-y-6">
          {/* OKX Multi-Chain */}
          <Card className="p-6 sm:p-8 bg-[#181c24] border-[#2b303c]">
            <div className="max-w-xl mx-auto space-y-6">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto text-xl font-black mb-3">
                  ₮
                </div>
                <h2 className="text-xl font-black text-white">USDT Multi-Chain Deposit (OKX)</h2>
                <p className="text-xs text-slate-400">
                  Instant Web3 deposits via TRC20, TON, or Polygon.
                </p>
              </div>

              {cryptoSuccessMsg && (
                <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold text-center">
                  {cryptoSuccessMsg}
                </div>
              )}

              {!cryptoIntent ? (
                <form onSubmit={handleGenerateCryptoAddress} className="space-y-5">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-2">
                      Choose Network
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['TRC20', 'TON', 'POLYGON'] as const).map((net) => (
                        <button
                          key={net}
                          type="button"
                          onClick={() => setCryptoNetwork(net)}
                          className={`py-2.5 rounded-xl text-xs font-extrabold border transition-all ${
                            cryptoNetwork === net
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                              : 'bg-[#11141a] hover:bg-[#1a1e27] text-slate-300 border-[#2b303c]'
                          }`}
                        >
                          {net}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-2">
                      Deposit Amount (KES Equivalent)
                    </label>
                    <input
                      type="number"
                      min="100"
                      value={cryptoAmountKes}
                      onChange={(e) => setCryptoAmountKes(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-4 py-3 bg-[#11141a] border border-[#2b303c] rounded-2xl text-white text-sm font-bold focus:border-amber-400 focus:outline-none transition-colors"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full py-3.5 font-black text-sm"
                    disabled={loadingCrypto}
                    leftIcon={loadingCrypto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
                  >
                    {loadingCrypto ? 'Generating Address...' : 'Generate Deposit Address'}
                  </Button>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-[#11141a] rounded-2xl border border-[#2b303c] space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Network:</span>
                      <span className="text-amber-400 font-bold">{cryptoIntent.network}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Exact Amount to Send:</span>
                      <span className="text-white font-mono font-bold">{cryptoIntent.amount_usdt} USDT</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 font-bold uppercase">Deposit Address:</span>
                      <div className="flex items-center gap-2 p-2.5 bg-black/40 rounded-xl border border-[#2b303c]">
                        <span className="text-xs font-mono text-white break-all flex-1">{cryptoIntent.deposit_address}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(cryptoIntent.deposit_address);
                            setCopiedAddress(true);
                            setTimeout(() => setCopiedAddress(false), 2000);
                          }}
                          className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
                        >
                          {copiedAddress ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider">
                      Paste Transaction Hash (TxID)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 0xabc... or TxHash from wallet"
                      value={txHashInput}
                      onChange={(e) => setTxHashInput(e.target.value)}
                      className="w-full px-4 py-3 bg-[#11141a] border border-[#2b303c] rounded-2xl text-white text-xs font-mono focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => setCryptoIntent(null)}
                      className="w-1/3"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleVerifyCryptoTx}
                      className="w-2/3"
                      disabled={verifyingTx || !txHashInput.trim()}
                      leftIcon={verifyingTx ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    >
                      {verifyingTx ? 'Verifying...' : 'Verify & Credit'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
