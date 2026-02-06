
import React, { useState } from 'react';
import { Scene, Character } from '../types';
import { ArrowRight, Lock, Users, X, Check, Plus, Loader2 } from 'lucide-react';

interface Props {
  scenes: Scene[];
  characters: Character[];
  onUpdateScene: (id: number, updates: Partial<Scene>) => void;
  onAddScene: (text: string) => Promise<void>;
  onNext: () => void;
}

export const StoryboardEditor: React.FC<Props> = ({ scenes, characters, onUpdateScene, onAddScene, onNext }) => {
  const [editingCharSceneId, setEditingCharSceneId] = useState<number | null>(null);
  const [isAddingScene, setIsAddingScene] = useState(false);
  const [newSceneText, setNewSceneText] = useState("");
  const [isGeneratingScene, setIsGeneratingScene] = useState(false);

  const getCharNames = (ids: string[]) => {
    return ids.map(id => characters.find(c => c.id === id)?.name).filter(Boolean).join(', ');
  };

  const toggleCharacterInScene = (scene: Scene, charId: string) => {
    const current = scene.charactersInScene || [];
    let updated;
    if (current.includes(charId)) {
      updated = current.filter(id => id !== charId);
    } else {
      updated = [...current, charId];
    }
    onUpdateScene(scene.id, { charactersInScene: updated });
  };

  const handleCreateNewScene = async () => {
    if (!newSceneText.trim() || isGeneratingScene) return;
    setIsGeneratingScene(true);
    try {
      await onAddScene(newSceneText.trim());
      setNewSceneText("");
      setIsAddingScene(false);
    } catch (e) {
      alert("シーンの追加に失敗しました。もう一度お試しください。");
    } finally {
      setIsGeneratingScene(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto mt-10 px-4 pb-20">
      <div className="flex justify-between items-end mb-6 sticky top-16 z-30 bg-[#0f0f0f] py-4 border-b border-zinc-800">
        <div>
          <h2 className="text-2xl font-bold text-white">Step 3: 絵コンテ確認 (全{scenes.length}シーン)</h2>
          <p className="text-zinc-400">生成されたシーンを確認・修正してください。ここでの内容が画像生成の設計図になります。</p>
        </div>
        <button
          onClick={onNext}
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2"
        >
          画像生成へ進む <ArrowRight size={18} />
        </button>
      </div>

      <div className="space-y-4">
        {scenes.map((scene) => (
          <div key={scene.instanceId || `scene_${scene.id}`} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex gap-4 hover:border-zinc-600 transition-colors relative">
            <div className="flex-shrink-0 w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center font-bold text-zinc-500">
              #{scene.id}
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">

              {/* Description */}
              <div className="lg:col-span-4">
                <label className="block text-xs font-bold text-zinc-400 mb-2 bg-zinc-800/50 p-1 rounded inline-block">シーン概要・状況説明</label>
                <textarea
                  value={scene.description}
                  onChange={(e) => onUpdateScene(scene.id, { description: e.target.value })}
                  className="w-full h-32 bg-zinc-950 border border-zinc-700 rounded p-3 text-base text-white leading-relaxed resize-none focus:border-red-600 focus:outline-none focus:bg-black"
                  placeholder="どのようなシーンか記述してください"
                />
              </div>

              {/* Tech Specs */}
              <div className="lg:col-span-4 space-y-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">被写体・構図 (フレーミング)</label>
                  <input
                    type="text"
                    value={scene.subjectAndComposition}
                    onChange={(e) => onUpdateScene(scene.id, { subjectAndComposition: e.target.value })}
                    className="w-full bg-black/20 border border-zinc-700 rounded p-2 text-sm text-zinc-300 focus:border-red-600 focus:outline-none"
                    placeholder="誰が、ショットサイズ、アングルなど"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">場所・時間・天候</label>
                  <input
                    type="text"
                    value={scene.setting}
                    onChange={(e) => onUpdateScene(scene.id, { setting: e.target.value })}
                    className="w-full bg-black/20 border border-zinc-700 rounded p-2 text-sm text-zinc-300 focus:border-red-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1 flex items-center gap-1">
                    該当文章 (ファイル名) <Lock size={10} className="text-zinc-600"/>
                  </label>
                  <div className="w-full bg-zinc-950/50 border border-zinc-800 rounded p-2 text-sm text-zinc-400 italic">
                    {scene.originalScriptExcerpt || 'なし'}
                  </div>
                </div>
              </div>

              {/* Action/Emotion */}
              <div className="lg:col-span-4 space-y-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">アクション・動き</label>
                  <input
                    type="text"
                    value={scene.action}
                    onChange={(e) => onUpdateScene(scene.id, { action: e.target.value })}
                    className="w-full bg-black/20 border border-zinc-700 rounded p-2 text-sm text-zinc-300 focus:border-red-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">感情・演技</label>
                  <input
                    type="text"
                    value={scene.emotion}
                    onChange={(e) => onUpdateScene(scene.id, { emotion: e.target.value })}
                    className="w-full bg-black/20 border border-zinc-700 rounded p-2 text-sm text-zinc-300 focus:border-red-600 focus:outline-none"
                  />
                </div>
                <div className="pt-2 relative">
                  <label className="block text-xs text-zinc-500 mb-1">登場人物 (クリックして変更)</label>
                  <button
                    onClick={() => setEditingCharSceneId(scene.id)}
                    className="w-full text-left bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-500 rounded p-2 text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors flex items-center gap-2"
                  >
                    <Users size={14} className="text-zinc-500"/>
                    <span className="truncate">{getCharNames(scene.charactersInScene) || 'なし（風景のみ）'}</span>
                  </button>

                  {/* Character Selection Modal */}
                  {editingCharSceneId === scene.id && (
                    <div className="absolute top-full left-0 mt-2 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-20 p-3 animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex justify-between items-center mb-2 pb-2 border-b border-zinc-800">
                        <span className="text-xs font-bold text-white">登場人物を選択</span>
                        <button onClick={() => setEditingCharSceneId(null)} className="text-zinc-400 hover:text-white"><X size={14}/></button>
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {characters.map(char => {
                          const isSelected = scene.charactersInScene.includes(char.id);
                          return (
                            <div
                              key={char.id}
                              onClick={() => toggleCharacterInScene(scene, char.id)}
                              className={`p-2 rounded cursor-pointer text-sm flex items-center justify-between transition-colors
                                ${isSelected ? 'bg-red-900/30 text-white' : 'hover:bg-zinc-800 text-zinc-400'}
                              `}
                            >
                              <span className="truncate">{char.name}</span>
                              {isSelected && <Check size={14} className="text-red-500"/>}
                            </div>
                          );
                        })}
                      </div>
                      {characters.length === 0 && <div className="text-xs text-zinc-500 text-center py-2">キャラクターがいません</div>}
                      <button
                        onClick={() => setEditingCharSceneId(null)}
                        className="mt-3 w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs py-2 rounded"
                      >
                        完了
                      </button>
                    </div>
                  )}

                  {/* Backdrop */}
                  {editingCharSceneId === scene.id && (
                    <div className="fixed inset-0 z-10" onClick={() => setEditingCharSceneId(null)} />
                  )}
                </div>
              </div>

            </div>
          </div>
        ))}

        {/* Add Scene Form */}
        {isAddingScene ? (
          <div className="bg-zinc-900 border border-dashed border-red-600/50 rounded-lg p-6">
            <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Plus size={16} className="text-red-500" /> 新しいシーンを追加
            </h4>
            <textarea
              value={newSceneText}
              onChange={(e) => setNewSceneText(e.target.value)}
              className="w-full h-24 bg-zinc-950 border border-zinc-700 rounded p-3 text-sm text-white resize-none focus:border-red-600 focus:outline-none mb-3"
              placeholder="例: 主人公が海辺で夕日を眺めている。波の音が聞こえる穏やかな場面。"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setIsAddingScene(false); setNewSceneText(""); }}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreateNewScene}
                disabled={!newSceneText.trim() || isGeneratingScene}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-bold flex items-center gap-2 disabled:opacity-50"
              >
                {isGeneratingScene ? <><Loader2 size={14} className="animate-spin" /> 生成中...</> : 'AIでシーン作成'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingScene(true)}
            className="w-full border border-dashed border-zinc-700 hover:border-red-600/50 rounded-lg p-4 text-zinc-500 hover:text-red-400 text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Plus size={16} /> シーンを追加する
          </button>
        )}
      </div>
    </div>
  );
};
