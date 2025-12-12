import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, PlanTier } from '../types';
import { supabase } from '../services/supabaseClient';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  loginWithGoogle: () => Promise<void>;
  signupWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  upgradeToPlan: (tier: 'pro_standard' | 'pro_premium') => Promise<void>;
  purchaseTokens: (amount: number) => Promise<void>;
  consumeTokens: (amount: number) => boolean;
  refreshTokenBalance: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUserProfile = async (userId: string) => {
    try {
      console.log('[Auth] Loading profile for user:', userId);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile loading timeout (15s)')), 15000)
      );

      const profilePromise = supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      const { data, error: profileError } = await Promise.race([
        profilePromise,
        timeoutPromise as any,
      ]);

      if (profileError) throw profileError;

      if (!data) throw new Error('User profile not found');

      console.log('[Auth] Profile loaded successfully');

      setUser({
        uid: data.id,
        displayName: data.display_name || 'User',
        email: data.email,
        photoURL: data.photo_url || '',
        plan: (data.plan_tier || 'free') as PlanTier,
        tokens: data.token_balance || 100,
      });

      setError(null);
    } catch (err) {
      console.error('[Auth] Error loading profile:', err);
      const message = err instanceof Error ? err.message : 'Failed to load profile';
      setError(message);
    }
  };

  const refreshUserTokenBalance = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('token_balance, plan_tier')
        .eq('id', userId)
        .single();

      if (error || !data) {
        console.error('[Auth] Error refreshing token balance:', error);
        return;
      }

      setUser((prev) =>
        prev
          ? {
              ...prev,
              tokens: data.token_balance || 0,
              plan: (data.plan_tier || 'free') as PlanTier,
            }
          : null
      );
    } catch (err) {
      console.error('[Auth] Error refreshing token balance:', err);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (data.session) {
          setSession(data.session);
          await loadUserProfile(data.session.user.id);
        }
      } catch (err) {
        console.error('Auth init error:', err);
        setError(err instanceof Error ? err.message : 'Auth initialization failed');
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session) => {
      if (session) {
        setSession(session);
        setLoading(true);
        try {
          await loadUserProfile(session.user.id);
        } catch (err) {
          console.error('[Auth] Profile load failed:', err);
        } finally {
          setLoading(false);
        }
      } else {
        setSession(null);
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const loginWithGoogle = async () => {
    setLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signInError) throw signInError;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ログインに失敗しました';
      setError(message);
      setLoading(false);
      throw err;
    }
  };

  const signupWithEmail = async (email: string, password: string, displayName: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            full_name: displayName,
          },
        },
      });

      if (signUpError) throw signUpError;

      if (!authData.user) throw new Error('Signup failed: No user returned');

      if (!authData.session) {
        setError('確認メールを送信しました。メールボックスをご確認ください。');
        setLoading(false);
        return;
      }

      setSession(authData.session);
      await loadUserProfile(authData.user.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'サインアップに失敗しました';
      setError(message);
      setLoading(false);
      throw err;
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      if (!data.session) throw new Error('No session returned');

      setSession(data.session);
      await loadUserProfile(data.user.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ログインに失敗しました';
      setError(message);
      setLoading(false);
      throw err;
    }
  };

  const logout = async () => {
    setLoading(true);

    try {
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) throw signOutError;

      setSession(null);
      setUser(null);
      setError(null);
    } catch (err) {
      console.error('Logout error:', err);
      setError(err instanceof Error ? err.message : 'ログアウトに失敗しました');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const upgradeToPlan = async (tier: 'pro_standard' | 'pro_premium'): Promise<void> => {
    try {
      if (!session) throw new Error('User not authenticated');

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/billing/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ planId: tier }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Checkout failed');
      }

      const data = await response.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'プラン変更に失敗しました';
      setError(message);
      throw err;
    }
  };

  const purchaseTokens = async (amount: number): Promise<void> => {
    try {
      if (!session) throw new Error('User not authenticated');

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/billing/token-topup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ amount }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Purchase failed');
      }

      const data = await response.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'トークン購入に失敗しました';
      setError(message);
      throw err;
    }
  };

  const consumeTokens = (amount: number): boolean => {
    if (!user || user.tokens < amount) {
      return false;
    }

    setUser(prev => (prev ? { ...prev, tokens: prev.tokens - amount } : null));
    return true;
  };

  const refreshTokenBalance = async () => {
    if (!user) return;
    await refreshUserTokenBalance(user.uid);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        error,
        loginWithGoogle,
        signupWithEmail,
        loginWithEmail,
        logout,
        upgradeToPlan,
        purchaseTokens,
        consumeTokens,
        refreshTokenBalance,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
