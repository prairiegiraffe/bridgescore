import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    
    // Handle transcription requests
    if (contentType.includes('multipart/form-data')) {
      console.log('Processing audio transcription request');
      
      const formData = await req.formData();
      const action = formData.get('action') as string;
      
      if (action === 'transcribe_audio') {
        const audioFile = formData.get('audio') as File;
        if (!audioFile) {
          throw new Error('No audio file provided');
        }
        
        console.log(`Transcribing file: ${audioFile.name}, size: ${audioFile.size} bytes`);
        
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
        if (!openaiApiKey) {
          throw new Error('OpenAI API key not configured');
        }
        
        // Call OpenAI Whisper API
        const whisperFormData = new FormData();
        whisperFormData.append('file', audioFile);
        whisperFormData.append('model', 'whisper-1');
        whisperFormData.append('response_format', 'text');
        whisperFormData.append('language', 'en');
        
        const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
          },
          body: whisperFormData
        });
        
        console.log(`Whisper API status: ${whisperResponse.status}`);
        
        if (!whisperResponse.ok) {
          const errorText = await whisperResponse.text();
          console.error(`Whisper API error: ${errorText}`);
          throw new Error(`Whisper API failed (${whisperResponse.status}): ${errorText}`);
        }
        
        const transcription = await whisperResponse.text();
        console.log(`Transcription successful: ${transcription.length} characters`);
        
        return new Response(
          JSON.stringify({
            transcription: transcription.trim(),
            fileName: audioFile.name,
            fileSize: audioFile.size,
            success: true
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          },
        );
      }
    }
    
    // Handle JSON requests (call scoring)
    const requestData = await req.json();
    const action = requestData.action;
    
    if (action === 'score_call') {
      console.log('Processing call scoring request');
      
      const { transcript, organizationId } = requestData;
      
      if (!transcript) {
        throw new Error('No transcript provided for scoring');
      }
      
      const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }
      
      // Get organization info
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        {
          global: {
            headers: { Authorization: req.headers.get('Authorization')! },
          },
        }
      );
      
      const { data: org, error: orgError } = await supabaseClient
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .single();

      if (orgError || !org) {
        throw new Error('Organization not found');
      }

      if (!org.openai_assistant_id) {
        throw new Error('Organization does not have an OpenAI assistant configured');
      }
      
      console.log(`Scoring call for organization: ${org.name}`);
      
      const bridgeSteps = org.bridge_steps as any[]
      const stepScores = []

      // Score each step individually
      for (const step of bridgeSteps.sort((a, b) => a.order - b.order)) {
        const stepScore = await scoreIndividualStep(
          transcript,
          step,
          org.name,
          org.openai_assistant_id,
          openaiApiKey
        )
        stepScores.push(stepScore)
      }

      // Calculate total score
      const total = Math.round(
        stepScores.reduce((sum, score) => sum + (score.weight * score.credit), 0)
      )

      // Generate coaching based on the scores
      const coaching = await generateCoaching(
        transcript,
        stepScores,
        org.name,
        org.openai_assistant_id,
        openaiApiKey
      )

      const score = {
        total,
        stepScores,
        coaching,
        organizationId: organizationId,
        assistantId: org.openai_assistant_id,
        scoredAt: new Date().toISOString()
      };
      
      console.log('Call scoring completed');
      
      return new Response(
        JSON.stringify(score),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }
    
    if (action === 'create_organization_setup') {
      console.log('Processing organization setup creation request');
      
      const { organizationId, organizationName } = requestData;
      
      if (!organizationId || !organizationName) {
        throw new Error('Missing organizationId or organizationName');
      }
      
      const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }
      
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      
      // Create OpenAI assistant
      console.log(`Creating assistant for organization: ${organizationName}`);
      const assistantResponse = await fetch('https://api.openai.com/v1/assistants', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({
          name: `${organizationName} Sales Assistant`,
          instructions: `You are a sales coaching assistant for ${organizationName}. Your role is to analyze sales call transcripts and provide detailed feedback based on the Bridge Selling methodology. 

Bridge Selling focuses on these key steps:
1. Pinpoint Pain - Identify the prospect's specific pain points and challenges
2. Qualify - Determine if the prospect is a good fit (budget, authority, need, timeline)
3. Build Trust & Rapport - Establish credibility and connection
4. Present Solution - Show how your solution addresses their specific needs
5. Handle Objections - Address concerns and objections professionally
6. Close or Schedule Next Steps - Move the process forward with commitment

For each transcript, you should:
- Analyze how well the salesperson executed each Bridge Selling step
- Provide specific examples from the conversation
- Give actionable coaching advice
- Score each step based on effectiveness
- Highlight what they did well and areas for improvement

Be constructive, specific, and focused on helping the salesperson improve their performance using Bridge Selling techniques.`,
          model: 'gpt-4o-mini',
          temperature: 0.1
        })
      });
      
      if (!assistantResponse.ok) {
        const error = await assistantResponse.text();
        throw new Error(`Failed to create assistant: ${error}`);
      }
      
      const assistant = await assistantResponse.json();
      console.log(`Created assistant: ${assistant.id}`);
      
      // Create vector store
      console.log(`Creating vector store for organization: ${organizationName}`);
      const vectorStoreResponse = await fetch('https://api.openai.com/v1/vector_stores', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({
          name: `${organizationName} Knowledge Base`
        })
      });
      
      if (!vectorStoreResponse.ok) {
        const error = await vectorStoreResponse.text();
        throw new Error(`Failed to create vector store: ${error}`);
      }
      
      const vectorStore = await vectorStoreResponse.json();
      console.log(`Created vector store: ${vectorStore.id}`);
      
      // Update organization with OpenAI IDs
      const { error: updateError } = await supabase
        .from('organizations')
        .update({
          openai_assistant_id: assistant.id,
          openai_vector_store_id: vectorStore.id,
          openai_model: 'gpt-4o-mini'
        })
        .eq('id', organizationId);
      
      if (updateError) {
        console.error('Failed to update organization:', updateError);
        throw new Error(`Failed to update organization: ${updateError.message}`);
      }
      
      console.log(`Successfully created OpenAI setup for ${organizationName}`);
      
      return new Response(
        JSON.stringify({
          success: true,
          assistantId: assistant.id,
          vectorStoreId: vectorStore.id,
          organizationId
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }
    
    // Handle other requests
    throw new Error('Unsupported request type');
    
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})

/**
 * Score individual step
 */
async function scoreIndividualStep(
  transcript: string,
  step: any,
  clientName: string,
  assistantId: string,
  openaiApiKey: string
) {
  const openaiHeaders = {
    'Authorization': `Bearer ${openaiApiKey}`,
    'Content-Type': 'application/json',
    'OpenAI-Beta': 'assistants=v2'
  }

  // Create thread
  const threadResponse = await fetch('https://api.openai.com/v1/threads', {
    method: 'POST',
    headers: openaiHeaders,
    body: JSON.stringify({})
  })

  const thread = await threadResponse.json()

  // Create message
  const prompt = buildStepPrompt(step, clientName, transcript)
  
  await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
    method: 'POST',
    headers: openaiHeaders,
    body: JSON.stringify({
      role: 'user',
      content: prompt
    })
  })

  // Create run
  const runResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
    method: 'POST',
    headers: openaiHeaders,
    body: JSON.stringify({
      assistant_id: assistantId
    })
  })

  const run = await runResponse.json()

  // Wait for completion
  let runStatus = run
  while (runStatus.status !== 'completed') {
    if (['failed', 'cancelled', 'expired'].includes(runStatus.status)) {
      throw new Error(`Run ${runStatus.status}`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    const statusResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
      headers: openaiHeaders
    })
    runStatus = await statusResponse.json()
  }

  // Get messages
  const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
    headers: openaiHeaders
  })
  
  const messages = await messagesResponse.json()
  const assistantMessage = messages.data.find((msg: any) => msg.role === 'assistant')
  
  if (!assistantMessage) {
    throw new Error('No assistant response')
  }

  const rawResponse = assistantMessage.content[0].text.value
  const scoreData = parseStepResponse(rawResponse)

  return {
    step: step.key,
    stepName: step.name,
    weight: step.weight,
    credit: scoreData.credit,
    color: scoreData.color,
    notes: scoreData.notes,
    reasoning: scoreData.reasoning,
    threadId: thread.id,
    runId: run.id,
    openaiThreadId: thread.id,
    openaiRunId: run.id
  }
}

/**
 * Generate coaching based on call scores
 */
async function generateCoaching(
  transcript: string,
  stepScores: any[],
  organizationName: string,
  assistantId: string,
  openaiApiKey: string
) {
  const openaiHeaders = {
    'Authorization': `Bearer ${openaiApiKey}`,
    'Content-Type': 'application/json',
    'OpenAI-Beta': 'assistants=v2'
  }

  // Create thread for coaching
  const threadResponse = await fetch('https://api.openai.com/v1/threads', {
    method: 'POST',
    headers: openaiHeaders,
    body: JSON.stringify({})
  })

  const thread = await threadResponse.json()

  // Build coaching prompt
  const scoresText = stepScores.map(score => 
    `${score.stepName}: ${score.credit} (${score.color}) - ${score.notes}`
  ).join('\n')

  const prompt = `You are a Bridge Selling expert coach for ${organizationName}. 

Based on this call transcript and scoring results, provide coaching feedback:

CALL TRANSCRIPT:
${transcript}

SCORING RESULTS:
${scoresText}

Please provide coaching in this JSON format:
{
  "thingsTheyDidWell": [
    "Specific thing they did well #1",
    "Specific thing they did well #2", 
    "Specific thing they did well #3"
  ],
  "areasForImprovement": [
    {
      "area": "Specific area they could improve",
      "howToImprove": "Specific actionable advice for improvement",
      "bridgeStep": "Which Bridge Selling step this relates to"
    },
    {
      "area": "Another area for improvement",
      "howToImprove": "More specific actionable advice",
      "bridgeStep": "Related Bridge Selling step"
    },
    {
      "area": "Third area for improvement", 
      "howToImprove": "Additional actionable advice",
      "bridgeStep": "Related Bridge Selling step"
    }
  ]
}

Focus on specific, actionable feedback based on the Bridge Selling methodology.`

  // Create message
  await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
    method: 'POST',
    headers: openaiHeaders,
    body: JSON.stringify({
      role: 'user',
      content: prompt
    })
  })

  // Create run
  const runResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
    method: 'POST',
    headers: openaiHeaders,
    body: JSON.stringify({
      assistant_id: assistantId
    })
  })

  const run = await runResponse.json()

  // Wait for completion
  let runStatus = run
  while (runStatus.status !== 'completed') {
    if (['failed', 'cancelled', 'expired'].includes(runStatus.status)) {
      throw new Error(`Coaching run ${runStatus.status}`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    const statusResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
      headers: openaiHeaders
    })
    runStatus = await statusResponse.json()
  }

  // Get messages
  const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
    headers: openaiHeaders
  })
  
  const messages = await messagesResponse.json()
  const assistantMessage = messages.data.find((msg: any) => msg.role === 'assistant')
  
  if (!assistantMessage) {
    throw new Error('No coaching response')
  }

  const rawResponse = assistantMessage.content[0].text.value
  const parsedCoaching = parseCoachingResponse(rawResponse)
  
  return {
    ...parsedCoaching,
    coachingThreadId: thread.id,
    coachingRunId: run.id
  }
}

function buildStepPrompt(step: any, clientName: string, transcript: string): string {
  const customPrompt = step.customPrompt || getDefaultStepPrompt(step.key)
  
  return `You are a Bridge Selling expert scoring sales calls for ${clientName}.

STEP TO EVALUATE: ${step.name} (Weight: ${step.weight})

SCORING CRITERIA:
${customPrompt}

RESPONSE FORMAT:
Please respond with a JSON object in this exact format:
{
  "credit": <0, 0.5, or 1>,
  "color": "<green, yellow, or red>",
  "notes": "<brief summary for scorecard>",
  "reasoning": "<detailed explanation of your scoring decision>"
}

CALL TRANSCRIPT:
${transcript}

Score only the "${step.name}" step. Provide your assessment in the JSON format above.`
}

function getDefaultStepPrompt(stepKey: string): string {
  const defaultPrompts: Record<string, string> = {
    pinpoint_pain: `Look for evidence that the salesperson identified and explored the customer's pain points:
- Did they ask discovery questions about problems/challenges?
- Did they dig deeper into the pain to understand impact?
- Did they quantify the cost of the problem?
Score: 1 = Excellent pain discovery, 0.5 = Some pain discussion, 0 = No meaningful pain discovery`,

    qualify: `Evaluate if the salesperson qualified the prospect on Budget, Authority, and Timeline:
- Budget: Did they discuss investment/cost expectations?
- Authority: Did they identify decision makers?
- Timeline: Did they establish when a decision needs to be made?
Score: 1 = All 3 areas covered, 0.5 = 2 areas covered, 0 = 1 or no areas covered`,

    solution_success: `Assess how well the salesperson presented their solution:
- Did they connect features to the customer's specific pain?
- Did they provide relevant case studies or success stories?
- Did they focus on outcomes and benefits?
Score: 1 = Strong solution presentation with proof, 0.5 = Basic solution presentation, 0 = Weak or no solution presentation`,

    qa: `Evaluate how the salesperson handled questions and objections:
- Did they encourage questions?
- Did they address concerns thoroughly?
- Did they use questions to better understand objections?
Score: 1 = Excellent Q&A handling, 0.5 = Adequate handling, 0 = Poor or no Q&A`,

    next_steps: `Look for clear next steps and mutual commitment:
- Did they propose specific next steps?
- Did they get commitment from the prospect?
- Are the next steps actionable and time-bound?
Score: 1 = Clear, committed next steps, 0.5 = Some next steps discussed, 0 = No clear next steps`,

    close_or_schedule: `Evaluate the closing attempt or scheduling of follow-up:
- Did they attempt to close or advance the sale?
- Did they schedule a specific follow-up meeting?
- Did they create urgency or momentum?
Score: 1 = Strong close attempt or specific scheduling, 0.5 = Some closing effort, 0 = No closing attempt`
  }

  return defaultPrompts[stepKey] || 'Evaluate this step of the Bridge Selling process.'
}

function parseStepResponse(rawResponse: string) {
  try {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }
    
    const parsed = JSON.parse(jsonMatch[0])
    
    if (typeof parsed.credit !== 'number' || ![0, 0.5, 1].includes(parsed.credit)) {
      throw new Error('Invalid credit value')
    }
    
    if (!['green', 'yellow', 'red'].includes(parsed.color)) {
      throw new Error('Invalid color value')
    }
    
    return {
      credit: parsed.credit,
      color: parsed.color,
      notes: parsed.notes || 'No notes provided',
      reasoning: parsed.reasoning || 'No reasoning provided'
    }
    
  } catch (error) {
    throw new Error('Invalid response format from assistant')
  }
}

function parseCoachingResponse(rawResponse: string) {
  try {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in coaching response')
    }
    
    const parsed = JSON.parse(jsonMatch[0])
    
    return {
      thingsTheyDidWell: parsed.thingsTheyDidWell || [],
      areasForImprovement: parsed.areasForImprovement || []
    }
    
  } catch (error) {
    console.error('Error parsing coaching response:', error)
    return {
      thingsTheyDidWell: ['Analysis completed'],
      areasForImprovement: [
        {
          area: 'Technical error in coaching analysis',
          howToImprove: 'Please try rescoring the call or contact support',
          bridgeStep: 'System'
        }
      ]
    }
  }
}