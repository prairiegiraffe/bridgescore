import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { scoreCall, updateCallWithScore } from '../lib/callScoring';
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

      // Get the org ID for scoring
      let orgId: string;
      if (currentOrg) {
        orgId = currentOrg.id;
      } else {
        // Fallback: get the user's first org
        const { data: membership } = await (supabase as any)
          .from('memberships')
          .select('org_id')
          .eq('user_id', user.id)
          .single();
        
        if (membership?.org_id) {
          orgId = membership.org_id;
        } else {
          // If no org, use a default org ID or create a personal org
          orgId = user.id; // Use user ID as a fallback org ID
        }
      }

      // Score the call (will use OpenAI if configured)
      const scoreResult = await scoreCall({
        callId: call.id,
        transcript: data.transcript,
        orgId,
        userId: user.id
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