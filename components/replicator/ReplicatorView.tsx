import React from 'react';
import { ThumbnailGenerator } from './ThumbnailGenerator';

interface Props {
  onOpenPricing: () => void;
}

export const ReplicatorView: React.FC<Props> = ({ onOpenPricing }) => {
  return (
    <div className="max-w-7xl mx-auto px-4 pt-8 pb-20">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-black text-white tracking-tighter mb-3">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
            レプリケーター
          </span>
        </h1>
        <p className="text-zinc-400 max-w-2xl mx-auto">
          YouTubeサムネイルをAIが解析・複製します。元画像の構図・照明・キャラクターを抽出し、テキストを除いた新しい画像を生成します。
        </p>
      </div>

      <ThumbnailGenerator onOpenPricing={onOpenPricing} />
    </div>
  );
};
