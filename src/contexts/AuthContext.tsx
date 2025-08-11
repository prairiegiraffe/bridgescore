import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: any | null;
  session: any | null;
  loading: boolean;
  signInWithOtp: (email: string) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    (supabase.auth as any).getSession().then(({ data: { session } }: any) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = (supabase.auth as any).onAuthStateChange((_event: any, session: any) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithOtp = async (email: string) => {
    // Use the current domain (works for both localhost and production)
    const redirectTo = `${window.location.origin}/dashboard`;
    
    return await (supabase.auth as any).signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });
  };

  const signOut = async () => {
    return await (supabase.auth as any).signOut();
  };

  const value: AuthContextType = {
    user,
    session,
    loading,
    signInWithOtp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}