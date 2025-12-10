
import React from 'react';
import { Check, X, CreditCard, Zap, Crown, Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { STRIPE_PRICING, FREE_INITIAL_TOKENS, COST_PER_IMAGE } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const PricingModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { upgradeToPlan, purchaseTokens, user } = useAuth();

  if (!isOpen) return null;

  const isStandard = user?.plan === 'pro_standard';
  const isPremium = user?.plan === 'pro_premium';

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-zinc-900 w-full max-w-6xl rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
          <div>
            <h2 className="text-2xl font-bold text-white">料金プラン</h2>
            <p className="text-zinc-400 text-sm">ニーズに合わせて最適なプランをお選びください</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
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
                  <span>お試し生成 (使い切り)</span>
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
                {user?.plan === 'free' ? '現在のプラン' : '利用可能'}
              </div>
            </div>

            {/* Standard Plan */}
            <div className={`rounded-xl p-6 border flex flex-col relative transition-all ${isStandard ? 'bg-zinc-800 border-red-600 ring-1 ring-red-600' : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-500'}`}>
              <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <Star className="text-red-500" size={20} fill="currentColor"/> スタンダード
              </h3>
              <div className="text-3xl font-black text-white mb-4">¥{STRIPE_PRICING.standard.price.toLocaleString()} <span className="text-sm font-medium text-zinc-500">/ 月</span></div>
              <p className="text-sm text-zinc-400 mb-6 min-h-[40px]">
                月 {STRIPE_PRICING.standard.initialTokens.toLocaleString()} トークン付与<br/>
                繰越可能 (保有上限 {STRIPE_PRICING.standard.maxTokens.toLocaleString()}t)
              </p>

              <div className="bg-red-900/20 border border-red-900/50 rounded p-3 mb-6">
                <p className="text-xs text-red-300 font-bold mb-1">追加トークン購入:</p>
                <p className="text-sm text-white">
                  +1,000t / 1,000円
                </p>
              </div>

              <ul className="space-y-3 mb-8 flex-1 text-sm">
                <li className="flex items-center gap-2 text-white">
                  <Check className="text-green-500 flex-shrink-0" size={16} />
                  <span>商用利用可能</span>
                </li>
                <li className="flex items-center gap-2 text-white">
                  <Check className="text-green-500 flex-shrink-0" size={16} />
                  <span>未使用分は翌月に繰り越し</span>
                </li>
                <li className="flex items-center gap-2 text-white">
                  <Check className="text-green-500 flex-shrink-0" size={16} />
                  <span>標準レートでの追加購入</span>
                </li>
              </ul>

              <div className="mt-auto">
                {isStandard ? (
                  <button 
                    onClick={purchaseTokens}
                    className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2"
                  >
                    <Zap size={16} className="fill-yellow-400 text-yellow-400" />
                    追加購入 (+1,000t)
                  </button>
                ) : (
                  <button 
                    onClick={() => upgradeToPlan('pro_standard')}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg"
                  >
                    選択する
                  </button>
                )}
              </div>
            </div>

            {/* Premium Plan */}
            <div className={`rounded-xl p-6 border flex flex-col relative overflow-hidden transition-all ${isPremium ? 'bg-zinc-800 border-yellow-500 ring-1 ring-yellow-500' : 'bg-gradient-to-b from-zinc-800 to-zinc-900 border-zinc-700 hover:border-yellow-500/50'}`}>
              <div className="absolute top-0 right-0 bg-yellow-500 text-black text-[10px] font-bold px-3 py-1 rounded-bl-lg">
                BEST VALUE
              </div>

              <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <Crown className="text-yellow-500" size={20} fill="currentColor" /> プレミアム
              </h3>
              <div className="text-3xl font-black text-white mb-4">¥{STRIPE_PRICING.premium.price.toLocaleString()} <span className="text-sm font-medium text-zinc-500">/ 月</span></div>
              <p className="text-sm text-zinc-400 mb-6 min-h-[40px]">
                月 {STRIPE_PRICING.premium.initialTokens.toLocaleString()} トークン付与<br/>
                <span className="text-yellow-500 font-bold">上限 {STRIPE_PRICING.premium.maxTokens.toLocaleString()}t まで繰越可能</span>
              </p>

              <div className="bg-yellow-900/20 border border-yellow-700/50 rounded p-3 mb-6">
                <p className="text-xs text-yellow-500 font-bold mb-1">追加トークン購入 (お得):</p>
                <p className="text-sm text-white">
                  +3,000t / 1,000円 <span className="text-xs bg-yellow-500 text-black px-1 rounded ml-1">3倍お得</span>
                </p>
              </div>

              <ul className="space-y-3 mb-8 flex-1 text-sm">
                <li className="flex items-center gap-2 text-white">
                  <Check className="text-yellow-500 flex-shrink-0" size={16} />
                  <span>全てのPro機能・最優先サポート</span>
                </li>
                <li className="flex items-center gap-2 text-white">
                  <Check className="text-yellow-500 flex-shrink-0" size={16} />
                  <span>追加購入レート優遇 (3倍)</span>
                </li>
              </ul>

              <div className="mt-auto">
                {isPremium ? (
                   <button 
                    onClick={purchaseTokens}
                    className="w-full bg-yellow-600 hover:bg-yellow-700 text-black font-bold py-3 rounded-lg flex items-center justify-center gap-2"
                  >
                    <Zap size={16} className="fill-black text-black" />
                    追加購入 (+3,000t)
                  </button>
                ) : (
                  <button 
                    onClick={() => upgradeToPlan('pro_premium')}
                    className="w-full bg-white hover:bg-zinc-200 text-black font-bold py-3 rounded-lg shadow-lg"
                  >
                    プレミアムにする
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
