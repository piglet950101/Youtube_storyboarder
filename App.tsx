
import React, { useState } from 'react';
import { AppStep, Character, Scene } from './types';
import { StepIndicator } from './components/StepIndicator';
import { ScenarioInput } from './components/ScenarioInput';
import { CharacterManager } from './components/CharacterManager';
import { StoryboardEditor } from './components/StoryboardEditor';
import { ImageGenerator } from './components/ImageGenerator';
import { LoginScreen } from './components/LoginScreen';
import { PricingModal } from './components/PricingModal';
import { useAuth } from './contexts/AuthContext';
import { analyzeCharactersFromScript, generateStoryboardScenes, generateCharacterReference } from './services/geminiService';
import { Loader2, Sparkles, Film, Zap, User as UserIcon, LogOut, CreditCard } from 'lucide-react';

// Loading Overlay Component
const LoadingOverlay: React.FC<{ message: string; subMessage: string; icon?: React.ElementType }> = ({ 
  message, 
  subMessage,
  icon: Icon = Sparkles
}) => (
  <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center backdrop-blur-sm cursor-wait">
    <div className="relative mb-8">
      <div className="absolute inset-0 animate-ping opacity-20 bg-red-600 rounded-full"></div>
      <div className="w-24 h-24 border-4 border-zinc-800 border-t-red-600 rounded-full animate-spin flex items-center justify-center bg-zinc-900">
        <Icon size={32} className="text-white animate-pulse" />
      </div>
    </div>
    <h3 className="text-2xl font-bold text-white tracking-wider mb-2 animate-pulse">{message}</h3>
    <p className="text-zinc-400 text-sm font-mono">{subMessage}</p>
    <div className="mt-8 w-64 h-1 bg-zinc-800 rounded-full overflow-hidden">
      <div className="h-full bg-red-600 animate-[loading_2s_ease-in-out_infinite] w-1/2"></div>
    </div>
    <style>{`
      @keyframes loading {
        0% { transform: translateX(-100%); }
        50% { transform: translateX(100%); }
        100% { transform: translateX(-100%); }
      }
    `}</style>
  </div>
);

const App: React.FC = () => {
  const { user, logout } = useAuth();
  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.SCENARIO_INPUT);
  const [scenario, setScenario] = useState("");
  const [sceneCount, setSceneCount] = useState<number>(20);
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [showPricing, setShowPricing] = useState(false);

  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  
  // Loading states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{current: number, total: number} | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>("");

  if (!user) {
    return <LoginScreen />;
  }

  // ---- Navigation ----
  const handleHome = () => {
    if (window.confirm("ホームに戻りますか？現在の入力内容は失われる可能性があります。")) {
        setCurrentStep(AppStep.SCENARIO_INPUT);
        setCharacters([]);
        setScenes([]);
    }
  };

  const handleBack = () => {
    if (currentStep > AppStep.SCENARIO_INPUT) {
        setCurrentStep(currentStep - 1);
    }
  };

  // ---- Helpers ----
  const generateImagesForAllCharacters = async (chars: Character[]) => {
    const updatedChars = [...chars];
    const CHUNK_SIZE = 3; 
    for (let i = 0; i < updatedChars.length; i+=CHUNK_SIZE) {
        const chunk = updatedChars.slice(i, i+CHUNK_SIZE);
        await Promise.all(chunk.map(async (char, idx) => {
            const realIdx = i + idx;
            if (!char.referenceImage) {
                try {
                    const base64 = await generateCharacterReference(char);
                    updatedChars[realIdx] = { ...char, referenceImage: base64 };
                    setCharacters([...updatedChars]); 
                } catch (e) {
                    console.error(`Failed to generate image for ${char.name}`, e);
                }
            }
        }));
    }
    return updatedChars;
  };

  // ---- Flow Handlers ----

  const handleAnalyzeScenario = async () => {
    if (!scenario.trim()) return;
    setIsAnalyzing(true);
    
    try {
      setLoadingMessage("シナリオ分析中...");
      const initialChars = await analyzeCharactersFromScript(scenario);
      
      if (initialChars.length === 0) {
        alert("キャラクターを抽出できませんでした。シナリオを詳しく記述してください。");
        setIsAnalyzing(false);
        return;
      }
      
      setCharacters(initialChars);

      if (isAutoMode) {
        setLoadingMessage("キャラクター画像を自動生成中...");
        const charsWithImages = await generateImagesForAllCharacters(initialChars);
        
        setLoadingMessage("絵コンテを一括生成中...");
        setIsGeneratingStoryboard(true);
        setGenerationProgress({ current: 0, total: sceneCount });
        
        const generatedScenes = await generateStoryboardScenes(
            scenario, 
            charsWithImages, 
            sceneCount,
            (c, t) => setGenerationProgress({ current: c, total: t })
        );
        setScenes(generatedScenes);
        setIsGeneratingStoryboard(false);

        setCurrentStep(AppStep.IMAGE_PRODUCTION);

      } else {
        generateImagesForAllCharacters(initialChars); 
        setCurrentStep(AppStep.CHARACTER_ANALYSIS);
      }

    } catch (error: any) {
      console.error(error);
      alert(`エラーが発生しました: ${error.message || '詳細不明'}`);
    } finally {
      setIsAnalyzing(false);
      setGenerationProgress(null);
    }
  };

  const handleCreateStoryboard = async () => {
    if (characters.length === 0) {
      alert("キャラクターが登録されていません。");
      return;
    }
    setIsGeneratingStoryboard(true);
    setGenerationProgress({ current: 0, total: sceneCount });
    
    try {
      const generatedScenes = await generateStoryboardScenes(
        scenario, 
        characters, 
        sceneCount,
        (current, total) => {
          setGenerationProgress({ current, total });
        }
      );
      
      if (!generatedScenes || generatedScenes.length === 0) {
        throw new Error("生成されたシーンが0件でした。");
      }

      setScenes(generatedScenes);
      setCurrentStep(AppStep.STORYBOARD_GENERATION);
    } catch (error: any) {
      console.error("Storyboard Generation Error:", error);
      alert(`絵コンテの作成に失敗しました。\n\n詳細エラー: ${error.message}\n\nもう一度お試しください。`);
    } finally {
      setIsGeneratingStoryboard(false);
      setGenerationProgress(null);
    }
  };

  const handleGoToProduction = () => {
    setCurrentStep(AppStep.IMAGE_PRODUCTION);
  };

  const updateCharacter = (id: string, updates: Partial<Character>) => {
    setCharacters(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const updateScene = (id: number, updates: Partial<Scene>) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white font-sans relative">
      
      {/* Header/User Bar */}
      <div className="absolute top-0 right-0 p-4 z-50 flex items-center gap-4">
        <div 
          onClick={() => setShowPricing(true)}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-full cursor-pointer transition-colors border border-zinc-700"
        >
          {user.plan === 'pro' ? (
             <>
               <Zap size={14} className="fill-yellow-400 text-yellow-400" />
               <span className="text-xs font-bold">{user.tokens.toLocaleString()} t</span>
             </>
          ) : (
             <span className="text-xs text-zinc-400">Free Plan</span>
          )}
        </div>
        <div className="group relative">
           <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border border-zinc-700" />
           <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity z-50">
              <div className="p-3 border-b border-zinc-800">
                <p className="text-sm font-bold truncate">{user.displayName}</p>
                <p className="text-xs text-zinc-500 truncate">{user.email}</p>
              </div>
              <button onClick={() => setShowPricing(true)} className="w-full text-left p-3 text-sm hover:bg-zinc-800 flex items-center gap-2">
                 <CreditCard size={14} /> プラン変更・購入
              </button>
              <button onClick={logout} className="w-full text-left p-3 text-sm hover:bg-zinc-800 text-red-500 flex items-center gap-2 rounded-b-lg">
                 <LogOut size={14} /> ログアウト
              </button>
           </div>
        </div>
      </div>

      <PricingModal isOpen={showPricing} onClose={() => setShowPricing(false)} />

      {/* Loading Overlays */}
      {isAnalyzing && (
        <LoadingOverlay 
          message={loadingMessage || "処理中..."}
          subMessage={isAutoMode ? "自動モード実行中: 全工程を一括処理しています" : "AIがシナリオを解析しています"}
          icon={isAutoMode ? Zap : Sparkles}
        />
      )}
      
      {isGeneratingStoryboard && !isAnalyzing && (
        <LoadingOverlay 
          message={`絵コンテを作成中...`}
          subMessage={generationProgress 
            ? `${generationProgress.current} / ${generationProgress.total} シーン生成完了 (バッチ処理中)` 
            : "詳細なシーン構成、演出、照明計画を生成しています"}
          icon={Film}
        />
      )}

      <StepIndicator 
        currentStep={currentStep} 
        onHome={handleHome}
        onBack={handleBack}
      />

      <main>
        {currentStep === AppStep.SCENARIO_INPUT && (
          <ScenarioInput 
            value={scenario} 
            onChange={setScenario} 
            sceneCount={sceneCount}
            onSceneCountChange={setSceneCount}
            isAutoMode={isAutoMode}
            onAutoModeChange={setIsAutoMode}
            onNext={handleAnalyzeScenario}
            isAnalyzing={isAnalyzing}
            onOpenPricing={() => setShowPricing(true)}
          />
        )}

        {currentStep === AppStep.CHARACTER_ANALYSIS && (
          <CharacterManager 
            characters={characters}
            onUpdateCharacter={updateCharacter}
            onNext={handleCreateStoryboard}
            isGeneratingStoryboard={isGeneratingStoryboard}
          />
        )}

        {currentStep === AppStep.STORYBOARD_GENERATION && (
          <StoryboardEditor 
            scenes={scenes}
            characters={characters}
            onUpdateScene={updateScene}
            onNext={handleGoToProduction}
          />
        )}

        {currentStep === AppStep.IMAGE_PRODUCTION && (
          <ImageGenerator 
            scenes={scenes}
            characters={characters}
            onUpdateScene={updateScene}
            autoStart={isAutoMode}
            scenarioTitle={scenario.replace(/[\\/:*?"<>|\s]/g, "").substring(0, 10)}
            onOpenPricing={() => setShowPricing(true)}
          />
        )}
      </main>
    </div>
  );
};

export default App;
