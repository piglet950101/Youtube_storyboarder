import React, { useState } from 'react';
import { Character } from '../types';
import { generateCharacterReference } from '../services/geminiService';
import { RefreshCw, ArrowRight } from 'lucide-react';

interface Props {
  characters: Character[];
  onUpdateCharacter: (id: string, updates: Partial<Character>) => void;
  onNext: () => void;
  isGeneratingStoryboard: boolean;
  // Allow parent to trigger or control loading if needed, but we keep local for manual retry
}

export const CharacterManager: React.FC<Props> = ({ characters, onUpdateCharacter, onNext, isGeneratingStoryboard }) => {
  const [loadingImages, setLoadingImages] = useState<Record<string, boolean>>({});

  const handleGenerateImage = async (char: Character) => {
    setLoadingImages(prev => ({ ...prev, [char.id]: true }));
    try {
      const base64 = await generateCharacterReference(char);
      onUpdateCharacter(char.id, { referenceImage: base64 });
    } catch (error) {
      console.error("Failed to generate image", error);
      alert("参照画像の生成に失敗しました。もう一度お試しください。");
    } finally {
      setLoadingImages(prev => ({ ...prev, [char.id]: false }));
    }
  };

  return (
    <div className="max-w-6xl mx-auto mt-10 px-4 pb-20">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Step 2: キャラクター設定</h2>
          <p className="text-zinc-400">AIが抽出した登場人物を確認してください。画像は自動生成されますが、必要に応じて再生成できます。</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {characters.map((char) => (
          <div key={char.id} className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-zinc-700 flex justify-between items-center bg-zinc-900">
              <input 
                type="text" 
                value={char.name}
                onChange={(e) => onUpdateCharacter(char.id, { name: e.target.value })}
                className="bg-transparent text-lg font-bold text-white focus:outline-none border-b border-transparent focus:border-red-600 w-2/3"
                placeholder="名前"
              />
              <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-1 rounded">{char.role}</span>
            </div>
            
            <div className="p-4 flex-1 flex flex-col gap-4">
              <div className="flex gap-4">
                {/* Reference Image Area */}
                <div className="w-32 h-32 bg-black rounded-lg flex-shrink-0 relative overflow-hidden border border-zinc-600 group">
                  {char.referenceImage ? (
                    <img src={`data:image/png;base64,${char.referenceImage}`} alt={char.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 text-[10px] text-center p-2">
                      <RefreshCw className="animate-spin mb-2" size={20} />
                      <span>Generating...</span>
                    </div>
                  )}
                  
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                     <button
                      onClick={() => handleGenerateImage(char)}
                      disabled={loadingImages[char.id]}
                      className="p-2 bg-white rounded-full text-black hover:bg-zinc-200 disabled:opacity-50"
                      title="参照画像を再生成"
                     >
                       <RefreshCw size={16} className={loadingImages[char.id] ? "animate-spin" : ""} />
                     </button>
                  </div>
                </div>

                {/* Text Inputs */}
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">外見的特徴 (画像生成用プロンプト)</label>
                    <textarea
                      value={char.visualDescription}
                      onChange={(e) => onUpdateCharacter(char.id, { visualDescription: e.target.value })}
                      className="w-full h-24 bg-zinc-900 text-sm text-zinc-300 p-2 rounded border border-zinc-700 focus:border-red-600 focus:outline-none resize-none leading-relaxed"
                      placeholder="髪型、顔の特徴、服装などを詳細に..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">性格・役割</label>
                    <input
                      type="text"
                      value={char.personality}
                      onChange={(e) => onUpdateCharacter(char.id, { personality: e.target.value })}
                      className="w-full bg-zinc-900 text-sm text-zinc-300 p-2 rounded border border-zinc-700 focus:border-red-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-4 border-t border-zinc-800">
        <button
          onClick={onNext}
          disabled={isGeneratingStoryboard}
          className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-lg font-bold text-lg flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-red-900/20 transition-all hover:scale-105"
        >
          {isGeneratingStoryboard ? '絵コンテ作成中...' : '確定して絵コンテを作成'} <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
};