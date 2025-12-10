
import React from 'react';
import { Settings, Zap, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { COST_PER_IMAGE } from '../types';

interface Props {
  value: string;
  onChange: (val: string) => void;
  sceneCount: number;
  onSceneCountChange: (val: number) => void;
  isAutoMode: boolean;
  onAutoModeChange: (val: boolean) => void;
  onNext: () => void;
  isAnalyzing: boolean;
  onOpenPricing: () => void;
}

export const ScenarioInput: React.FC<Props> = ({ 
  value, 
  onChange, 
  sceneCount, 
  onSceneCountChange, 
  isAutoMode,
  onAutoModeChange,
  onNext, 
  isAnalyzing,
  onOpenPricing
}) => {
  const { user } = useAuth();
  const isFree = user?.plan === 'free';
  
  const tokens = user?.tokens || 0;

  const handleNextClick = () => {
    const estimatedCost = sceneCount * COST_PER_IMAGE;

    // Check if total estimated cost exceeds current balance
    if (tokens < estimatedCost) {
      const wantsToBuy = window.confirm(
        `【トークン残高不足】\n\n設定された構成（${sceneCount}シーン）の生成には ${estimatedCost} トークンが必要ですが、現在の残高は ${tokens} トークンです。\n\n生成を開始するにはトークンの追加購入が必要です。\n購入画面へ移動しますか？`
      );

      if (wantsToBuy) {
        onOpenPricing();
      }
      // Strictly return here. Do NOT proceed to next step if tokens are insufficient.
      return;
    }

    onNext();
  };

  return (
    <div className="max-w-4xl mx-auto mt-10 p-6">
      <div className="mb-6 flex justify-between items-end">
        <div>
            <h2 className="text-2xl font-bold mb-2 text-white">Step 1: シナリオ入力 & 設定</h2>
            <p className="text-zinc-400">
            YouTube動画のシナリオや台本を貼り付け、生成する絵コンテの枚数を指定してください。
            </p>
        </div>
        {isFree && (
             <div className="text-xs text-yellow-500 border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 rounded">
                 Free Plan: 残り {tokens} トークン
             </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="md:col-span-2">
            <textarea
                className="w-full h-80 bg-zinc-800 border border-zinc-700 rounded-lg p-4 text-white focus:outline-none focus:ring-2 focus:ring-red-600 resize-none leading-relaxed"
                placeholder="ここにテキストを貼り付けてください..."
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>

        <div className="md:col-span-1 flex flex-col gap-4">
             {/* Scene Count Selection */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col justify-center gap-4 shadow-lg flex-1 relative overflow-hidden">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-zinc-800 rounded-lg text-red-500">
                        <Settings size={20} />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-white">生成シーン数</h3>
                        <p className="text-zinc-500 text-xs">絵コンテの総枚数</p>
                    </div>
                </div>
                
                <div className="flex flex-col gap-4 bg-black/30 p-4 rounded-lg border border-zinc-800/50 flex-1 justify-center relative">
                    <div className="text-center">
                        <span className="text-5xl font-black text-red-600">{sceneCount}</span>
                        <span className="text-zinc-500 text-xs block font-medium mt-1">SCENES</span>
                    </div>
                    
                    <div className="flex flex-col gap-2 px-2">
                        <input 
                            type="range" 
                            min="5" 
                            max="200" 
                            step="5" 
                            value={sceneCount}
                            onChange={(e) => onSceneCountChange(Number(e.target.value))}
                            className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-red-600"
                        />
                        <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                            <span>5</span>
                            <span>200</span>
                        </div>
                    </div>

                    <div className="text-center border-t border-zinc-700/50 pt-2 mt-2">
                         <p className="text-[10px] text-zinc-400">
                             予想コスト: <span className={sceneCount * COST_PER_IMAGE > tokens ? "text-red-500 font-bold" : "text-zinc-300"}>{sceneCount * COST_PER_IMAGE}</span> t
                         </p>
                         <p className="text-[10px] text-zinc-500">
                             (残高: {tokens} t)
                         </p>
                         {sceneCount * COST_PER_IMAGE > tokens && (
                             <button onClick={onOpenPricing} className="text-xs text-red-400 hover:text-red-300 underline mt-1">
                                 不足しています（チャージする）
                             </button>
                         )}
                    </div>
                </div>
            </div>

            {/* Auto Mode Switch */}
            <div 
                onClick={() => {
                    if(!isFree) onAutoModeChange(!isAutoMode);
                }}
                className={`cursor-pointer border rounded-xl p-4 flex items-center gap-4 transition-all relative overflow-hidden
                    ${isAutoMode ? 'bg-red-900/20 border-red-600/50' : 'bg-zinc-900 border-zinc-800'}
                    ${isFree ? 'opacity-60 cursor-not-allowed' : 'hover:border-zinc-700'}
                `}
            >
                {isFree && (
                    <div className="absolute inset-0 z-10 bg-black/50 flex items-center justify-center">
                        <Lock size={16} className="text-zinc-400" />
                    </div>
                )}
                
                <div className={`p-2 rounded-full ${isAutoMode ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                    <Zap size={20} className={isAutoMode ? 'fill-current' : ''}/>
                </div>
                <div className="flex-1">
                    <h3 className={`font-bold text-sm ${isAutoMode ? 'text-white' : 'text-zinc-400'}`}>自動生成モード</h3>
                    <p className="text-[10px] text-zinc-500 leading-tight mt-1">
                        確認手順をスキップ（Proのみ）
                    </p>
                </div>
                <div className={`w-10 h-5 rounded-full relative transition-colors ${isAutoMode ? 'bg-red-600' : 'bg-zinc-700'}`}>
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isAutoMode ? 'left-6' : 'left-1'}`} />
                </div>
            </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleNextClick}
          disabled={!value.trim() || isAnalyzing}
          className={`px-8 py-4 rounded-lg font-semibold flex items-center gap-2 text-lg shadow-xl transition-transform hover:scale-105
            ${(!value.trim() || isAnalyzing) ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white'}
          `}
        >
          {isAnalyzing ? '処理中...' : isAutoMode ? '自動生成を開始 (Auto)' : '設定を完了して次へ'}
        </button>
      </div>
    </div>
  );
};
