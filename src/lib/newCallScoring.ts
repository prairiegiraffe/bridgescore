import { supabase } from './supabase';
import { scoreBridgeSelling, type BridgeSellingScore } from './scoring';
import { scoreCallWithClient, type FullCallScore } from './openai-api';

export interface ScoreCallOptions {
  callId: string;
  transcript: string;
  userId: string;
  orgId?: string; // Optional, will be looked up if not provided
}

export interface ScoreCallResult {
  score: BridgeSellingScore | FullCallScore;
  scoringMethod: 'local' | 'openai';
  clientId?: string;
  assistantId?: string;
}

/**
 * Score a call using either local scoring or client's OpenAI Assistant
 */
export async function scoreCall(options: ScoreCallOptions): Promise<ScoreCallResult> {
  const { transcript, userId, orgId } = options;

  try {
    // Get the user's organization and client
    let currentOrgId = orgId;
    
    if (!currentOrgId) {
      const { data: membership, error } = await (supabase as any)
        .from('memberships')
        .select('org_id')
        .eq('user_id', userId)
        .single();

      if (error || !membership) {
        throw new Error('User organization not found');
      }
      
      currentOrgId = membership.org_id;
    }

    // Get the organization's client
    const { data: org, error: orgError } = await (supabase as any)
      .from('organizations')
      .select(`
        client_id,
        client:clients(*)
      `)
      .eq('id', currentOrgId)
      .single();

    if (orgError) {
      console.warn('Could not fetch organization client:', orgError);
      return scoreLocally(transcript);
    }

    // If organization has a client with OpenAI setup, use OpenAI scoring
    if (org?.client?.openai_assistant_id) {
      try {
        const openAIResult = await scoreCallWithClient(transcript, org.client.id);
        
        return {
          score: openAIResult,
          scoringMethod: 'openai',
          clientId: org.client.id,
          assistantId: org.client.openai_assistant_id
        };
        
      } catch (openAIError) {
        console.error('OpenAI scoring failed, falling back to local:', openAIError);
        return scoreLocally(transcript);
      }
    }

    // Fall back to local scoring
    return scoreLocally(transcript);
    
  } catch (error) {
    console.error('Error in scoreCall:', error);
    return scoreLocally(transcript);
  }
}

/**
 * Score a call using local heuristic scoring
 */
function scoreLocally(transcript: string): ScoreCallResult {
  const score = scoreBridgeSelling(transcript);
  
  return {
    score,
    scoringMethod: 'local'
  };
}

/**
 * Convert OpenAI FullCallScore to BridgeSellingScore format for backwards compatibility
 */
function convertOpenAIToBridgeScore(openAIScore: FullCallScore): BridgeSellingScore {
  const bridgeScore: any = {
    total: openAIScore.total
  };

  // Convert step scores to bridge score format
  openAIScore.stepScores.forEach(stepScore => {
    bridgeScore[stepScore.step] = {
      weight: stepScore.weight,
      credit: stepScore.credit,
      color: stepScore.color,
      notes: stepScore.notes
    };
  });

  return bridgeScore as BridgeSellingScore;
}

/**
 * Update a call with new scoring results
 */
export async function updateCallWithScore(callId: string, result: ScoreCallResult) {
  try {
    let updateData: any = {
      status: 'scored'
    };

    if (result.scoringMethod === 'openai' && 'stepScores' in result.score) {
      // OpenAI scoring result
      const openAIScore = result.score as FullCallScore;
      const bridgeScore = convertOpenAIToBridgeScore(openAIScore);
      
      updateData = {
        ...updateData,
        score_total: openAIScore.total,
        score_breakdown: bridgeScore,
        scoring_method: 'openai',
        client_id: result.clientId,
        openai_thread_id: openAIScore.stepScores[0]?.threadId, // Store first thread ID as reference
        openai_run_id: openAIScore.stepScores[0]?.runId,
        openai_raw_response: JSON.stringify(openAIScore.stepScores) // Store all step details
      };
    } else {
      // Local scoring result
      const bridgeScore = result.score as BridgeSellingScore;
      
      updateData = {
        ...updateData,
        score_total: bridgeScore.total,
        score_breakdown: bridgeScore,
        scoring_method: 'local'
      };
    }

    const { error } = await (supabase as any)
      .from('calls')
      .update(updateData)
      .eq('id', callId);

    if (error) throw error;
    
    return true;
  } catch (error) {
    console.error('Error updating call with score:', error);
    throw error;
  }
}

/**
 * Rescore a call using the new OpenAI scoring system
 */
export async function rescoreCall(callId: string) {
  try {
    // Fetch the call data
    const { data: call, error: fetchError } = await (supabase as any)
      .from('calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (fetchError) throw fetchError;
    if (!call) throw new Error('Call not found');

    // If call doesn't have organization_id, try to get it from user's membership
    let organizationId = call.organization_id;
    
    if (!organizationId && call.user_id) {
      const { data: membership, error: membershipError } = await (supabase as any)
        .from('memberships')
        .select('org_id')
        .eq('user_id', call.user_id)
        .single();
      
      if (!membershipError && membership) {
        organizationId = membership.org_id;
        
        // Update the call with the organization_id for future use
        await (supabase as any)
          .from('calls')
          .update({ organization_id: organizationId })
          .eq('id', callId);
      }
    }

    if (!organizationId) {
      throw new Error('Could not determine organization for this call');
    }

    // Get the organization for this call
    const { data: org, error: orgError } = await (supabase as any)
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .single();

    if (orgError || !org) {
      throw new Error(`Organization not found: ${orgError?.message || 'Unknown error'}`);
    }

    // Check if organization has OpenAI configured
    if (!org.openai_assistant_id) {
      throw new Error('Organization does not have OpenAI assistant configured');
    }

    // Get session for API call
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No session');

    // Call the OpenAI Edge Function to rescore
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-operations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'score_call',
          transcript: call.transcript,
          organizationId: org.id
        })
      }
    );

    const result = await response.json();
    
    if (!response.ok || result.error) {
      throw new Error(result.error || 'Failed to rescore call with OpenAI');
    }

    // Update the call with the new score
    const { error: updateError } = await (supabase as any)
      .from('calls')
      .update({
        score_total: result.total,
        score_breakdown: result.stepScores,
        coaching: result.coaching,
        openai_raw_response: result,
        scoring_method: 'openai',
        status: 'scored'
      })
      .eq('id', callId);

    if (updateError) throw updateError;

    return result;
  } catch (error) {
    console.error('Error rescoring call:', error);
    throw error;
  }
}