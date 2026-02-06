import { GoogleGenAI, GenerateContentResponse, Type, Schema } from "@google/genai";
import { ImageAnalysisData, MODEL_TEXT_FAST, MODEL_IMAGE } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT' as const, threshold: 'BLOCK_ONLY_HIGH' as const },
  { category: 'HARM_CATEGORY_HATE_SPEECH' as const, threshold: 'BLOCK_ONLY_HIGH' as const },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as const, threshold: 'BLOCK_ONLY_HIGH' as const },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as const, threshold: 'BLOCK_ONLY_HIGH' as const },
];

/**
 * Retry wrapper matching production geminiService pattern.
 */
const callWithRetry = async <T>(fn: () => Promise<T>, retries = 5, delay = 3000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const statusCode = error.status || error.code || error.response?.status || error.error?.code;
    const msg = (error.message || JSON.stringify(error)).toLowerCase();

    const isRetryable =
      statusCode === 503 ||
      statusCode === 429 ||
      statusCode === 'UNAVAILABLE' ||
      msg.includes('overloaded') ||
      msg.includes('unavailable') ||
      msg.includes('503');

    if (retries > 0 && isRetryable) {
      console.warn(`[Replicator] API busy. Retrying in ${delay}ms... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

const extractImageFromResponse = (response: GenerateContentResponse): string => {
  const candidates = response.candidates;
  if (candidates && candidates.length > 0) {
    const content = candidates[0].content;
    if (content && content.parts) {
      for (const part of content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return part.inlineData.data;
        }
      }
    }
  }
  throw new Error("No image generated from the model.");
};

const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    character: { type: Type.STRING, description: "キャラクターに関する詳細記述（箇条書き）" },
    composition: { type: Type.STRING, description: "構図に関する詳細記述（箇条書き）" },
    background: { type: Type.STRING, description: "背景に関する詳細記述（箇条書き）" },
    lighting: { type: Type.STRING, description: "光・照明に関する詳細記述（箇条書き）" },
    style: { type: Type.STRING, description: "画風・雰囲気に関する詳細記述（箇条書き）" },
  }
};

export const analyzeImageForPrompt = async (imageBase64: string): Promise<ImageAnalysisData> => {
  const mimeMatch = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const cleanData = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

  const analysisPrompt = `
    Analyze this YouTube thumbnail image and extract visual details into the specified JSON structure.

    CRITICAL INSTRUCTION: IGNORE ALL TEXT, LOGOS, AND TYPOGRAPHY OVERLAYS.
    Focus ONLY on the visual illustration/photo elements.

    Output the values in JAPANESE.

    For each field, ensure the content is formatted as a bulleted list using '・' as the bullet point.

    Specifically analyze:
    - [character]: Gender, age, physique, facial features, hairstyle, clothing, expression, pose.
      *CRITICAL*:
      1. If there are multiple characters, identify them as "Person A (Left)" and "Person B (Right)".
      2. Specify "Face Direction" (Facing Camera, Profile Left, Profile Right) for EACH character.
      3. Specify "Eye Gaze".
    - [composition]: Camera angle, shot size (Close-up, Medium shot, etc.).
      *CRITICAL*:
      1. Divide the screen into Left/Center/Right. Explicitly state WHAT is in each zone.
      2. Specify "Occupancy %" of the subject.
    - [background]: Setting, objects, and surrounding elements.
    - [lighting]: Direction, intensity, color temperature, and shadows.
    - [style]: Medium (photo, 3D render, anime, etc.), color palette, and mood. Specify "Color Grading" and "Lens Type".

    Fill in the details based on the image content for the following templates:

    [character]
    ・人数と配置（例：右に男性、左に女性）：
    ・人物A（位置）：性別、年齢、髪型、服装、表情、顔の向き：
    ・人物B（位置）：性別、年齢、髪型、服装、表情、顔の向き：
    ・ポーズ詳細：

    [composition]
    ・画面の左側にあるもの：
    ・画面の中央にあるもの：
    ・画面の右側にあるもの：
    ・アングル：
    ・カメラ距離（ショットサイズ）：

    [background]
    ・場所：
    ・背景の物体：
    ・周囲の人物（数・ぼかすか）：

    [lighting]
    ・光源：
    ・光の方向：
    ・色温度：

    [style]
    ・画風（実写/イラスト/3D）：
    ・色味（カラーグレーディング）：
    ・雰囲気：
    ・質感（レンズ感）：

    If a specific detail is ambiguous or missing, provide a best guess or write "不明".
  `;

  const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: MODEL_TEXT_FAST,
    contents: {
      parts: [
        { inlineData: { mimeType, data: cleanData } },
        { text: analysisPrompt }
      ]
    },
    config: {
      safetySettings: SAFETY_SETTINGS,
      responseMimeType: "application/json",
      responseSchema: analysisSchema
    }
  }));

  if (response.text) {
    return JSON.parse(response.text) as ImageAnalysisData;
  }
  throw new Error("解析結果が空でした");
};

export const formatAnalysisDataToPrompt = (data: ImageAnalysisData): string => {
  const negatives = "NSFW, nude, naked, nipples, sexual, gore, blood, text, watermark, logo, typography, distorted face, bad anatomy, bad hands, blurry, low quality, ugly, monochrome, grayscale";

  return `
    You are an expert digital artist creating a high-quality YouTube thumbnail.

    [MASTER STYLE & TONE]
    ${data.style}

    [SCENE ELEMENTS]
    - Characters & Layout: ${data.character}
    - Composition: ${data.composition}
    - Background: ${data.background}
    - Lighting: ${data.lighting}

    [DEFAULT ETHNICITY]
    Unless the character description explicitly specifies a different ethnicity (e.g. blonde caucasian, black skin, foreign actor), the character MUST be depicted as **JAPANESE**. Apply Japanese facial features and aesthetics by default.

    [SPATIAL INTEGRITY - DO NOT FLIP]
    You MUST preserve the exact horizontal arrangement of the original description.
    - If the description says "Person A is on the RIGHT", draw them on the RIGHT.
    - If the description says "Person B is on the LEFT", draw them on the LEFT.
    - **DO NOT MIRROR OR FLIP THE IMAGE.**
    - Strictly follow the "Facing Direction" (e.g. if looking Left, look Left).

    [STRICT COMPOSITION - MANDATORY RULES]
    The image MUST follow this specific layout for text overlay compatibility AND accurate reproduction:

    1. **VERTICAL OFFSET**: All character faces, eyes, and main focal points MUST be positioned in the **TOP 60%** of the image.
    2. **EMPTY LOWER THIRD**: The **BOTTOM 40%** of the image must be completely EMPTY of important details. It should be only:
       - Blurred background
       - Solid clothing (torso/chest)
       - Empty table/floor
       - Negative space
    3. **DO NOT SHRINK**: Do NOT make the subject small to fit. Keep the subject LARGE and CLOSE-UP, but shifted vertically UPWARDS.

    [QUALITY & NEGATIVE CONSTRAINTS]
    Aspect Ratio: 16:9
    Quality: 8k, Masterpiece, High Definition, Cinematic, Highly Detailed.
    Negative Prompt: ${negatives}, complex details in bottom third, face in bottom third, small subject, far shot, flipped image, mirrored image
  `;
};

export const generateThumbnailConcept = async (prompt: string): Promise<string> => {
  const enhancedPrompt = `
    ${prompt}

    Context: Fictional entertainment scene. Make it expressive and eye-catching.
  `;

  const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: MODEL_IMAGE,
    contents: {
      parts: [
        { text: enhancedPrompt }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: "16:9"
      },
      safetySettings: SAFETY_SETTINGS
    }
  }));

  return extractImageFromResponse(response);
};

export const editThumbnail = async (imageBase64: string, prompt: string): Promise<string> => {
  const mimeMatch = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const cleanData = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

  const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: MODEL_IMAGE,
    contents: {
      parts: [
        { inlineData: { mimeType, data: cleanData } },
        { text: `Edit this image based on this instruction: ${prompt}. Maintain high quality. Context: Fictional entertainment scene. IMPORTANT: Ensure the main subject/face is shifted to the UPPER part of the image. Keep the bottom 30% empty. Unless explicitly specified otherwise, the subject should be depicted as JAPANESE. Do not flip horizontal positions.` }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: "16:9"
      },
      safetySettings: SAFETY_SETTINGS
    }
  }));

  return extractImageFromResponse(response);
};

export const generateImageVariations = async (imageBase64: string, prompt: string): Promise<string[]> => {
  const promise1 = editThumbnail(imageBase64, prompt);
  const promise2 = editThumbnail(imageBase64, `${prompt} (Make it slightly different styled version)`);

  const results = await Promise.all([promise1, promise2]);
  return results;
};
