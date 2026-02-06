
import { Scene } from '../types';

export const getSceneFileName = (scene: Scene, extension: string = 'png') => {
  const baseText = scene.originalScriptExcerpt || scene.description || "";
  const clean = baseText.replace(/[\r\n\t]/g, "").replace(/[\\/:*?"<>|]/g, "").trim();
  const textPart = clean.substring(0, 20);
  const finalName = textPart.length > 0 ? textPart : "scene";
  const paddedId = String(scene.id).padStart(3, '0');
  return `${paddedId}_${finalName}.${extension}`;
};
