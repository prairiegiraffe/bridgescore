import { supabase } from './supabase';
import { scoreBridgeSelling, type BridgeSellingScore } from './scoring';
import { scoreCallWithOpenAIAssistant, type OpenAIAssistantConfig } from './openai';
import { getActiveAssistantVersion } from './assistants';

export interface ScoreCallOptions {
  callId: string;
  transcript: string;
  orgId: string;
  userId: string;
  assistantVersionId?: string;
}

export interface ScoreCallResult {
  score: BridgeSellingScore;
  scoringMethod: 'local' | 'openai';
  assistantVersionId?: string;
  openaiThreadId?: string;
  openaiRunId?: string;
  openaiRawResponse?: string;
}

/**
 * Score a call using either local scoring or OpenAI Assistant
 */
export async function scoreCall(options: ScoreCallOptions): Promise<ScoreCallResult> {
  const { transcript, orgId, assistantVersionId } = options;

  try {
    // Get the assistant version to use
    let assistantVersion;
    if (assistantVersionId) {
      // Fetch specific assistant version
      const { data, error } = await (supabase as any)
        .from('ai_assistant_versions')
        .select('*')
        .eq('id', assistantVersionId)
        .single();
      
      if (error) throw error;
      assistantVersion = data;
    } else {
      // Get the active assistant version for the org
      assistantVersion = await getActiveAssistantVersion(orgId);
    }

    // Check if we should use OpenAI
    if (assistantVersion?.use_openai && assistantVersion?.openai_assistant_id) {
      // Get the org's OpenAI API key
      const { data: orgConfig, error: configError } = await (supabase as any)
        .from('org_ai_configs')
        .select('openai_api_key, openai_enabled')
        .eq('org_id', orgId)
        .single();

      if (configError) {
        console.warn('Could not fetch org config:', configError);
        // Fall back to local scoring
        return scoreLocally(transcript, assistantVersion?.id);
      }

      if (orgConfig?.openai_enabled && orgConfig?.openai_api_key) {
        try {
          // Score with OpenAI
          const openAIConfig: OpenAIAssistantConfig = {
            assistantId: assistantVersion.openai_assistant_id,
            apiKey: orgConfig.openai_api_key
          };

          const openAIResult = await scoreCallWithOpenAIAssistant(transcript, openAIConfig);

          return {
            score: openAIResult.score,
            scoringMethod: 'openai',
            assistantVersionId: assistantVersion.id,
            openaiThreadId: openAIResult.threadId,
            openaiRunId: openAIResult.runId,
            openaiRawResponse: openAIResult.rawResponse
          };
        } catch (openAIError) {
          console.error('OpenAI scoring failed, falling back to local:', openAIError);
          // Fall back to local scoring if OpenAI fails
          return scoreLocally(transcript, assistantVersion?.id);
        }
      }
    }

    // Use local scoring
    return scoreLocally(transcript, assistantVersion?.id);
  } catch (error) {
    console.error('Error in scoreCall:', error);
    // Fall back to local scoring on any error
    return scoreLocally(transcript);
  }
}

/**
 * Score a call using local heuristic scoring
 */
function scoreLocally(transcript: string, assistantVersionId?: string): ScoreCallResult {
  const score = scoreBridgeSelling(transcript);
  
  return {
    score,
    scoringMethod: 'local',
    assistantVersionId
  };
}

/**
 * Update a call with new scoring results
 */
export async function updateCallWithScore(callId: string, result: ScoreCallResult) {
  try {
    const updateData: any = {
      score_total: result.score.total,
      score_breakdown: result.score,
      scoring_method: result.scoringMethod,
      assistant_version_id: result.assistantVersionId || null,
      status: 'scored'
    };

    // Add OpenAI-specific fields if applicable
    if (result.scoringMethod === 'openai') {
      updateData.openai_thread_id = result.openaiThreadId || null;
      updateData.openai_run_id = result.openaiRunId || null;
      updateData.openai_raw_response = result.openaiRawResponse || null;
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
 * Rescore a call with a specific assistant version
 */
export async function rescoreCall(callId: string, assistantVersionId: string) {
  try {
    // Fetch the call data
    const { data: call, error: fetchError } = await (supabase as any)
      .from('calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (fetchError) throw fetchError;
    if (!call) throw new Error('Call not found');

    // Get org ID from the call's user
    const { data: userData, error: userError } = await (supabase as any)
      .from('memberships')
      .select('org_id')
      .eq('user_id', call.user_id)
      .single();

    if (userError) throw userError;
    if (!userData) throw new Error('User organization not found');

    // Score the call with the specified assistant version
    const result = await scoreCall({
      callId,
      transcript: call.transcript,
      orgId: userData.org_id,
      userId: call.user_id,
      assistantVersionId
    });

    // Update the call with the new score
    await updateCallWithScore(callId, result);

    // Log the rescoring action
    try {
      await (supabase as any)
        .from('call_rescore_audit')
        .insert({
          call_id: callId,
          old_score: call.score_total,
          new_score: result.score.total,
          old_assistant_version_id: call.assistant_version_id,
          new_assistant_version_id: assistantVersionId,
          rescored_by: (await supabase.auth.getUser()).data?.user?.id
        });
    } catch (auditError) {
      console.warn('Could not log rescore audit:', auditError);
    }

    return result;
  } catch (error) {
    console.error('Error rescoring call:', error);
    throw error;
  }
}