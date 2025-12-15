import React, { useState, useEffect } from 'react';
import { Check, X, CreditCard, Crown, Star, Loader2, Plus, Coins } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { STRIPE_PRICING, FREE_INITIAL_TOKENS, COST_PER_IMAGE } from '../types';
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import { createPaymentIntent } from '../services/stripeClientService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type PaymentFlow = 'idle' | 'loading' | 'card-input' | 'processing' | 'success' | 'error';
type PaymentType = 'plan_upgrade' | 'token_topup';

interface PendingPayment {
  type: PaymentType;
  plan?: 'pro_standard' | 'pro_premium';
  tokensAmount?: number;
  clientSecret: string;
  amount: number;
  tokens: number;
}

export const PricingModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { user, session, refreshTokenBalance } = useAuth();
  const stripe = useStripe();
  const elements = useElements();

  const [paymentFlow, setPaymentFlow] = useState<PaymentFlow>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPaymentFlow('idle');
      setError(null);
      setPendingPayment(null);
      setSuccessMessage('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isStandard = user?.plan === 'pro_standard';
  const isPremium = user?.plan === 'pro_premium';
  const isPro = isStandard || isPremium;

  // Initiate payment - creates PaymentIntent and shows card form
  const initiatePayment = async (
    type: PaymentType,
    plan?: 'pro_standard' | 'pro_premium',
    tokensAmount?: number
  ) => {
    if (!session) {
      setError('ログインしてください');
      setPaymentFlow('error');
      return;
    }

    if (!stripe || !elements) {
      setError('決済システムの初期化中です。しばらくお待ちください。');
      setPaymentFlow('error');
      return;
    }

    setPaymentFlow('loading');
    setError(null);

    try {
      const payload: { plan?: 'pro_standard' | 'pro_premium'; tokensAmount?: number } = {};
      if (plan) payload.plan = plan;
      if (tokensAmount) payload.tokensAmount = tokensAmount;

      const response = await createPaymentIntent(type, session.access_token, payload);

      setPendingPayment({
        type,
        plan: plan as 'pro_standard' | 'pro_premium' | undefined,
        tokensAmount,
        clientSecret: response.clientSecret,
        amount: response.amount,
        tokens: response.tokens,
      });

      setPaymentFlow('card-input');
    } catch (err: any) {
      console.error('Payment initiation error:', err);
      setError(err.message || '決済の開始に失敗しました');
      setPaymentFlow('error');
    }
  };

  // Confirm payment with card details
  const confirmPayment = async () => {
    if (!stripe || !elements || !pendingPayment) {
      setError('決済情報が見つかりません');
      setPaymentFlow('error');
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError('カード入力フォームが見つかりません');
      setPaymentFlow('error');
      return;
    }

    setPaymentFlow('processing');

    try {
      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
        pendingPayment.clientSecret,
        {
          payment_method: {
            card: cardElement,
            billing_details: {
              email: user?.email,
              name: user?.displayName,
            },
          },
        }
      );

      if (confirmError) {
        setError(confirmError.message || '決済に失敗しました');
        setPaymentFlow('error');
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        // Success!
        const message = pendingPayment.type === 'plan_upgrade'
          ? `${pendingPayment.plan === 'pro_premium' ? 'プレミアム' : 'スタンダード'}プランへのアップグレードが完了しました！`
          : `${pendingPayment.tokens.toLocaleString()}トークンが追加されました！`;

        setSuccessMessage(message);
        setPaymentFlow('success');

        // Refresh token balance from server
        await refreshTokenBalance();

        // Auto-close after 3 seconds
        setTimeout(() => {
          onClose();
        }, 3000);

      } else if (paymentIntent?.status === 'requires_action') {
        // 3D Secure or other action required - Stripe handles this automatically
        setError('追加の認証が必要です。指示に従ってください。');
        setPaymentFlow('error');
      } else {
        setError(`決済ステータス: ${paymentIntent?.status}`);
        setPaymentFlow('error');
      }
    } catch (err: any) {
      console.error('Payment confirmation error:', err);
      setError(err.message || '決済処理中にエラーが発生しました');
      setPaymentFlow('error');
    }
  };

  // Cancel current payment flow
  const cancelPayment = () => {
    setPaymentFlow('idle');
    setError(null);
    setPendingPayment(null);
  };

  // Calculate top-up tokens based on plan
  const getTopUpTokens = () => {
    return isPremium ? 3000 : 1000;
  };

  const getTopUpPrice = () => {
    return 1000; // ¥1,000 per unit
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-zinc-900 w-full max-w-6xl rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
          <div>
            <h2 className="text-2xl font-bold text-white">料金プラン</h2>
            <p className="text-zinc-400 text-sm">
              {isPro
                ? `現在: ${isPremium ? 'プレミアム' : 'スタンダード'}プラン | 残高: ${user?.tokens.toLocaleString()} トークン`
                : 'ニーズに合わせて最適なプランをお選びください'
              }
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={paymentFlow === 'processing'}
            className="text-zinc-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {/* Card Input Section - Keep mounted during processing to avoid Stripe Element unmount error */}
          {(paymentFlow === 'card-input' || paymentFlow === 'processing') && pendingPayment && (
            <div className="mb-8 max-w-lg mx-auto bg-zinc-800 rounded-xl p-6 border border-zinc-700">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-white font-semibold">
                    {paymentFlow === 'processing' ? '決済処理中...' : 'カード情報を入力'}
                  </h3>
                  <p className="text-zinc-400 text-sm mt-1">
                    {pendingPayment.type === 'plan_upgrade'
                      ? `${pendingPayment.plan === 'pro_premium' ? 'プレミアム' : 'スタンダード'}プラン`
                      : 'トークン追加購入'
                    }
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-white">¥{pendingPayment.amount.toLocaleString()}</p>
                  <p className="text-xs text-green-400">+{pendingPayment.tokens.toLocaleString()} トークン</p>
                </div>
              </div>

              <div className={`bg-zinc-900 p-4 rounded-lg mb-4 ${paymentFlow === 'processing' ? 'opacity-50' : ''}`}>
                <CardElement
                  options={{
                    style: {
                      base: {
                        fontSize: '16px',
                        color: '#ffffff',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        '::placeholder': {
                          color: '#6b7280',
                        },
                      },
                      invalid: {
                        color: '#ef4444',
                        iconColor: '#ef4444',
                      },
                    },
                    disabled: paymentFlow === 'processing',
                  }}
                />
              </div>

              {paymentFlow === 'processing' ? (
                <div className="flex items-center justify-center gap-3 py-3">
                  <Loader2 size={20} className="animate-spin text-green-500" />
                  <p className="text-white font-semibold">決済処理中... 画面を閉じないでください</p>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={cancelPayment}
                    className="flex-1 py-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white font-semibold transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={confirmPayment}
                    className="flex-1 py-3 bg-green-600 hover:bg-green-700 rounded-lg text-white font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <CreditCard size={16} />
                    支払い確認
                  </button>
                </div>
              )}

              <p className="text-xs text-zinc-500 mt-4 text-center">
                決済はStripeにより安全に処理されます
              </p>
            </div>
          )}

          {/* Loading State */}
          {paymentFlow === 'loading' && (
            <div className="mb-8 max-w-md mx-auto bg-zinc-800 rounded-xl p-8 border border-zinc-700 text-center">
              <Loader2 size={48} className="animate-spin text-red-500 mx-auto mb-4" />
              <p className="text-white font-semibold">決済を準備しています...</p>
              <p className="text-zinc-400 text-sm mt-1">しばらくお待ちください</p>
            </div>
          )}

          {/* Error Message */}
          {paymentFlow === 'error' && error && (
            <div className="mb-8 max-w-md mx-auto bg-red-900/20 border border-red-900/50 rounded-xl p-4">
              <p className="text-red-300 text-sm mb-3">{error}</p>
              <button
                onClick={cancelPayment}
                className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white text-sm font-semibold transition-colors"
              >
                閉じる
              </button>
            </div>
          )}

          {/* Success Message */}
          {paymentFlow === 'success' && (
            <div className="mb-8 max-w-md mx-auto bg-green-900/20 border border-green-900/50 rounded-xl p-6 text-center">
              <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check size={32} className="text-white" />
              </div>
              <p className="text-green-300 font-semibold text-lg">{successMessage}</p>
              <p className="text-green-300/70 text-sm mt-2">まもなく自動で閉じます...</p>
            </div>
          )}

          {/* Plan Cards - Hide during payment flow */}
          {(paymentFlow === 'idle' || paymentFlow === 'error') && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Free Plan */}
                <div className="bg-zinc-800/30 rounded-xl p-6 border border-zinc-700 flex flex-col">
                  <h3 className="text-lg font-bold text-zinc-400 mb-2">Free Plan</h3>
                  <div className="text-3xl font-black text-white mb-4">¥0 <span className="text-sm font-medium text-zinc-500">/ 永久</span></div>
                  <p className="text-sm text-zinc-400 mb-6 min-h-[40px]">
                    初回のみ {FREE_INITIAL_TOKENS} トークン付与<br/>
                    (約 {FREE_INITIAL_TOKENS / COST_PER_IMAGE} 枚 生成可能)
                  </p>

                  <ul className="space-y-3 mb-8 flex-1 text-sm">
                    <li className="flex items-center gap-2 text-zinc-300">
                      <Check className="text-zinc-500 flex-shrink-0" size={16} />
                      <span>お試し生成</span>
                    </li>
                    <li className="flex items-center gap-2 text-zinc-300">
                      <Check className="text-zinc-500 flex-shrink-0" size={16} />
                      <span>基本機能の利用</span>
                    </li>
                    <li className="flex items-center gap-2 text-zinc-500 line-through">
                      <X size={16} />
                      <span>トークン追加購入</span>
                    </li>
                  </ul>

                  <div className="mt-auto py-3 text-center text-sm text-zinc-500 bg-zinc-800/50 rounded-lg">
                    {user?.plan === 'free' || !user?.plan ? '現在のプラン' : 'デフォルト'}
                  </div>
                </div>

                {/* Standard Plan */}
                <div className={`rounded-xl p-6 border flex flex-col relative transition-all ${isStandard ? 'bg-zinc-800 border-red-600 ring-1 ring-red-600' : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-500'}`}>
                  <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                    <Star className="text-red-500" size={20} fill="currentColor"/> スタンダード
                  </h3>
                  <div className="text-3xl font-black text-white mb-4">¥{STRIPE_PRICING.standard.price.toLocaleString()} <span className="text-sm font-medium text-zinc-500">/ 一度</span></div>
                  <p className="text-sm text-zinc-400 mb-6 min-h-[40px]">
                    {STRIPE_PRICING.standard.initialTokens.toLocaleString()} トークン付与<br/>
                    (約 {Math.floor(STRIPE_PRICING.standard.initialTokens / COST_PER_IMAGE)} 枚 生成可能)
                  </p>

                  <div className="bg-red-900/20 border border-red-900/50 rounded p-3 mb-6">
                    <p className="text-xs text-red-300 font-bold mb-1">追加トークン購入:</p>
                    <p className="text-sm text-white">
                      {STRIPE_PRICING.standard.topUp.tokens.toLocaleString()}トークン / ¥{STRIPE_PRICING.standard.topUp.price.toLocaleString()}
                    </p>
                  </div>

                  <ul className="space-y-3 mb-8 flex-1 text-sm">
                    <li className="flex items-center gap-2 text-white">
                      <Check className="text-green-500 flex-shrink-0" size={16} />
                      <span>{STRIPE_PRICING.standard.maxTokens.toLocaleString()}トークンまで保有可能</span>
                    </li>
                    <li className="flex items-center gap-2 text-white">
                      <Check className="text-green-500 flex-shrink-0" size={16} />
                      <span>トークン追加購入可能</span>
                    </li>
                    <li className="flex items-center gap-2 text-white">
                      <Check className="text-green-500 flex-shrink-0" size={16} />
                      <span>無期限で使用可能</span>
                    </li>
                  </ul>

                  <div className="mt-auto">
                    {isStandard ? (
                      <div className="w-full py-3 bg-red-600/20 border border-red-600 rounded-lg text-center text-sm font-semibold text-red-400">
                        現在のプラン
                      </div>
                    ) : isPremium ? (
                      <div className="w-full py-3 bg-zinc-700 rounded-lg text-center text-sm text-zinc-500">
                        プレミアムプラン加入中
                      </div>
                    ) : (
                      <button
                        onClick={() => initiatePayment('plan_upgrade', 'pro_standard')}
                        disabled={!stripe}
                        className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-colors flex items-center justify-center gap-2"
                      >
                        <CreditCard size={16} />
                        このプランにする
                      </button>
                    )}
                  </div>
                </div>

                {/* Premium Plan */}
                <div className={`rounded-xl p-6 border flex flex-col relative transition-all ${isPremium ? 'bg-zinc-800 border-amber-500 ring-1 ring-amber-500' : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-500'}`}>
                  <div className="absolute -top-3 right-6 bg-amber-500 text-black px-3 py-1 rounded-full text-xs font-bold">
                    最もお得
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                    <Crown className="text-amber-500" size={20} fill="currentColor"/> プレミアム
                  </h3>
                  <div className="text-3xl font-black text-white mb-4">¥{STRIPE_PRICING.premium.price.toLocaleString()} <span className="text-sm font-medium text-zinc-500">/ 一度</span></div>
                  <p className="text-sm text-zinc-400 mb-6 min-h-[40px]">
                    {STRIPE_PRICING.premium.initialTokens.toLocaleString()} トークン付与<br/>
                    (約 {Math.floor(STRIPE_PRICING.premium.initialTokens / COST_PER_IMAGE)} 枚 生成可能)
                  </p>

                  <div className="bg-amber-900/20 border border-amber-900/50 rounded p-3 mb-6">
                    <p className="text-xs text-amber-300 font-bold mb-1">プレミアム追加購入:</p>
                    <p className="text-sm text-white">
                      {STRIPE_PRICING.premium.topUp.tokens.toLocaleString()}トークン / ¥{STRIPE_PRICING.premium.topUp.price.toLocaleString()} (3倍お得!)
                    </p>
                  </div>

                  <ul className="space-y-3 mb-8 flex-1 text-sm">
                    <li className="flex items-center gap-2 text-white">
                      <Check className="text-green-500 flex-shrink-0" size={16} />
                      <span>{STRIPE_PRICING.premium.maxTokens.toLocaleString()}トークンまで保有可能</span>
                    </li>
                    <li className="flex items-center gap-2 text-white">
                      <Check className="text-green-500 flex-shrink-0" size={16} />
                      <span>プレミアム価格でトークン購入</span>
                    </li>
                    <li className="flex items-center gap-2 text-white">
                      <Check className="text-green-500 flex-shrink-0" size={16} />
                      <span>無期限で使用可能</span>
                    </li>
                  </ul>

                  <div className="mt-auto">
                    {isPremium ? (
                      <div className="w-full py-3 bg-amber-600/20 border border-amber-600 rounded-lg text-center text-sm font-semibold text-amber-400">
                        現在のプラン
                      </div>
                    ) : (
                      <button
                        onClick={() => initiatePayment('plan_upgrade', 'pro_premium')}
                        disabled={!stripe}
                        className="w-full py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-colors flex items-center justify-center gap-2"
                      >
                        <CreditCard size={16} />
                        このプランにする
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Token Top-up Section - Only for Pro users */}
              {isPro && (
                <div className="mt-8 bg-zinc-800/50 rounded-xl p-6 border border-zinc-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-zinc-700 rounded-lg">
                      <Coins size={24} className="text-yellow-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">トークン追加購入</h3>
                      <p className="text-sm text-zinc-400">
                        {isPremium ? 'プレミアム価格: 3,000トークン/¥1,000' : 'スタンダード価格: 1,000トークン/¥1,000'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-zinc-900 rounded-lg p-4">
                    <div>
                      <p className="text-white font-semibold">
                        +{getTopUpTokens().toLocaleString()} トークン
                      </p>
                      <p className="text-zinc-500 text-xs">
                        現在の残高: {user?.tokens.toLocaleString()} / {isPremium ? '60,000' : '10,000'}
                      </p>
                    </div>
                    <button
                      onClick={() => initiatePayment('token_topup', undefined, getTopUpTokens())}
                      disabled={!stripe}
                      className="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-colors flex items-center gap-2"
                    >
                      <Plus size={16} />
                      ¥{getTopUpPrice().toLocaleString()}で購入
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
