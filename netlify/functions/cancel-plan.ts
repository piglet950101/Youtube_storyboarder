import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with service key for admin access
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

interface CancelPlanRequest {
  targetPlan: 'free' | 'pro_standard';
}

// Token limits per plan
const MAX_TOKENS = {
  free: 100,
  pro_standard: 30000,
  pro_premium: 60000,
};

// Get allowed origin for CORS
const getAllowedOrigin = (requestOrigin: string | undefined): string => {
  const allowedOrigins = [
    'https://youtubestory.netlify.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8888',
  ];

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return 'https://youtubestory.netlify.app';
};

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const origin = event.headers.origin || event.headers.Origin;
  const corsHeaders = {
    'Access-Control-Allow-Origin': getAllowedOrigin(origin),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Unauthorized: Invalid auth header format' }),
    };
  }

  try {
    const token = authHeader.split(' ')[1];
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      console.error('Auth error:', authError);
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid or expired token' }),
      };
    }

    // Parse request body
    let body: CancelPlanRequest;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON body' }),
      };
    }

    if (!body.targetPlan || !['free', 'pro_standard'].includes(body.targetPlan)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid targetPlan. Must be free or pro_standard' }),
      };
    }

    const userId = authData.user.id;

    // Fetch current user data
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !userRecord) {
      console.error('User fetch error:', userError);
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found in database' }),
      };
    }

    const currentPlan = userRecord.plan_tier || 'free';
    const targetPlan = body.targetPlan;

    // Validate downgrade path
    if (currentPlan === 'free') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: '既にFreeプランです' }),
      };
    }

    if (currentPlan === 'pro_standard' && targetPlan === 'pro_standard') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: '既にスタンダードプランです' }),
      };
    }

    if (currentPlan === 'pro_premium' && targetPlan === 'pro_standard') {
      // Downgrade from Premium to Standard - allowed
    } else if (targetPlan === 'free') {
      // Downgrade to Free - allowed from any paid plan
    } else {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: '無効なプラン変更です' }),
      };
    }

    // Calculate new token balance (cap at target plan's max)
    const currentTokens = userRecord.token_balance || 0;
    const maxTokens = MAX_TOKENS[targetPlan as keyof typeof MAX_TOKENS];
    const newTokenBalance = Math.min(currentTokens, maxTokens);
    const tokenLoss = currentTokens - newTokenBalance;

    // Update user record (only update columns that exist)
    const { error: updateError } = await supabase
      .from('users')
      .update({
        plan_tier: targetPlan,
        token_balance: newTokenBalance,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Failed to update user plan:', updateError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'プラン変更に失敗しました' }),
      };
    }

    // Log the cancellation transaction
    await supabase.from('token_transactions').insert({
      user_id: userId,
      transaction_type: 'plan_downgrade',
      tokens_delta: tokenLoss > 0 ? -tokenLoss : 0,
      balance_before: currentTokens,
      balance_after: newTokenBalance,
      description: `Plan downgrade: ${currentPlan} → ${targetPlan}${tokenLoss > 0 ? ` (${tokenLoss} tokens lost due to cap)` : ''}`,
      metadata: {
        previous_plan: currentPlan,
        new_plan: targetPlan,
        tokens_lost: tokenLoss,
        cancelled_at: new Date().toISOString(),
      },
    });

    console.log(`✅ Plan cancelled for user ${userId}: ${currentPlan} → ${targetPlan}${tokenLoss > 0 ? ` (lost ${tokenLoss} tokens)` : ''}`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        previousPlan: currentPlan,
        newPlan: targetPlan,
        previousTokens: currentTokens,
        newTokens: newTokenBalance,
        tokensLost: tokenLoss,
        message: targetPlan === 'free'
          ? 'Freeプランに戻りました'
          : 'スタンダードプランにダウングレードしました',
      }),
    };

  } catch (error: any) {
    console.error('Unexpected error in cancel-plan:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: error.message || 'Internal server error',
      }),
    };
  }
};
