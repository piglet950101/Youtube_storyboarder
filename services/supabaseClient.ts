import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Prevent session refresh on window focus - this causes page reload issues
    flowType: 'pkce',
  },
  // Disable realtime subscriptions that cause reconnection issues
  realtime: {
    params: {
      eventsPerSecond: 1,
    },
  },
});
