import React, { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Clapperboard, AlertCircle, Loader2, Eye, EyeOff, Mail, Lock, User as UserIcon, ArrowRight } from 'lucide-react';

type AuthMode = 'login' | 'signup';

interface FormState {
  email: string;
  password: string;
  displayName: string;
  confirmPassword: string;
}

interface FormErrors {
  email?: string;
  password?: string;
  displayName?: string;
  confirmPassword?: string;
}

export const LoginScreen: React.FC = () => {
  const { loginWithGoogle, signupWithEmail, loginWithEmail, loading, error } = useAuth();
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState('');

  const [formState, setFormState] = useState<FormState>({
    email: '',
    password: '',
    displayName: '',
    confirmPassword: '',
  });

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!formState.email.trim()) {
      errors.email = 'メールアドレスは必須です';
    } else if (!validateEmail(formState.email)) {
      errors.email = '有効なメールアドレスを入力してください';
    }

    if (!formState.password) {
      errors.password = 'パスワードは必須です';
    } else if (formState.password.length < 6) {
      errors.password = 'パスワードは6文字以上である必要があります';
    }

    if (authMode === 'signup') {
      if (!formState.displayName.trim()) {
        errors.displayName = '名前は必須です';
      } else if (formState.displayName.trim().length < 2) {
        errors.displayName = '名前は2文字以上である必要があります';
      }

      if (!formState.confirmPassword) {
        errors.confirmPassword = '確認用パスワードは必須です';
      } else if (formState.password !== formState.confirmPassword) {
        errors.confirmPassword = 'パスワードが一致しません';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({
      ...prev,
      [name]: value,
    }));
    if (formErrors[name as keyof FormErrors]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  const handleGoogleLogin = async () => {
    setIsProcessing(true);
    setSuccessMessage('');
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error('Google login error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsProcessing(true);
    setSuccessMessage('');

    try {
      await loginWithEmail(formState.email, formState.password);
    } catch (err) {
      console.error('Email login error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsProcessing(true);
    setSuccessMessage('');

    try {
      await signupWithEmail(formState.email, formState.password, formState.displayName);
      setSuccessMessage('アカウントが作成されました。ログインしています...');
      setTimeout(() => {
        setFormState({
          email: '',
          password: '',
          displayName: '',
          confirmPassword: '',
        });
      }, 1500);
    } catch (err) {
      console.error('Email signup error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // const toggleAuthMode = () => {
  //   setAuthMode(authMode === 'login' ? 'signup' : 'login');
  //   setFormState({
  //     email: '',
  //     password: '',
  //     displayName: '',
  //     confirmPassword: '',
  //   });
  //   setFormErrors({});
  //   setSuccessMessage('');
  // };

  const toggleAuthMode = useCallback(() => {
    setAuthMode(prev => prev === 'login' ? 'signup' : 'login');
    setFormState({
      email: '',
      password: '',
      displayName: '',
      confirmPassword: '',
    });
    setFormErrors({});
    setSuccessMessage('');
  }, []);

  const isFormDisabled = loading || isProcessing;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f0f0f] text-white p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center shadow-lg shadow-red-900/50">
            <Clapperboard size={40} className="text-white" />
          </div>
        </div>

        <h1 className="text-3xl font-black text-center mb-2">CineGen JP</h1>
        <p className="text-zinc-400 text-center mb-8 text-sm">
          YouTube特化型AI絵コンテ・画像生成ツール<br />
          プロフェッショナルな映像制作をサポート
        </p>

        <div className="flex gap-2 mb-8 bg-zinc-800 rounded-lg p-1">
          <button
            // onClick={() => !isFormDisabled && toggleAuthMode()}
            onClick={toggleAuthMode}
            disabled={isFormDisabled}
            className={`flex-1 py-2 px-4 rounded-md font-semibold transition-all ${
              authMode === 'login'
                ? 'bg-red-600 text-white'
                : 'bg-transparent text-zinc-400 hover:text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            ログイン
          </button>
          <button
            // onClick={() => !isFormDisabled && toggleAuthMode()}
            onClick={toggleAuthMode}
            disabled={isFormDisabled}
            className={`flex-1 py-2 px-4 rounded-md font-semibold transition-all ${
              authMode === 'signup'
                ? 'bg-red-600 text-white'
                : 'bg-transparent text-zinc-400 hover:text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            サインアップ
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-lg flex gap-3">
            <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-left">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 bg-green-900/20 border border-green-500/30 rounded-lg flex gap-3">
            <div className="text-left">
              <p className="text-xs text-green-300">{successMessage}</p>
            </div>
          </div>
        )}

        <form onSubmit={authMode === 'login' ? handleEmailLogin : handleEmailSignup} className="space-y-4 mb-6">
          {authMode === 'signup' && (
            <div>
              <label className="block text-sm font-medium mb-2 text-zinc-300">名前</label>
              <div className="relative">
                <UserIcon size={18} className="absolute left-3 top-3 text-zinc-500" />
                <input
                  type="text"
                  name="displayName"
                  value={formState.displayName}
                  onChange={handleInputChange}
                  disabled={isFormDisabled}
                  placeholder="山田太郎"
                  className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              {formErrors.displayName && (
                <p className="text-red-400 text-xs mt-1">{formErrors.displayName}</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2 text-zinc-300">メールアドレス</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-3 text-zinc-500" />
              <input
                type="email"
                name="email"
                value={formState.email}
                onChange={handleInputChange}
                disabled={isFormDisabled}
                placeholder="your@email.com"
                className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            {formErrors.email && (
              <p className="text-red-400 text-xs mt-1">{formErrors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-zinc-300">パスワード</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-3 text-zinc-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formState.password}
                onChange={handleInputChange}
                disabled={isFormDisabled}
                placeholder="••••••••"
                className="w-full pl-10 pr-12 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isFormDisabled}
                className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {formErrors.password && (
              <p className="text-red-400 text-xs mt-1">{formErrors.password}</p>
            )}
          </div>

          {authMode === 'signup' && (
            <div>
              <label className="block text-sm font-medium mb-2 text-zinc-300">パスワード確認</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-3 text-zinc-500" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formState.confirmPassword}
                  onChange={handleInputChange}
                  disabled={isFormDisabled}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-12 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={isFormDisabled}
                  className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {formErrors.confirmPassword && (
                <p className="text-red-400 text-xs mt-1">{formErrors.confirmPassword}</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isFormDisabled}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                処理中...
              </>
            ) : (
              <>
                {authMode === 'login' ? 'ログイン' : 'アカウント作成'}
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-700"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-zinc-900 text-zinc-500">または</span>
          </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={isFormDisabled}
          className="w-full bg-white hover:bg-zinc-200 text-black font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <>
              <Loader2 size={18} className="animate-spin" />
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Googleで{authMode === 'login' ? 'ログイン' : 'サインアップ'}
            </>
          )}
        </button>

        <p className="mt-6 text-xs text-zinc-600 text-center">
          アカウントの作成またはログインすることで、<br />
          利用規約とプライバシーポリシーに同意したことになります。
        </p>
      </div>
    </div>
  );
};
