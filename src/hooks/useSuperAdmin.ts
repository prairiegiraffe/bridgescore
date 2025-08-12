import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export function useSuperAdmin() {
  const { user } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSuperAdminStatus();
  }, [user]);

  const checkSuperAdminStatus = async () => {
    if (!user) {
      setIsSuperAdmin(false);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await (supabase as any)
        .from('memberships')
        .select('is_superadmin')
        .eq('user_id', user.id)
        .eq('is_superadmin', true)
        .single();

      setIsSuperAdmin(!!data && !error);
    } catch (err) {
      console.error('Error checking SuperAdmin status:', err);
      setIsSuperAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  return { isSuperAdmin, loading };
}