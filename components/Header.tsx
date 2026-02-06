
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Zap, LogOut, CreditCard, Clapperboard } from 'lucide-react';
import { ActiveTab } from '../types';

interface Props {
  onOpenPricing: () => void;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export const Header: React.FC<Props> = ({ onOpenPricing, activeTab, onTabChange }) => {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <header className="h-16 bg-[#0f0f0f] border-b border-zinc-800 px-6 flex items-center justify-between sticky top-0 z-40 shadow-xl">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center">
          <Clapperboard size={18} className="text-white" />
        </div>
        <span className="font-black text-xl tracking-tighter text-white">ALGORiTHM</span>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-zinc-800/50 rounded-lg p-1">
        <button
          onClick={() => onTabChange('storyboarder')}
          className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === 'storyboarder'
              ? 'bg-red-600 text-white shadow-lg'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
          }`}
        >
          <Clapperboard size={14} />
          StoryBoarder
        </button>
        <button
          onClick={() => onTabChange('replicator')}
          className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === 'replicator'
              ? 'bg-indigo-600 text-white shadow-lg'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          Replicator
        </button>
      </div>

      {/* Right side: Token badge + User menu */}
      <div className="flex items-center gap-4">
        {/* Token Badge */}
        <div
          onClick={onOpenPricing}
          className="bg-[#1f1f1f] border border-zinc-800 rounded-full px-4 py-1.5 flex items-center gap-2 shadow-inner cursor-pointer hover:border-zinc-600 transition-colors"
        >
          {user.plan === 'pro_standard' || user.plan === 'pro_premium' ? (
            <>
              <Zap size={16} className="text-yellow-400 fill-yellow-400" />
              <span className="text-white font-bold text-sm">{user.tokens.toLocaleString()} <span className="text-zinc-500">t</span></span>
            </>
          ) : (
            <span className="text-xs text-zinc-400">Free Plan: {user.tokens} t</span>
          )}
        </div>

        {/* User dropdown */}
        <div className="group relative">
          <button className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-zinc-400 font-bold text-lg">{user.displayName.charAt(0).toUpperCase()}</span>
            )}
          </button>
          <div className="absolute right-0 top-full pt-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity z-50">
            <div className="w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl">
              <div className="p-3 border-b border-zinc-800">
                <p className="text-sm font-bold truncate">{user.displayName}</p>
                <p className="text-xs text-zinc-500 truncate">{user.email}</p>
              </div>
              <button onClick={onOpenPricing} className="w-full text-left p-3 text-sm hover:bg-zinc-800 flex items-center gap-2">
                <CreditCard size={14} /> プラン変更・購入
              </button>
              <button onClick={logout} className="w-full text-left p-3 text-sm hover:bg-zinc-800 text-red-500 flex items-center gap-2 rounded-b-lg">
                <LogOut size={14} /> ログアウト
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
