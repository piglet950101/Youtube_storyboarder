
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User, PlanTier, FREE_INITIAL_TOKENS, STRIPE_PRICING } from '../types';

interface AuthContextType {
  user: User | null;
  login: () => Promise<void>;
  logout: () => void;
  upgradeToPlan: (tier: 'pro_standard' | 'pro_premium') => void;
  purchaseTokens: () => void;
  consumeTokens: (amount: number) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<User | null>(null);
  const userRef = useRef<User | null>(null);

  // Wrapper to sync state and ref
  const setUser = (newUser: User | null) => {
    setUserState(newUser);
    userRef.current = newUser;
  };

  // Load user from local storage on mount (Simulation)
  useEffect(() => {
    const saved = localStorage.getItem('cinegen_user');
    if (saved) {
      setUser(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem('cinegen_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('cinegen_user');
    }
  }, [user]);

  const login = async () => {
    // Simulate Google Login
    // For a new user simulation, we give them the initial free tokens.
    // In a real app, we would check DB if user exists.
    const mockUser: User = {
      uid: 'user_123',
      displayName: 'テスト ユーザー',
      email: 'user@example.com',
      photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
      plan: 'free',
      tokens: FREE_INITIAL_TOKENS, // One-time grant
    };
    setUser(mockUser);
  };

  const logout = () => {
    setUser(null);
  };

  const upgradeToPlan = (tier: 'pro_standard' | 'pro_premium') => {
    if (!userRef.current) return;
    const currentUser = userRef.current;
    
    let grantTokens = 0;
    let maxCap = Infinity;

    if (tier === 'pro_standard') {
        grantTokens = STRIPE_PRICING.standard.initialTokens;
        maxCap = STRIPE_PRICING.standard.maxTokens;
    }
    if (tier === 'pro_premium') {
        grantTokens = STRIPE_PRICING.premium.initialTokens;
        maxCap = STRIPE_PRICING.premium.maxTokens;
    }

    // Calculate new total respecting the cap
    const currentTokens = currentUser.tokens;
    const potentialTotal = currentTokens + grantTokens;
    const finalTotal = Math.min(potentialTotal, maxCap);
    const actualAdded = finalTotal - currentTokens;

    setUser({ ...currentUser, plan: tier, tokens: finalTotal }); 
    
    let message = `${tier === 'pro_standard' ? 'スタンダード' : 'プレミアム'}プランにアップグレードしました！`;
    if (actualAdded < grantTokens) {
        message += `\n(保有上限 ${maxCap.toLocaleString()}t に達したため、${actualAdded.toLocaleString()}t のみが付与されました)`;
    } else {
        message += `\n${grantTokens.toLocaleString()}トークンが付与されました。`;
    }
    alert(message);
  };

  const purchaseTokens = () => {
    if (!userRef.current || userRef.current.plan === 'free') return;
    const currentUser = userRef.current;

    let addedTokens = 0;
    let cost = 0;
    let maxCap = Infinity;

    if (currentUser.plan === 'pro_standard') {
      addedTokens = STRIPE_PRICING.standard.topUp.tokens;
      cost = STRIPE_PRICING.standard.topUp.price;
      maxCap = STRIPE_PRICING.standard.maxTokens;
    } else if (currentUser.plan === 'pro_premium') {
      addedTokens = STRIPE_PRICING.premium.topUp.tokens;
      cost = STRIPE_PRICING.premium.topUp.price;
      maxCap = STRIPE_PRICING.premium.maxTokens;
    }

    const currentTokens = currentUser.tokens;
    const potentialTotal = currentTokens + addedTokens;
    const finalTotal = Math.min(potentialTotal, maxCap);
    const actualAdded = finalTotal - currentTokens;

    if (actualAdded === 0) {
        alert(`保有上限 (${maxCap.toLocaleString()}t) に達しているため、これ以上購入できません。`);
        return;
    }

    setUser({ ...currentUser, tokens: finalTotal });
    
    let message = `${cost}円でトークンを購入しました！`;
    if (actualAdded < addedTokens) {
        message += `\n(保有上限により ${actualAdded.toLocaleString()}t がチャージされました)`;
    } else {
        message += `\n+${addedTokens.toLocaleString()}t`;
    }
    alert(message);
  };

  const consumeTokens = (amount: number): boolean => {
    // Critical Fix: Use userRef to access the most up-to-date state immediately
    // This prevents stale closure issues during async batch loops
    if (!userRef.current) return false;

    if (userRef.current.tokens >= amount) {
        const newTokens = userRef.current.tokens - amount;
        const updatedUser = { ...userRef.current, tokens: newTokens };
        setUser(updatedUser); // Update both state and ref
        return true;
    }
    return false;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      upgradeToPlan, 
      purchaseTokens,
      consumeTokens
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
