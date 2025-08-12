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
 * Rescore a call (for backwards compatibility with existing system)
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

    // Score the call with the new system
    const result = await scoreCall({
      callId,
      transcript: call.transcript,
      userId: call.user_id
    });

    // Update the call with the new score
    await updateCallWithScore(callId, result);

    return result;
  } catch (error) {
    console.error('Error rescoring call:', error);
    throw error;
  }
}