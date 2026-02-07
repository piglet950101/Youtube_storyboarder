import React, { useState, useEffect } from 'react';
import { Wand2, RefreshCw, Download, AlertTriangle, Sparkles, RotateCcw, History } from 'lucide-react';
import { generateImageVariations } from '../../services/replicatorGeminiService';
import { COST_PER_IMAGE } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { validateTokensForGeneration, deductTokensForImage } from '../../services/imageGenerationService';

interface ImageRemixerProps {
  src: string;
  onOpenPricing: () => void;
  className?: string;
}

interface HistoryItem {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
}

const REMIX_COST = COST_PER_IMAGE * 2; // 2 images generated per remix

export const ImageRemixer: React.FC<ImageRemixerProps> = ({ src, onOpenPricing, className = '' }) => {
  const { user, consumeTokens } = useAuth();

  const [currentImage, setCurrentImage] = useState(src);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentImage(src);
    setHistory([]);
    setPrompt('');
    setError(null);
  }, [src]);

  const handleRemix = async () => {
    if (!prompt.trim() || !user) return;

    // Token validation: 2 images = 2x cost
    const validation = await validateTokensForGeneration(user.uid, REMIX_COST);
    if (!validation.valid) {
      alert(`${validation.reason}\n\nリミックスには ${REMIX_COST} クレジットが必要です。`);
      onOpenPricing();
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const results = await generateImageVariations(currentImage, prompt);

      // Deduct tokens after successful generation
      const deductionResult = await deductTokensForImage(user.uid, REMIX_COST);
      if (deductionResult.success) {
        consumeTokens(REMIX_COST);
      } else {
        console.error(`Failed to deduct tokens: ${deductionResult.error}`);
      }

      const newItems: HistoryItem[] = results.map(base64 => ({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        url: `data:image/png;base64,${base64}`,
        prompt,
        timestamp: Date.now()
      }));

      setHistory(prev => [...newItems, ...prev].slice(0, 10));
    } catch (err: any) {
      setError(err.message || "バリエーションの生成に失敗しました。もう一度お試しください。");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectForEditing = (imageSrc: string) => {
    setCurrentImage(imageSrc);
    setPrompt('');
    const element = document.getElementById('remixer-input-area');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleResetToOriginal = () => {
    setCurrentImage(src);
    setPrompt('');
  };

  return (
    <div className={`mt-8 pt-6 border-t border-zinc-700/50 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Sparkles className="w-5 h-5 text-indigo-400 mr-2" />
          <h3 className="text-lg font-semibold text-zinc-200">AI マジックエディタ</h3>
        </div>
        {currentImage !== src && (
          <button
            onClick={handleResetToOriginal}
            className="text-xs flex items-center text-zinc-400 hover:text-white transition-colors bg-zinc-800 px-3 py-1.5 rounded-lg"
          >
            <RotateCcw className="w-3 h-3 mr-1.5" />
            元に戻す
          </button>
        )}
      </div>

      <div id="remixer-input-area" className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-700/50 shadow-inner">
        {/* Active Image Preview */}
        <div className="mb-8 flex flex-col items-center">
          <div className="w-full flex justify-between items-end mb-3 px-1">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">対象画像</span>
              <span className="text-zinc-400 text-sm">
                {currentImage === src
                  ? "元の画像を編集中"
                  : "生成された画像を編集中"}
              </span>
            </div>
          </div>

          <div className="relative w-full md:w-2/3 aspect-video rounded-xl overflow-hidden border-2 border-zinc-700 shadow-2xl bg-black/20">
            <img
              src={currentImage}
              alt="Current Input"
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        <div className="mb-4">
          <p className="text-zinc-300 text-sm font-medium mb-2">
            AIを使ってこの画像を変更します。
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例：アニメ風にして、驚いた顔にして..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-zinc-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none shadow-sm"
          />
          <button
            onClick={handleRemix}
            disabled={isGenerating || !prompt.trim()}
            className={`w-full py-4 rounded-xl font-bold text-white transition-all flex items-center justify-center shadow-xl ${
              isGenerating || !prompt.trim()
                ? 'bg-zinc-700 cursor-not-allowed opacity-50'
                : 'bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/20 hover:-translate-y-0.5'
            }`}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                リミックス中...
              </>
            ) : (
              <>
                <Wand2 className="w-5 h-5 mr-2" />
                バリエーションを2つ生成 (-{REMIX_COST}t)
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 flex items-center text-sm">
            <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Results History Grid */}
      {history.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center mb-6 text-zinc-300 font-medium">
            <History className="w-5 h-5 mr-2" />
            <span>生成履歴 ({history.length}/10)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {history.map((item, idx) => (
              <div key={item.id} className="group relative bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden shadow-lg transition-all hover:shadow-2xl hover:border-indigo-500/30">
                <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-2 py-1 rounded text-xs font-medium text-white z-10 border border-white/10 shadow-sm">
                  #{history.length - idx}
                </div>
                <img
                  src={item.url}
                  alt={`Variation ${item.id}`}
                  className="w-full aspect-video object-cover transition-transform duration-700 group-hover:scale-105"
                />

                {/* Hover Actions */}
                <div className="absolute inset-0 bg-zinc-950/80 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-3 backdrop-blur-[2px]">
                  <button
                    onClick={() => handleSelectForEditing(item.url)}
                    className="w-40 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded-lg font-bold text-sm flex items-center justify-center shadow-lg transform hover:scale-105 transition-all"
                  >
                    <Wand2 className="w-4 h-4 mr-2" />
                    これを編集
                  </button>
                  <a
                    href={item.url}
                    download={`remix-${item.timestamp}.png`}
                    className="w-40 bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-3 rounded-lg font-bold text-sm flex items-center justify-center shadow-lg transform hover:scale-105 transition-all"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    画像を保存
                  </a>
                </div>

                <div className="p-4 bg-zinc-900 border-t border-zinc-700/50">
                  <p className="text-sm text-zinc-400 line-clamp-2" title={item.prompt}>
                    {item.prompt}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
