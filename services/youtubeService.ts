import { ThumbnailData, VideoInfo } from '../types';

export const extractVideoId = (url: string): string | null => {
  if (!url) return null;

  const regExp = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;
  const match = url.match(regExp);

  return (match && match[1].length === 11) ? match[1] : null;
};

export const getVideoInfo = (videoId: string): VideoInfo => {
  const baseUrl = `https://i.ytimg.com/vi/${videoId}`;

  const thumbnails: ThumbnailData[] = [
    {
      quality: 'maxres',
      label: 'Maximum Resolution',
      url: `${baseUrl}/maxresdefault.jpg`,
      width: 1280,
      height: 720
    },
    {
      quality: 'sd',
      label: 'Standard Definition',
      url: `${baseUrl}/sddefault.jpg`,
      width: 640,
      height: 480
    },
    {
      quality: 'hq',
      label: 'High Quality',
      url: `${baseUrl}/hqdefault.jpg`,
      width: 480,
      height: 360
    },
    {
      quality: 'mq',
      label: 'Medium Quality',
      url: `${baseUrl}/mqdefault.jpg`,
      width: 320,
      height: 180
    }
  ];

  return {
    id: videoId,
    thumbnails
  };
};
