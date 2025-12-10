
import { GoogleGenAI, Type, Schema, GenerateContentResponse } from "@google/genai";
import { Character, Scene, MODEL_TEXT_FAST, MODEL_TEXT_SMART, MODEL_IMAGE } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Helper to retry API calls on 503/429 errors with exponential backoff.
 */
const callWithRetry = async <T>(fn: () => Promise<T>, retries = 5, delay = 3000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    // Check for standard GoogleGenAIError structure, HTTP status, or nested error object
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
      console.warn(`Gemini API busy (503/Overloaded). Retrying in ${delay}ms... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

/**
 * Helper to clean JSON string from Markdown code blocks or accidental text.
 */
const cleanJson = (text: string | undefined): string => {
  if (!text) return "[]";
  let cleaned = text.trim();
  // Remove markdown code blocks if present
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```/, "").replace(/```$/, "");
  }
  return cleaned.trim();
};

/**
 * Analyzes the scenario and extracts character profiles.
 */
export const analyzeCharactersFromScript = async (scenario: string): Promise<Character[]> => {
  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        role: { type: Type.STRING },
        visualDescription: { type: Type.STRING, description: "画像生成プロンプト用の詳細な外見的特徴（髪型、目、服装、年齢、体格など）。フォトリアルな日本人スタイル。" },
        personality: { type: Type.STRING },
      },
      required: ["name", "role", "visualDescription", "personality"],
    },
  };

  const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: MODEL_TEXT_FAST,
    contents: `あなたはプロの映画監督アシスタントです。以下のYouTube動画シナリオを分析してください。
    主な登場人物を抽出してください。
    「visualDescription」は、一貫性のあるフォトリアルな日本人キャラクター画像を生成するために、非常に詳細な外見的特徴（髪型、髪の色、目の色、服装、年齢、体格など）を日本語で記述してください。
    
    Scenario:
    ${scenario}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      systemInstruction: "出力は厳密にJSON形式のみとしてください。すべての値は日本語で記述してください。",
    },
  }));

  try {
    const rawData = JSON.parse(cleanJson(response.text));
    return rawData.map((c: any, index: number) => ({
      ...c,
      id: `char_${Date.now()}_${index}`,
    }));
  } catch (e) {
    console.error("JSON Parse Error in analyzeCharactersFromScript", response.text);
    return [];
  }
};

/**
 * Generates the storyboard scenes in batches to maintain quality and consistency.
 */
export const generateStoryboardScenes = async (
  scenario: string, 
  characters: Character[],
  totalSceneCount: number,
  onProgress?: (completed: number, total: number) => void
): Promise<Scene[]> => {
  const charSummary = characters.map(c => `${c.name}: ${c.visualDescription}`).join("\n");
  const BATCH_SIZE = 20;
  let allScenes: Scene[] = [];

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      scenes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING, description: "シーンの概要。" },
            subjectAndComposition: { type: Type.STRING, description: "被写体と構図（誰が/何が、ショットサイズ、カメラアングル）。" },
            setting: { type: Type.STRING, description: "場所の設定（場所、時間帯、天候、照明）。" },
            action: { type: Type.STRING, description: "被写体の動き（アクション）。" },
            emotion: { type: Type.STRING, description: "演技・感情（表情、心理状態）。" },
            charactersInScene: { type: Type.ARRAY, items: { type: Type.STRING }, description: "このシーンに登場するキャラクターの名前。" },
            originalScriptExcerpt: { type: Type.STRING, description: "元のシナリオから、このシーンに対応する箇所の文章を10文字程度でそのまま抜粋。" },
          },
          required: ["description", "subjectAndComposition", "setting", "action", "emotion", "charactersInScene", "originalScriptExcerpt"],
        },
      },
      coverageVerification: { 
        type: Type.STRING, 
        description: "生成したシーン範囲が、指定された進行度（%）と一致しているか、特に「Scene #1がシナリオの冒頭から始まっているか」を確認して記述してください。" 
      }
    },
    required: ["scenes", "coverageVerification"],
  };

  for (let i = 0; i < totalSceneCount; i += BATCH_SIZE) {
    const startId = i + 1;
    const endId = Math.min(i + BATCH_SIZE, totalSceneCount);
    const currentBatchSize = endId - startId + 1;

    // Calculate progress percentage
    const startPercent = Math.round(((startId - 1) / totalSceneCount) * 100);
    const endPercent = Math.round((endId / totalSceneCount) * 100);

    // Create context from previous scene to ensure continuity
    let contextPrompt = "";
    if (allScenes.length > 0) {
      const lastScene = allScenes[allScenes.length - 1];
      contextPrompt = `
      【直前のシーン (#${lastScene.id}) の内容】
      ${lastScene.description}
      
      指示: シーン #${startId} は、上記の続きから自然に繋がるように描写してください。物語を飛ばさないでください。
      `;
    }

    const prompt = `以下のシナリオと登場人物に基づいて、YouTube動画用の詳細な絵コンテを作成してください。
    
    【全体計画】
    このシナリオ全体を「全 ${totalSceneCount} カット」で構成します。
    均等なペース配分で、シナリオの最初から最後までを網羅する必要があります。
    
    【今回のタスク】
    作成範囲: シーン #${startId} から #${endId} まで（計 ${currentBatchSize} カット）。
    
    【進行度目安】
    これは物語全体の「${startPercent}% 地点から ${endPercent}% 地点」に相当するパートです。
    シナリオの該当箇所を特定し、その範囲を ${currentBatchSize} カットで均等に分割してください。
    
    【最重要・必須指示】
    1. シーン #1 (最初のバッチ) は、例外なく必ず「シナリオの冒頭（最初の1行目）」の描写から始めてください。イントロダクションを省略してはいけません。
    2. 原則として、各シーンには「必ず1名以上のキャラクター」を登場させてください。誰もいないシーンは作らないでください（風景描写のみの場合を除く）。
    3. 「originalScriptExcerpt」には、そのシーンの元となったシナリオ内の文章を必ず含めてください。
    
    【トーン＆マナー指示】
    1. これはドラマの撮影です。暴力的な描写が含まれる場合は「ドラマの演出」として描写し、過度にグロテスクにならないようにしてください。
    2. 「嘲笑」や「見下す」といったネガティブな感情表現は、「高笑い」や「不敵な笑み」と表現してください。
    3. ペース配分を厳密に守り、物語が早く進みすぎたり、停滞したりしないようにしてください。
    4. 1つの画像には1つのシーン（ワンシーン）のみを描写してください。コマ割り（コラージュ）画像は作成しません。

    ${contextPrompt}
    
    詳細要件：
    1. ビジュアルのトーンは一貫性を持たせてください（日本人、リアル、映画的）。
    2. 各項目の内容は、画像生成AIへの指示として使えるよう具体的かつ詳細に記述してください。
    3. 出力はすべて日本語で行ってください。
    
    Characters:
    ${charSummary}

    Scenario:
    ${scenario}
    `;

    const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: MODEL_TEXT_SMART,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    }));

    try {
        const cleanedText = cleanJson(response.text);
        const rawData = JSON.parse(cleanedText);

        if (rawData.coverageVerification) {
            console.log(`[Batch ${startId}-${endId}] Verification:`, rawData.coverageVerification);
        }
        
        const sceneList = rawData.scenes || [];
        
        // Map data and correct IDs
        const batchScenes = sceneList.map((s: any, index: number) => {
          const mappedCharIds = (s.charactersInScene || []).map((name: string) => {
            const found = characters.find(c => name.toLowerCase().includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(name.toLowerCase()));
            return found ? found.id : null;
          }).filter((id: string | null) => id !== null);

          return {
            id: startId + index, // Correct ID based on batch offset
            description: s.description,
            subjectAndComposition: s.subjectAndComposition,
            setting: s.setting,
            action: s.action,
            emotion: s.emotion,
            charactersInScene: mappedCharIds,
            originalScriptExcerpt: s.originalScriptExcerpt,
          };
        });

        allScenes = [...allScenes, ...batchScenes];
        
        if (onProgress) {
          onProgress(allScenes.length, totalSceneCount);
        }
    } catch (e) {
        console.error("Failed to parse storyboard batch JSON", response.text);
        throw new Error("AIからの応答データの解析に失敗しました。再試行してください。");
    }
  }

  return allScenes;
};

/**
 * Generates a reference image for a character.
 */
export const generateCharacterReference = async (character: Character): Promise<string> => {
  const prompt = `
    You are an expert AI photographer. Generate a photorealistic portrait based on the following Japanese description.
    Translate the description to English internally for better accuracy.

    Identity Anchor: ${character.name}
    Visuals (Japanese): ${character.visualDescription}
    Style: Photorealistic, 8k resolution, Japanese portrait, cinematic lighting, neutral background.
    Shot: Medium Close-up.
    IMPORTANT: No text, no captions, no watermarks, no japanese characters.
  `;

  const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: MODEL_IMAGE,
    contents: prompt,
    config: {
      imageConfig: {
        aspectRatio: "1:1",
      }
    }
  }));

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return part.inlineData.data;
    }
  }
  throw new Error("No image generated");
};

/**
 * Generates the final scene image.
 */
export const generateSceneImage = async (scene: Scene, allCharacters: Character[]): Promise<string> => {
  const sceneChars = allCharacters.filter(c => scene.charactersInScene.includes(c.id));
  
  let prompt = "You are a world-class cinematographer and AI image generator. \n";
  prompt += "TASK: Generate a photorealistic, 16:9 cinematic shot based on the provided Japanese scene details. \n";
  prompt += "INSTRUCTION: Translate all Japanese details into a rich, descriptive English prompt internally to ensure the highest quality generation. Maintain consistency with the Identity Anchors.\n\n";
  
  if (sceneChars.length > 0) {
    prompt += "Identity Anchors (Characters - Visual Descriptions):\n";
    sceneChars.forEach(c => {
      prompt += `- ${c.name} (Japanese): ${c.visualDescription}\n`;
    });
    prompt += "\n";
  }

  prompt += "### SCENE DETAILS (Japanese) ###\n";
  
  if (scene.customPrompt && scene.customPrompt.trim().length > 0) {
    prompt += `Detailed Instruction: ${scene.customPrompt}\n`;
  } else {
    prompt += `Context: ${scene.description}\n`;
    prompt += `Location/Time/Weather: ${scene.setting}\n`;
    prompt += `Subject & Composition: ${scene.subjectAndComposition}\n`;
    prompt += `Action: ${scene.action}\n`;
    prompt += `Emotion: ${scene.emotion}\n`;
  }

  prompt += `\n### STYLE & FORMAT ###\n`;
  prompt += `Style: Photorealistic, cinematic photography, 8k, highly detailed, cinematic color grading, 16:9 aspect ratio.\n`;
  prompt += `Visuals: Raw footage, clean shot, focus on the subject and environment.\n`;
  
  // STRONG NEGATIVE PROMPTING
  prompt += `NEGATIVE PROMPT (STRICTLY FORBIDDEN): text, subtitles, captions, lower thirds, news ticker, tv interface, watermark, logo, typography, letters, kanji, hiragana, katakana, movie credits, date stamp, speech bubble, blurry bars, borders.\n`;
  prompt += `IMPORTANT: The final image must be completely FREE OF TEXT. No Japanese characters or subtitles on the screen.`;

  const parts: any[] = [];
  
  if (sceneChars.length > 0 && sceneChars[0].referenceImage) {
     parts.push({
       inlineData: {
         mimeType: "image/png",
         data: sceneChars[0].referenceImage
       }
     });
     prompt += `\n(Reference image provided for character: ${sceneChars[0].name}. Use this for facial structure and consistency.)`;
  }

  parts.push({ text: prompt });

  const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: MODEL_IMAGE,
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio: "16:9",
      }
    }
  }));

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return part.inlineData.data;
    }
  }
  throw new Error("No image generated");
};
