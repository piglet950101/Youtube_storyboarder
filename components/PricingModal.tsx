import React, { useState } from 'react';
import { Check, X, CreditCard, Zap, Crown, Star, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { STRIPE_PRICING, FREE_INITIAL_TOKENS, COST_PER_IMAGE } from '../types';
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import { createPaymentIntent } from '../services/stripeClientService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type PaymentFlow = 'idle' | 'loading' | 'card-input' | 'processing' | 'success' | 'error';

export const PricingModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { user, session, refreshTokenBalance } = useAuth();
  const stripe = useStripe();
  const elements = useElements();
  
  const [paymentFlow, setPaymentFlow] = useState<PaymentFlow>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'pro_standard' | 'pro_premium' | null>(null);

  if (!isOpen) return null;

  const isStandard = user?.plan === 'pro_standard';
  const isPremium = user?.plan === 'pro_premium';

  const handleUpgradePlan = async (plan: 'pro_standard' | 'pro_premium') => {
    if (!session) {
      setError('ログインしてください');
      return;
    }

    setSelectedPlan(plan);
    setPaymentFlow('loading');
    setError(null);

    try {
      const { clientSecret } = await createPaymentIntent(
        'plan_upgrade',
        session.access_token,
        { plan }
      );

      if (!stripe || !elements) {
        throw new Error('Stripe not initialized');
      }

      setPaymentFlow('card-input');

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      setPaymentFlow('processing');

      const { error: confirmError, paymentIntent } =
        await stripe.confirmCardPayment(clientSecret, {
          payment_method: {
            card: cardElement,
            billing_details: {
              email: user?.email,
              name: user?.displayName,
            },
          },
        });

      if (confirmError) {
        setError(confirmError.message || 'Payment failed');
        setPaymentFlow('error');
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        setPaymentFlow('success');
        await refreshTokenBalance();
        setTimeout(() => {
          onClose();
          setPaymentFlow('idle');
          setSelectedPlan(null);
        }, 2000);
      } else {
        setError(`Payment status: ${paymentIntent?.status}`);
        setPaymentFlow('error');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setPaymentFlow('error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-zinc-900 w-full max-w-6xl rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
          <div>
            <h2 className="text-2xl font-bold text-white">料金プラン</h2>
            <p className="text-zinc-400 text-sm">ニーズに合わせて最適なプランをお選びください</p>
          </div>
          <button 
            onClick={onClose} 
            disabled={paymentFlow === 'processing'}
            className="text-zinc-400 hover:text-white disabled:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
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
                {user?.plan === 'free' ? '現在のプラン' : 'デフォルト'}
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
                  1,000トークン / ¥1,000
                </p>
              </div>

              <ul className="space-y-3 mb-8 flex-1 text-sm">
                <li className="flex items-center gap-2 text-white">
                  <Check className="text-green-500 flex-shrink-0" size={16} />
                  <span>10,000トークンまで保有可能</span>
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
                  <div className="w-full py-3 bg-zinc-700 rounded-lg text-center text-sm font-semibold text-zinc-300">
                    現在のプラン
                  </div>
                ) : (
                  <button
                    onClick={() => handleUpgradePlan('pro_standard')}
                    disabled={paymentFlow !== 'idle' || !stripe}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    {paymentFlow === 'processing' && selectedPlan === 'pro_standard' ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        処理中...
                      </>
                    ) : (
                      <>
                        <CreditCard size={16} />
                        このプランにする
                      </>
                    )}
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
                  3,000トークン / ¥1,000 (3倍お得!)
                </p>
              </div>

              <ul className="space-y-3 mb-8 flex-1 text-sm">
                <li className="flex items-center gap-2 text-white">
                  <Check className="text-green-500 flex-shrink-0" size={16} />
                  <span>60,000トークンまで保有可能</span>
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
                  <div className="w-full py-3 bg-zinc-700 rounded-lg text-center text-sm font-semibold text-zinc-300">
                    現在のプラン
                  </div>
                ) : (
                  <button
                    onClick={() => handleUpgradePlan('pro_premium')}
                    disabled={paymentFlow !== 'idle' || !stripe}
                    className="w-full py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    {paymentFlow === 'processing' && selectedPlan === 'pro_premium' ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        処理中...
                      </>
                    ) : (
                      <>
                        <CreditCard size={16} />
                        このプランにする
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Card Input Section */}
          {paymentFlow === 'card-input' && (
            <div className="mt-8 max-w-md mx-auto bg-zinc-800 rounded-xl p-6 border border-zinc-700">
              <h3 className="text-white font-semibold mb-4">カード情報を入力</h3>
              <CardElement
                options={{
                  style: {
                    base: {
                      fontSize: '16px',
                      color: '#ffffff',
                      '::placeholder': {
                        color: '#6b7280',
                      },
                    },
                    invalid: {
                      color: '#ef4444',
                    },
                  },
                }}
                className="p-3 border border-zinc-600 rounded"
              />
              <button
                onClick={() => handleUpgradePlan(selectedPlan || 'pro_standard')}
                disabled={paymentFlow === 'processing'}
                className="w-full mt-4 py-3 bg-green-600 hover:bg-green-700 rounded-lg text-white font-semibold disabled:opacity-50"
              >
                {paymentFlow === 'processing' ? '処理中...' : '支払い確認'}
              </button>
            </div>
          )}

          {/* Error Message */}
          {error && paymentFlow === 'error' && (
            <div className="mt-8 max-w-md mx-auto bg-red-900/20 border border-red-900/50 rounded-xl p-4">
              <p className="text-red-300 text-sm">{error}</p>
              <button
                onClick={() => {
                  setPaymentFlow('idle');
                  setError(null);
                  setSelectedPlan(null);
                }}
                className="mt-3 w-full py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white text-sm font-semibold"
              >
                再試行
              </button>
            </div>
          )}

          {/* Success Message */}
          {paymentFlow === 'success' && (
            <div className="mt-8 max-w-md mx-auto bg-green-900/20 border border-green-900/50 rounded-xl p-4">
              <p className="text-green-300 text-sm font-semibold">✓ プラン変更が完了しました!</p>
              <p className="text-green-300/70 text-xs mt-1">トークン残高が更新されました</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
