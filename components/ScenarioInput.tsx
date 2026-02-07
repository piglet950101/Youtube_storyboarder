
import React from 'react';
import { Settings, Zap, Lock, Camera, Palette, Film, Heart, Info, AlertTriangle, Brush, Shapes } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { COST_PER_IMAGE, ImageStyle } from '../types';

interface Props {
  value: string;
  onChange: (val: string) => void;
  sceneCount: number;
  onSceneCountChange: (val: number) => void;
  imageStyle: ImageStyle;
  onImageStyleChange: (val: ImageStyle) => void;
  isAutoMode: boolean;
  onAutoModeChange: (val: boolean) => void;
  onNext: () => void;
  isAnalyzing: boolean;
  onOpenPricing: () => void;
}

const STYLES: { id: ImageStyle; label: string; icon: any; description: string }[] = [
  { id: 'realistic', label: 'リアル', icon: Camera, description: 'フォトリアルな映画風' },
  { id: 'anime', label: 'アニメ風', icon: Film, description: '高品質2Dアニメ' },
  { id: 'anime_moe', label: '萌えアニメ', icon: Heart, description: '目が大きい可愛い系' },
  { id: 'ghibli', label: 'ジブリ風', icon: Palette, description: 'キャラ強調・映画風' },
  { id: 'ukiyo_e', label: '浮世絵風', icon: Brush, description: '伝統的木版画・日本画' },
  { id: 'pixar', label: 'ピクサー風', icon: Shapes, description: '3DCG映画風' },
];

export const ScenarioInput: React.FC<Props> = ({
  value,
  onChange,
  sceneCount,
  onSceneCountChange,
  imageStyle,
  onImageStyleChange,
  isAutoMode,
  onAutoModeChange,
  onNext,
  isAnalyzing,
  onOpenPricing
}) => {
  const { user } = useAuth();
  const isFree = user?.plan === 'free';
  const tokens = user?.tokens || 0;

  const hasTags = value.includes("[SCENE]") || value.includes("[S]");
  const tagCount = hasTags
    ? value.split(/\[SCENE\]|\[S\]/g).map(s => s.trim()).filter(s => s.length > 0).length
    : 0;

  const effectiveSceneCount = hasTags ? tagCount : sceneCount;
  const estimatedCost = effectiveSceneCount * COST_PER_IMAGE;

  const handleNextClick = () => {
    if (tokens < estimatedCost) {
      const wantsToBuy = window.confirm(
        `【クレジット残高不足】\n\n設定された構成（${effectiveSceneCount}シーン）の生成には ${estimatedCost} クレジットが必要ですが、現在の残高は ${tokens} クレジットです。\n\n生成を開始するにはクレジットの追加購入が必要です。\n購入画面へ移動しますか？`
      );
      if (wantsToBuy) {
        onOpenPricing();
      }
      return;
    }
    onNext();
  };

  return (
    <div className="max-w-5xl mx-auto mt-10 p-6">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold mb-2 text-white">Step 1: シナリオ入力 & 設定</h2>
          <p className="text-zinc-400">
            YouTube動画のシナリオを貼り付け、生成する枚数と画風を指定してください。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isFree && (
            <div className="text-xs text-yellow-500 border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 rounded">
              Free Plan: 残り {tokens} クレジット
            </div>
          )}
          <div className="bg-blue-900/20 border border-blue-800/50 p-3 rounded-lg flex gap-3 max-w-xs">
            <Info size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-zinc-300 leading-normal">
              <span className="text-blue-400 font-bold block mb-1">手動シーン分割Tip:</span>
              文章の区切りに <code className="bg-zinc-800 px-1 rounded text-white">[SCENE]</code> と入れると、AIがその箇所で新しいシーンを作成しやすくします。
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        <div className="lg:col-span-8">
          <textarea
            className="w-full h-[500px] bg-zinc-800 border border-zinc-700 rounded-lg p-4 text-white focus:outline-none focus:ring-2 focus:ring-red-600 resize-none leading-relaxed"
            placeholder={"ここにテキストを貼り付けてください...\n\n例:\n[SCENE]\n主人公が森を歩いている。表情は驚き。\n[SCENE]\n突然、目の前に巨大な怪物が現れる！"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Style Selection */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-lg">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Palette size={16} className="text-red-500" /> 画風設定
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {STYLES.map((style) => {
                const Icon = style.icon;
                const isSelected = imageStyle === style.id;
                return (
                  <button
                    key={style.id}
                    onClick={() => onImageStyleChange(style.id)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all text-center
                      ${isSelected ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-500'}
                    `}
                  >
                    <div className={`p-2 rounded ${isSelected ? 'bg-red-600 text-white' : 'bg-zinc-700 text-zinc-400'}`}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <div className="text-sm font-bold">{style.label}</div>
                      <div className="text-[10px] opacity-70 leading-tight">{style.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scene Count Selection */}
          <div className={`bg-zinc-900 border rounded-xl p-4 flex flex-col justify-center gap-3 shadow-lg relative overflow-hidden transition-all ${hasTags ? 'border-amber-500/50 opacity-90' : 'border-zinc-800'}`}>
            <div className="flex items-center gap-2 mb-1">
              <Settings size={16} className={hasTags ? 'text-amber-500' : 'text-red-500'} />
              <h3 className="text-sm font-bold text-white">
                {hasTags ? '検出されたシーン数 (タグ優先)' : '生成シーン数 (自動分割時)'}
              </h3>
            </div>

            <div className={`p-3 rounded-lg border ${hasTags ? 'bg-amber-900/10 border-amber-900/30' : 'bg-black/30 border-zinc-800/50'}`}>
              <div className="text-center mb-2">
                <span className={`text-3xl font-black ${hasTags ? 'text-amber-500' : 'text-red-600'}`}>{effectiveSceneCount}</span>
                <span className="text-zinc-500 text-[10px] block font-medium">SCENES</span>
              </div>
              <input
                type="range"
                min="5"
                max="200"
                step="5"
                disabled={hasTags}
                value={sceneCount}
                onChange={(e) => onSceneCountChange(Number(e.target.value))}
                className={`w-full h-1.5 rounded-lg appearance-none accent-red-600 ${hasTags ? 'bg-zinc-800 cursor-not-allowed opacity-50' : 'bg-zinc-700 cursor-pointer'}`}
              />
            </div>

            {hasTags && (
              <div className="mt-1 flex items-start gap-2 bg-amber-900/20 p-2 rounded border border-amber-700/30">
                <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-200 font-bold leading-tight">
                  [SCENE]タグを {tagCount} 個検出しました。指定の枚数設定は無視され、タグに基づいて分割されます。
                </p>
              </div>
            )}

            <div className="text-center border-t border-zinc-700/50 pt-2 mt-1">
              <p className="text-[10px] text-zinc-400">
                予想コスト: <span className={estimatedCost > tokens ? "text-red-500 font-bold" : "text-zinc-300"}>{estimatedCost}</span> t
              </p>
              <p className="text-[10px] text-zinc-500">
                (残高: {tokens} t)
              </p>
              {estimatedCost > tokens && (
                <button onClick={onOpenPricing} className="text-xs text-red-400 hover:text-red-300 underline mt-1">
                  不足しています（チャージする）
                </button>
              )}
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
              <Zap size={18} className={isAutoMode ? 'fill-current' : ''}/>
            </div>
            <div className="flex-1">
              <h3 className={`font-bold text-sm ${isAutoMode ? 'text-white' : 'text-zinc-400'}`}>自動生成モード</h3>
              <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">
                確認手順をスキップ（Proのみ）
              </p>
            </div>
            <div className={`w-8 h-4 rounded-full relative transition-colors ${isAutoMode ? 'bg-red-600' : 'bg-zinc-700'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isAutoMode ? 'left-4' : 'left-0.5'}`} />
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
