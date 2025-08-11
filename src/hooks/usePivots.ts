import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Pivot {
  id: string;
  step_key: string;
  prompt: string;
  created_at: string;
}

export function usePivots(stepKey?: string) {
  const [pivots, setPivots] = useState<Pivot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPivots();
  }, [stepKey]);

  const fetchPivots = async () => {
    try {
      setLoading(true);
      setError(null);

      let query = (supabase as any).from('pivots').select('*');
      
      if (stepKey) {
        query = query.eq('step_key', stepKey);
      }
      
      const { data, error: fetchError } = await query.order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      setPivots(data || []);
    } catch (err) {
      console.error('Error fetching pivots:', err);
      setError('Failed to load coaching suggestions');
    } finally {
      setLoading(false);
    }
  };

  return { pivots, loading, error };
}