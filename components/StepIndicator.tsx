import React from 'react';
import { AppStep } from '../types';
import { FileText, Users, Clapperboard, Image as ImageIcon, Home, ArrowLeft } from 'lucide-react';

interface Props {
  currentStep: AppStep;
  onHome: () => void;
  onBack: () => void;
}

const steps = [
  { id: AppStep.SCENARIO_INPUT, label: 'シナリオ入力', icon: FileText },
  { id: AppStep.CHARACTER_ANALYSIS, label: '登場人物', icon: Users },
  { id: AppStep.STORYBOARD_GENERATION, label: '絵コンテ', icon: Clapperboard },
  { id: AppStep.IMAGE_PRODUCTION, label: '画像生成', icon: ImageIcon },
];

export const StepIndicator: React.FC<Props> = ({ currentStep, onHome, onBack }) => {
  return (
    <div className="w-full bg-zinc-900 border-b border-zinc-800 py-4 sticky top-0 z-20 shadow-md">
      <div className="max-w-6xl mx-auto px-4 flex items-center gap-6">
        
        {/* Navigation Buttons */}
        <div className="flex gap-2 mr-4 border-r border-zinc-800 pr-6">
            <button 
                onClick={onHome}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
                title="ホームに戻る"
            >
                <Home size={20} />
            </button>
            <button 
                onClick={onBack}
                disabled={currentStep === AppStep.SCENARIO_INPUT}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="前の画面に戻る"
            >
                <ArrowLeft size={20} />
            </button>
        </div>

        {/* Steps */}
        <div className="flex-1 flex justify-between items-center relative">
          {/* Line */}
          <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-zinc-800 -z-10" />
          
          {steps.map((step, index) => {
            const isActive = step.id === currentStep;
            const isCompleted = step.id < currentStep;
            const Icon = step.icon;

            return (
              <div key={step.id} className="flex flex-col items-center bg-zinc-900 px-2">
                <div 
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors duration-300
                    ${isActive || isCompleted ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}
                  `}
                >
                  <Icon size={18} />
                </div>
                <span className={`mt-2 text-xs font-medium ${isActive || isCompleted ? 'text-white' : 'text-zinc-600'}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};