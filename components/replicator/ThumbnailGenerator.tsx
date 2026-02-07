import React, { useState, useEffect } from 'react';
import { Wand2, Sparkles, RefreshCw, AlertTriangle, Download, ScanEye, Edit, User, Camera, Image as ImageIcon, Sun, Palette, ShieldCheck, Youtube } from 'lucide-react';
import { generateThumbnailConcept, analyzeImageForPrompt, formatAnalysisDataToPrompt } from '../../services/replicatorGeminiService';
import { extractVideoId, getVideoInfo } from '../../services/youtubeService';
import { ImageRemixer } from './ImageRemixer';
import { ImageAnalysisData, VideoInfo, COST_PER_IMAGE } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { validateTokensForGeneration, deductTokensForImage } from '../../services/imageGenerationService';

interface Props {
  onOpenPricing: () => void;
}

export const ThumbnailGenerator: React.FC<Props> = ({ onOpenPricing }) => {
  const { user, consumeTokens } = useAuth();

  const [url, setUrl] = useState('');
  const [previewInfo, setPreviewInfo] = useState<VideoInfo | null>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSafetyRetry, setShowSafetyRetry] = useState(false);

  const [sourceImageBase64, setSourceImageBase64] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<ImageAnalysisData | null>(null);

  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [finalPromptUsed, setFinalPromptUsed] = useState<string>('');

  useEffect(() => {
    const videoId = extractVideoId(url);
    if (videoId) {
      setPreviewInfo(getVideoInfo(videoId));
    } else {
      setPreviewInfo(null);
    }
  }, [url]);

  const fetchAndConvertToBase64 = async (maxResUrl: string, hqUrl: string): Promise<string> => {
    const blobToBase64 = (blob: Blob): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error("Failed to convert blob to base64"));
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };

    const tryFetch = async (fetchUrl: string): Promise<Blob> => {
      const response = await fetch(fetchUrl, { mode: 'cors', credentials: 'omit' });
      if (!response.ok) throw new Error(`Status: ${response.status}`);
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error("Not an image");
      return blob;
    };

    try {
      const weservMaxRes = `https://wsrv.nl/?url=${encodeURIComponent(maxResUrl)}&output=jpg&n=-1`;
      return await blobToBase64(await tryFetch(weservMaxRes));
    } catch {
      try {
        const weservHq = `https://wsrv.nl/?url=${encodeURIComponent(hqUrl)}&output=jpg&n=-1`;
        return await blobToBase64(await tryFetch(weservHq));
      } catch {
        try {
          const allOriginsHq = `https://api.allorigins.win/raw?url=${encodeURIComponent(hqUrl)}`;
          return await blobToBase64(await tryFetch(allOriginsHq));
        } catch {
          throw new Error("画像の取得に失敗しました。動画が非公開か、アクセス制限がかかっている可能性があります。");
        }
      }
    }
  };

  const handleAnalyze = async () => {
    if (!url.trim() || !user) return;

    const videoId = extractVideoId(url);
    if (!videoId) {
      setError("無効なYouTubeのURLです");
      return;
    }

    setLoading(true);
    setError(null);
    setShowSafetyRetry(false);

    try {
      const info = getVideoInfo(videoId);
      const maxResUrl = info.thumbnails[0].url;
      const hqUrl = info.thumbnails[2].url;

      const base64 = await fetchAndConvertToBase64(maxResUrl, hqUrl);
      setSourceImageBase64(base64);

      const data = await analyzeImageForPrompt(base64);
      setAnalysisData(data);

      setStep(2);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "画像の取得または解析に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleDataChange = (field: keyof ImageAnalysisData, value: string) => {
    if (!analysisData) return;
    setAnalysisData({ ...analysisData, [field]: value });
  };

  const sanitizeText = (text: string): string => {
    return text
      .replace(/女子高生|女子学生|ＪＫ|高校生/g, "20代の制服アイドル")
      .replace(/男子高生|男子学生|高校球児/g, "20代の俳優")
      .replace(/中学生|子供|ガキ|幼児|未成年/g, "小柄な20代のタレント")
      .replace(/小学生/g, "小柄な20代女性")
      .replace(/学校|教室/g, "スタジオセット")
      .replace(/血|流血|鮮血/g, "赤いペイント")
      .replace(/暴力|殴る|蹴る|叩く/g, "ダイナミックなアクションポーズ")
      .replace(/死|殺す|殺害|死体/g, "寝ている演技")
      .replace(/怪我|傷|アザ/g, "特殊メイク")
      .replace(/銃|ナイフ|刃物|武器|刀/g, "おもちゃの小道具")
      .replace(/いじめ/g, "ドラマの対立シーン")
      .replace(/怖い|恐怖/g, "驚いた表情")
      .replace(/死にたい|自殺/g, "悩んでいる演技")
      .replace(/悪意/g, "劇的な展開")
      .replace(/嘲笑|あざ笑う|馬鹿にする|冷笑/g, "高笑い")
      .replace(/屈辱|恥|辱め/g, "悔しがる演技");
  };

  const handleSanitizeAndRetry = async () => {
    if (!analysisData) return;
    const newData: ImageAnalysisData = {
      character: sanitizeText(analysisData.character),
      composition: sanitizeText(analysisData.composition),
      background: sanitizeText(analysisData.background),
      lighting: sanitizeText(analysisData.lighting),
      style: sanitizeText(analysisData.style),
    };
    setAnalysisData(newData);
    setShowSafetyRetry(false);
    await executeGeneration(newData);
  };

  const executeGeneration = async (data: ImageAnalysisData) => {
    if (!user) return;

    // Token validation
    const validation = await validateTokensForGeneration(user.uid, COST_PER_IMAGE);
    if (!validation.valid) {
      alert(`${validation.reason}\n\nプランをアップグレードするか、クレジットを追加購入してください。`);
      onOpenPricing();
      return;
    }

    setLoading(true);
    setError(null);
    setShowSafetyRetry(false);

    try {
      const prompt = formatAnalysisDataToPrompt(data);
      setFinalPromptUsed(prompt);

      const base64Image = await generateThumbnailConcept(prompt);

      // Deduct tokens after successful generation
      const deductionResult = await deductTokensForImage(user.uid, COST_PER_IMAGE);
      if (deductionResult.success) {
        consumeTokens(COST_PER_IMAGE);
      } else {
        console.error(`Failed to deduct tokens: ${deductionResult.error}`);
      }

      setGeneratedImage(`data:image/png;base64,${base64Image}`);
      setStep(3);
    } catch {
      setError("画像の生成に失敗しました。安全フィルタに抵触した可能性があります。");
      setShowSafetyRetry(true);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!analysisData) return;
    await executeGeneration(analysisData);
  };

  const handleReset = () => {
    setStep(1);
    setGeneratedImage(null);
    setAnalysisData(null);
    setSourceImageBase64(null);
    setUrl('');
    setError(null);
    setShowSafetyRetry(false);
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div key={`replicator-step-${step}`} className="bg-gradient-to-br from-indigo-900/20 to-cyan-900/20 border border-indigo-500/30 rounded-3xl p-6 md:p-8 relative overflow-hidden">

        {/* Step 1: Input & Preview */}
        {step === 1 && (
          <div className="space-y-8">
            <div className="max-w-2xl mx-auto">
              <label className="block text-zinc-300 text-sm font-medium mb-3">
                YouTube動画のURLを貼り付けてください
              </label>
              <input
                type="text"
                className="block w-full px-5 py-4 bg-zinc-900/50 border border-zinc-700 rounded-2xl text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-xl"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            {previewInfo && (
              <div className="max-w-3xl mx-auto">
                <div className="bg-zinc-900/60 rounded-2xl border border-zinc-700 overflow-hidden shadow-2xl">
                  <div className="relative aspect-video">
                    <img
                      src={previewInfo.thumbnails[0].url}
                      alt="YouTube Thumbnail"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = previewInfo.thumbnails[2].url;
                      }}
                    />
                    <div className="absolute top-4 left-4 flex items-center bg-red-600 px-3 py-1.5 rounded-lg text-white text-xs font-bold shadow-lg">
                      <Youtube className="w-3 h-3 mr-2" />
                      ORIGINAL PREVIEW
                    </div>
                  </div>
                  <div className="p-6">
                    <button
                      onClick={handleAnalyze}
                      disabled={loading}
                      className={`w-full flex items-center justify-center py-4 rounded-xl font-bold text-white transition-all shadow-lg ${
                        loading
                          ? 'bg-zinc-700 cursor-not-allowed opacity-50'
                          : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/40 hover:-translate-y-0.5'
                      }`}
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                          視覚情報を抽出・解析中...
                        </>
                      ) : (
                        <>
                          <ScanEye className="w-5 h-5 mr-2" />
                          この動画をAIで複製する (Replicate)
                        </>
                      )}
                    </button>
                    <p className="mt-4 text-center text-zinc-500 text-xs">
                      AIが背景、構図、照明、表情を抽出し、文字を含まない新しい画像として再構成します。
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!previewInfo && !loading && (
              <div className="text-center py-20 border-2 border-dashed border-zinc-800 rounded-3xl bg-zinc-800/30 max-w-2xl mx-auto">
                <div className="w-16 h-16 mx-auto bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                  <ImageIcon className="w-8 h-8 text-zinc-500" />
                </div>
                <h3 className="text-lg font-medium text-zinc-300">URLを入力してください</h3>
                <p className="text-zinc-500 mt-2">有効なYouTubeのリンクを検知するとプレビューが表示されます</p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Review & Edit Prompt */}
        {step === 2 && analysisData && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row gap-6 items-start bg-zinc-900/40 p-6 rounded-xl border border-zinc-700/50">
              {sourceImageBase64 && (
                <div className="w-full md:w-64 aspect-video flex-shrink-0 rounded-lg overflow-hidden border border-zinc-600 shadow-md">
                  <img src={sourceImageBase64} alt="Original" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1">
                <h3 className="text-white font-medium mb-2 flex items-center">
                  <Sparkles className="w-4 h-4 mr-2 text-yellow-400" />
                  抽出された視覚情報
                </h3>
                <p className="text-zinc-400 text-sm">
                  AIが以下の項目を抽出しました。生成される画像の内容を微調整できます。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <TextAreaGroup
                icon={<User className="w-5 h-5" />}
                title="【キャラクター】"
                colorClass="text-red-400"
                value={analysisData.character}
                onChange={(v) => handleDataChange('character', v)}
              />
              <TextAreaGroup
                icon={<Camera className="w-5 h-5" />}
                title="【構図】"
                colorClass="text-purple-400"
                value={analysisData.composition}
                onChange={(v) => handleDataChange('composition', v)}
              />
              <TextAreaGroup
                icon={<ImageIcon className="w-5 h-5" />}
                title="【背景】"
                colorClass="text-green-400"
                value={analysisData.background}
                onChange={(v) => handleDataChange('background', v)}
              />
              <TextAreaGroup
                icon={<Sun className="w-5 h-5" />}
                title="【光・照明】"
                colorClass="text-yellow-400"
                value={analysisData.lighting}
                onChange={(v) => handleDataChange('lighting', v)}
              />
              <TextAreaGroup
                icon={<Palette className="w-5 h-5" />}
                title="【画風・雰囲気】"
                colorClass="text-pink-400"
                value={analysisData.style}
                onChange={(v) => handleDataChange('style', v)}
              />
            </div>

            <div className="flex gap-3 pt-4 sticky bottom-0 z-20 bg-zinc-950/80 backdrop-blur-md p-4 rounded-xl border border-zinc-800">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-3 rounded-xl font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                戻る
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className={`flex-1 flex items-center justify-center py-3 rounded-xl font-bold text-white transition-all shadow-lg ${
                  loading
                    ? 'bg-zinc-700 cursor-not-allowed opacity-50'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transform hover:-translate-y-0.5'
                }`}
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                    複製を生成中... (16:9)
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5 mr-2" />
                    この内容で画像を生成 (-{COST_PER_IMAGE}t)
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {step === 3 && generatedImage && (
          <div className="w-full">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white">生成結果</h3>
              <button
                onClick={handleReset}
                className="text-sm text-indigo-400 hover:text-indigo-300 underline"
              >
                新しい動画で試す
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider pl-1">元画像</span>
                <div className="rounded-2xl border border-zinc-700 overflow-hidden shadow-xl aspect-video bg-black/20 relative">
                  {sourceImageBase64 ? (
                    <img src={sourceImageBase64} alt="Original" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">No Image</div>
                  )}
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs text-white">Original</div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider pl-1">AI 複製画像</span>
                <div className="rounded-2xl border-2 border-indigo-500/50 overflow-hidden shadow-2xl shadow-indigo-900/20 aspect-video bg-black/20 relative">
                  <img src={generatedImage} alt="Replicated" className="w-full h-full object-contain" />
                  <div className="absolute top-2 left-2 bg-indigo-600/90 backdrop-blur-sm px-2 py-1 rounded text-xs text-white border border-white/20">Replica</div>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-700 shadow-lg mb-8">
              <div className="p-4 bg-zinc-800 border-b border-zinc-700/50">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                  <div className="flex-1 min-w-0 w-full">
                    <p className="text-sm text-zinc-300 truncate w-full font-mono opacity-70">{finalPromptUsed}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 w-full md:w-auto justify-end">
                    <button
                      onClick={() => setStep(2)}
                      className="flex items-center px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm transition-colors border border-zinc-600 shadow-md"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      構成を修正
                    </button>
                    <a
                      href={generatedImage}
                      download={`replicated-thumbnail-${Date.now()}.png`}
                      className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm transition-colors shadow-lg"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      保存
                    </a>
                  </div>
                </div>
              </div>
              <div className="px-4 pb-4 bg-zinc-800/50">
                <ImageRemixer src={generatedImage} onOpenPricing={onOpenPricing} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 flex flex-col gap-4">
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
            {showSafetyRetry && (
              <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-6 h-6 text-orange-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-orange-400 font-bold mb-1">表現を自動修正して再試行できます</h4>
                    <p className="text-orange-300/80 text-sm mb-4">
                      特定の表現が安全フィルタに触れた可能性があります。自動修正して再生成しますか？
                    </p>
                    <button
                      onClick={handleSanitizeAndRetry}
                      disabled={loading}
                      className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-lg transition-all flex items-center hover:-translate-y-0.5"
                    >
                      {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                      自動修正して再生成
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const TextAreaGroup: React.FC<{
  icon: React.ReactNode;
  title: string;
  value: string;
  onChange: (v: string) => void;
  colorClass: string;
}> = ({ icon, title, value, onChange, colorClass }) => (
  <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-700/50">
    <div className={`flex items-center gap-2 mb-4 font-bold border-b border-zinc-700 pb-2 ${colorClass}`}>
      {icon}
      <h3>{title}</h3>
    </div>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all min-h-[100px] leading-relaxed resize-none"
    />
  </div>
);
