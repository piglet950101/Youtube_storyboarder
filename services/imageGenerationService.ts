import { supabase } from './supabaseClient';
import { COST_PER_IMAGE } from '../types';

export interface TokenValidationResult {
  valid: boolean;
  reason?: string;
  balance?: number;
  costPerImage: number;
}

export interface TokenDeductionResult {
  success: boolean;
  balanceBefore: number;
  balanceAfter: number;
  error?: string;
}

export const validateTokensForGeneration = async (
  userId: string,
  costPerImage: number = COST_PER_IMAGE
): Promise<TokenValidationResult> => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('token_balance')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return {
        valid: false,
        reason: 'ユーザー情報を取得できませんでした',
        costPerImage,
      };
    }

    const balance = user.token_balance || 0;

    if (balance < costPerImage) {
      return {
        valid: false,
        reason: `トークンが不足しています。必要: ${costPerImage}, 所持: ${balance}`,
        balance,
        costPerImage,
      };
    }

    return {
      valid: true,
      balance,
      costPerImage,
    };
  } catch (err: any) {
    console.error('[Image Generation] Token validation error:', err);
    return {
      valid: false,
      reason: err.message || 'トークン検証中にエラーが発生しました',
      costPerImage,
    };
  }
};

export const deductTokensForImage = async (
  userId: string,
  costPerImage: number = COST_PER_IMAGE,
  sceneId?: number
): Promise<TokenDeductionResult> => {
  try {
    const { data, error } = await supabase.rpc('deduct_tokens', {
      user_id: userId,
      amount: costPerImage,
    });

    if (error) {
      console.error('[Image Generation] Token deduction error:', error);
      return {
        success: false,
        balanceBefore: 0,
        balanceAfter: 0,
        error: error.message || 'トークンの消費に失敗しました',
      };
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        balanceBefore: 0,
        balanceAfter: 0,
        error: 'トークン消費の結果が返されませんでした',
      };
    }

    const result = data[0];
    const balanceBefore = result.balance_before;
    const balanceAfter = result.balance_after;

    await logTokenTransaction(
      userId,
      costPerImage,
      balanceBefore,
      balanceAfter,
      sceneId
    );

    return {
      success: true,
      balanceBefore,
      balanceAfter,
    };
  } catch (err: any) {
    console.error('[Image Generation] Token deduction exception:', err);
    return {
      success: false,
      balanceBefore: 0,
      balanceAfter: 0,
      error: err.message || '予期しないエラーが発生しました',
    };
  }
};

export const logTokenTransaction = async (
  userId: string,
  costPerImage: number,
  balanceBefore: number,
  balanceAfter: number,
  sceneId?: number
): Promise<void> => {
  try {
    const { error } = await supabase.from('token_transactions').insert({
      user_id: userId,
      transaction_type: 'image_generation',
      tokens_delta: -costPerImage,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: `Image generation${sceneId ? ` for scene #${sceneId}` : ''}`,
      metadata: sceneId ? { sceneId: String(sceneId) } : undefined,
    });

    if (error) {
      console.error('[Image Generation] Failed to log transaction:', error);
    }
  } catch (err: any) {
    console.error('[Image Generation] Transaction logging error:', err);
  }
};

export const checkTokenBalance = async (
  userId: string
): Promise<number | null> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('token_balance')
      .eq('id', userId)
      .single();

    if (error || !data) {
      console.error('[Image Generation] Balance check error:', error);
      return null;
    }

    return data.token_balance || 0;
  } catch (err: any) {
    console.error('[Image Generation] Balance check exception:', err);
    return null;
  }
};

export const canGenerateImages = async (
  userId: string,
  count: number = 1,
  costPerImage: number = COST_PER_IMAGE
): Promise<{ canGenerate: boolean; reason?: string; tokensCost: number }> => {
  const totalCost = count * costPerImage;
  const validation = await validateTokensForGeneration(userId, totalCost);

  return {
    canGenerate: validation.valid,
    reason: validation.reason,
    tokensCost: totalCost,
  };
};
