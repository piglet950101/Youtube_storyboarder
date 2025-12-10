
export interface Character {
  id: string;
  name: string;
  role: string;
  visualDescription: string; // Specific visual traits for the prompt
  personality: string;
  referenceImage?: string; // Base64 data
}

export interface Scene {
  id: number;
  description: string; // General description
  subjectAndComposition: string; // Who/What + Shot Size + Angle
  setting: string; // Location + Time/Weather
  action: string; // Movement
  emotion: string; // Facial expression/Vibe
  charactersInScene: string[]; // IDs of characters present
  generatedImage?: string; // Base64
  isGenerating?: boolean;
  customPrompt?: string; // User override for generation
  originalScriptExcerpt?: string; // New field for filename extraction
}

export enum AppStep {
  SCENARIO_INPUT = 0,
  CHARACTER_ANALYSIS = 1,
  STORYBOARD_GENERATION = 2,
  IMAGE_PRODUCTION = 3,
}

export type VideoRatio = '16:9';

// Gemini Model Constants
export const MODEL_TEXT_FAST = 'gemini-2.5-flash';
// Switch to Flash for stability. Pro Preview often returns 503 or malformed JSON under load.
export const MODEL_TEXT_SMART = 'gemini-2.5-flash'; 
export const MODEL_IMAGE = 'gemini-2.5-flash-image'; // "Nano Banana"

// Auth & Billing Types
export type PlanTier = 'free' | 'pro_standard' | 'pro_premium';

export interface User {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  plan: PlanTier;
  tokens: number; // Total wallet balance for ALL users
}

export const STRIPE_PRICING = {
  standard: {
    id: 'pro_standard',
    name: 'スタンダード',
    price: 4980,
    currency: 'JPY',
    initialTokens: 5000,
    maxTokens: 10000, // Cap
    topUp: {
      price: 1000,
      tokens: 1000,
    }
  },
  premium: {
    id: 'pro_premium',
    name: 'プレミアム',
    price: 9800,
    currency: 'JPY',
    initialTokens: 30000,
    maxTokens: 60000, // Cap
    topUp: {
      price: 1000,
      tokens: 3000,
    }
  }
};

export const FREE_INITIAL_TOKENS = 100;
export const COST_PER_IMAGE = 5;