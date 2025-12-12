
import React, { useState, useRef, useEffect } from 'react';
import { Scene, Character, COST_PER_IMAGE } from '../types';
import { generateSceneImage } from '../services/geminiService';
import { useAuth } from '../contexts/AuthContext';
import { validateTokensForGeneration, deductTokensForImage } from '../services/imageGenerationService';
import { Play, RefreshCw, Download, Edit2, X, Check, Square, Package, Lock, AlertCircle } from 'lucide-react';
import JSZip from 'jszip';

interface Props {
  scenes: Scene[];
  characters: Character[];
  onUpdateScene: (id: number, updates: Partial<Scene>) => void;
  autoStart?: boolean;
  scenarioTitle: string;
  onOpenPricing: () => void;
}

export const ImageGenerator: React.FC<Props> = ({ 
  scenes, 
  characters, 
  onUpdateScene, 
  autoStart = false, 
  scenarioTitle,
  onOpenPricing
}) => {
  const { user, consumeTokens } = useAuth();
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());
  const [editingSceneId, setEditingSceneId] = useState<number | null>(null);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const stopSignalRef = useRef(false);

  // Auto Start Effect
  useEffect(() => {
    if (autoStart && !isBatchGenerating && scenes.some(s => !s.generatedImage)) {
        startBatchGeneration();
    }
  }, [autoStart]);

  // Function to generate a single image
  const generateSingle = async (scene: Scene) => {
    if (generatingIds.has(scene.id)) return;
    if (!user) {
      alert('ログインしてください');
      return;
    }

    const validation = await validateTokensForGeneration(user.uid, COST_PER_IMAGE);
    if (!validation.valid) {
      alert(`${validation.reason}\n\nプランをアップグレードするか、トークンを追加購入してください。`);
      onOpenPricing();
      return;
    }

    setGeneratingIds(prev => new Set(prev).add(scene.id));
    onUpdateScene(scene.id, { isGenerating: true });
    
    if (editingSceneId === scene.id) setEditingSceneId(null);

    try {
      const base64 = await generateSceneImage(scene, characters);
      
      const deductionResult = await deductTokensForImage(user.uid, COST_PER_IMAGE, scene.id);
      if (deductionResult.success) {
        console.log(`Tokens deducted for scene ${scene.id}: ${deductionResult.balanceBefore} → ${deductionResult.balanceAfter}`);
      } else {
        console.error(`Failed to deduct tokens: ${deductionResult.error}`);
      }
      
      onUpdateScene(scene.id, { generatedImage: base64, isGenerating: false });
    } catch (error) {
      console.error(`Error generating scene ${scene.id}`, error);
    } finally {
      setGeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(scene.id);
        return next;
      });
      onUpdateScene(scene.id, { isGenerating: false });
    }
  };

  // Batch generator
  const startBatchGeneration = async () => {
    const scenesToGen = scenes.filter(s => !s.generatedImage);
    if (scenesToGen.length === 0) return;

    setIsBatchGenerating(true);
    setBatchProgress({ current: 0, total: scenesToGen.length });
    stopSignalRef.current = false;
    
    const CHUNK_SIZE = 1; // Limit concurrent to 1 to properly handle token/limit checks sequentially

    for (let i = 0; i < scenesToGen.length; i += CHUNK_SIZE) {
      if (stopSignalRef.current) break;
      
      // Pre-check tokens
      if (user && user.tokens < COST_PER_IMAGE) {
          alert(`トークンが不足したため、一括生成を停止します。`);
          stopSignalRef.current = true;
          onOpenPricing();
          break;
      }

      const chunk = scenesToGen.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(async (s) => {
          await generateSingle(s);
          setBatchProgress(prev => ({ ...prev, current: prev.current + 1 }));
      }));
    }
    
    setIsBatchGenerating(false);
  };

  const stopBatchGeneration = () => {
    stopSignalRef.current = true;
    setIsBatchGenerating(false); // UI update immediately
  };

  // Helpers
  const getFileName = (scene: Scene) => {
    // 1. Use originalScriptExcerpt if available (Priority), otherwise fallback to description
    const baseText = scene.originalScriptExcerpt || scene.description || "";

    // 2. Clean unsafe chars but keep it readable
    const clean = baseText.replace(/[\r\n\t]/g, "").replace(/[\\/:*?"<>|]/g, "").trim();
    
    // 3. First 20 chars (excerpt should be short ~10, but allow a bit more)
    const textPart = clean.substring(0, 20);
    const finalName = textPart.length > 0 ? textPart : "scene";
    
    // 4. ID with 3-digit padding (001, 002...)
    const paddedId = String(scene.id).padStart(3, '0');
    
    // Format: 001_SceneExcerpt.png
    return `${paddedId}_${finalName}.png`;
  };

  // Download All as ZIP
  const handleDownloadZip = async () => {
    const zip = new JSZip();
    // Use scenario title for the folder inside the zip as well
    const folderName = scenarioTitle ? `${scenarioTitle}_images` : "storyboard_images";
    const folder = zip.folder(folderName);
    let count = 0;

    scenes.forEach(scene => {
      if (scene.generatedImage) {
        const filename = getFileName(scene);
        folder?.file(filename, scene.generatedImage, { base64: true });
        count++;
      }
    });

    if (count === 0) {
      alert("保存する画像がありません。");
      return;
    }

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    // ZIP filename uses the main scenario title
    a.download = `${scenarioTitle || "storyboard"}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEditClick = (scene: Scene) => {
    if (!scene.customPrompt) {
      const defaultText = [
        `概要: ${scene.description}`,
        `構図: ${scene.subjectAndComposition}`,
        `場所: ${scene.setting}`,
        `行動: ${scene.action}`,
        `感情: ${scene.emotion}`
      ].join('\n');
      onUpdateScene(scene.id, { customPrompt: defaultText });
    }
    setEditingSceneId(scene.id);
  };

  return (
    <div className="max-w-[1600px] mx-auto mt-10 px-4 pb-20 relative">
      <div className="flex justify-between items-center mb-6 sticky top-24 z-10 bg-[#0f0f0f] py-4 border-b border-zinc-800">
        <div>
          <h2 className="text-2xl font-bold text-white">Step 4: 画像制作 (Production)</h2>
          <p className="text-zinc-400">
             <span className="text-yellow-400 font-bold">Wallet: {user?.tokens.toLocaleString()} t</span>
             <span className="text-zinc-500 text-xs ml-2">(Cost: {COST_PER_IMAGE}t / img)</span>
          </p>
        </div>
        <div className="flex gap-4">
          {/* Download ZIP */}
          <button
            onClick={handleDownloadZip}
            className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-colors"
            title="生成済み画像をまとめてダウンロード"
          >
            <Package size={20} /> ZIP保存
          </button>

          {/* Batch Controls */}
          {isBatchGenerating ? (
            <button
              onClick={stopBatchGeneration}
              className="px-6 py-3 rounded-lg font-semibold flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white animate-pulse"
            >
              <Square fill="currentColor" size={16} /> 生成停止
            </button>
          ) : (
            <button
              onClick={startBatchGeneration}
              className="px-6 py-3 rounded-lg font-semibold flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              <Play fill="currentColor" size={16} /> 
              {scenes.some(s => !s.generatedImage) ? '未生成分を一括生成' : '生成完了'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {scenes.map((scene) => {
          const isEditing = editingSceneId === scene.id;

          return (
            <div key={scene.id} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex flex-col relative group">
              
              {/* Main Visual Area */}
              <div className="relative w-full pt-[56.25%] bg-black">
                
                {/* Editor Overlay */}
                {isEditing ? (
                   <div className="absolute inset-0 bg-zinc-900 p-4 z-20 flex flex-col">
                      <label className="text-xs font-bold text-red-500 mb-2 flex justify-between items-center">
                        プロンプト編集 (日本語)
                        <button onClick={() => setEditingSceneId(null)} className="text-zinc-500 hover:text-white"><X size={16}/></button>
                      </label>
                      <textarea
                        value={scene.customPrompt || ''}
                        onChange={(e) => onUpdateScene(scene.id, { customPrompt: e.target.value })}
                        className="flex-1 w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-white resize-none focus:outline-none focus:border-red-600"
                      />
                      <button 
                        onClick={() => generateSingle(scene)}
                        className="mt-3 w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded flex items-center justify-center gap-2 text-sm font-bold"
                      >
                        <RefreshCw size={14} /> 保存して再生成 (-{COST_PER_IMAGE}t)
                      </button>
                   </div>
                ) : (
                  <div className="absolute inset-0">
                    {scene.generatedImage ? (
                      <img 
                        src={`data:image/png;base64,${scene.generatedImage}`} 
                        alt={`Scene ${scene.id}`} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 bg-zinc-950">
                        <div className="text-4xl font-black opacity-20 mb-2">SCENE {scene.id}</div>
                        {scene.isGenerating ? (
                          <div className="flex flex-col items-center gap-2 text-red-500">
                            <RefreshCw className="animate-spin" size={32} />
                            <span className="text-xs font-mono">GENERATING...</span>
                          </div>
                        ) : (
                            <div className="flex flex-col items-center">
                                <span className="text-xs text-zinc-700 mb-2">WAITING</span>
                                {user && user.tokens < COST_PER_IMAGE && (
                                    <Lock size={16} className="text-yellow-600"/>
                                )}
                            </div>
                        )}
                      </div>
                    )}

                    {/* Hover Actions */}
                    {!scene.isGenerating && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        <button onClick={() => handleEditClick(scene)} className="p-3 bg-white text-black rounded-full hover:bg-zinc-200 hover:scale-110 transition-all" title="編集">
                          <Edit2 size={20} />
                        </button>
                        <button onClick={() => generateSingle(scene)} className="p-3 bg-white text-black rounded-full hover:bg-zinc-200 hover:scale-110 transition-all" title="生成/再生成">
                          <RefreshCw size={20} />
                        </button>
                        {scene.generatedImage && (
                          <a href={`data:image/png;base64,${scene.generatedImage}`} download={getFileName(scene)} className="p-3 bg-white text-black rounded-full hover:bg-zinc-200 hover:scale-110 transition-all" title="保存">
                            <Download size={20} />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Badge */}
                {!isEditing && (
                  <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 text-white text-xs font-mono rounded z-10">
                    #{scene.id}
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="p-4 flex-1 flex flex-col gap-2">
                 {scene.customPrompt ? (
                   <div className="bg-zinc-950 p-2 rounded border border-zinc-800 text-xs text-zinc-400">
                     <span className="text-red-500 font-bold block mb-1 flex items-center gap-1"><Edit2 size={10} /> カスタム</span>
                     <p className="line-clamp-2 italic opacity-70">{scene.customPrompt}</p>
                   </div>
                ) : (
                  <p className="text-sm text-zinc-300 line-clamp-2 font-medium">{scene.description}</p>
                )}
              </div>

            </div>
          );
        })}
      </div>

      {/* Floating Progress Indicator */}
      {isBatchGenerating && (
         <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
            <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-700 text-white px-6 py-4 rounded-2xl shadow-2xl flex flex-col gap-3 min-w-[300px]">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <div className="relative">
                        <RefreshCw className="animate-spin text-green-500" size={24} />
                     </div>
                     <div>
                        <h4 className="font-bold text-sm">一括生成中...</h4>
                        <p className="text-xs text-zinc-400">
                           {batchProgress.current} / {batchProgress.total} 枚完了
                        </p>
                     </div>
                  </div>
                  <button 
                     onClick={stopBatchGeneration}
                     className="bg-zinc-800 hover:bg-zinc-700 text-white p-2 rounded-full transition-colors"
                     title="停止"
                  >
                     <X size={16} />
                  </button>
               </div>
               
               {/* Progress Bar */}
               <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                     className="h-full bg-green-500 transition-all duration-300 ease-out"
                     style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
               </div>

               {/* Real-time Wallet */}
               <div className="flex justify-between items-center text-xs pt-1 border-t border-zinc-800">
                  <span className="text-zinc-500">残トークン:</span>
                  <span className="font-mono font-bold text-yellow-500">
                     {user?.tokens.toLocaleString()} t
                  </span>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};
