import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { scoreCall, updateCallWithScore } from '../lib/newCallScoring';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';

export interface SubmitCallData {
  title: string;
  transcript: string;
}

export function useCallSubmission() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const { currentOrg } = useOrg();

  const submitCall = async (data: SubmitCallData) => {
    if (!user) {
      setError('You must be logged in to submit a call');
      return null;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Create the call record first
      const { data: call, error: insertError } = await (supabase as any)
        .from('calls')
        .insert({
          user_id: user.id,
          title: data.title,
          transcript: data.transcript,
          status: 'processing'
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Score the call (will use OpenAI if client is configured)
      const scoreResult = await scoreCall({
        callId: call.id,
        transcript: data.transcript,
        userId: user.id,
        orgId: currentOrg?.id
      });

      // Update the call with the score
      await updateCallWithScore(call.id, scoreResult);

      return call.id;
    } catch (err) {
      console.error('Error submitting call:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit call');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    submitCall,
    isSubmitting,
    error
  };
}