import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OpenAIAssistant {
  id: string;
  name: string;
  instructions: string;
  model: string;
  tools: any[];
  tool_resources?: any;
}

interface OpenAIVectorStore {
  id: string;
  name: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get the user
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      throw new Error('Not authenticated')
    }

    // Check if user is SuperAdmin
    const { data: membership } = await supabaseClient
      .from('memberships')
      .select('is_superadmin')
      .eq('user_id', user.id)
      .eq('is_superadmin', true)
      .single()

    if (!membership) {
      throw new Error('Access denied: SuperAdmin required')
    }

    const { action, ...payload } = await req.json()
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')

    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured')
    }

    const openaiHeaders = {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    }

    let result;

    switch (action) {
      case 'create_client_setup':
        result = await createClientSetup(payload, openaiHeaders, supabaseClient)
        break
      
      case 'create_organization_setup':
        result = await createOrganizationSetup(payload, openaiHeaders, supabaseClient)
        break
      
      case 'create_assistant':
        result = await createAssistant(payload, openaiHeaders)
        break
      
      case 'create_vector_store':
        result = await createVectorStore(payload, openaiHeaders)
        break
      
      case 'upload_file':
        result = await uploadFile(payload, openaiHeaders)
        break
      
      case 'score_call':
        result = await scoreCall(payload, openaiHeaders, supabaseClient)
        break
      
      case 'update_assistant_model':
        result = await updateAssistantModel(payload, openaiHeaders)
        break
      
      default:
        throw new Error(`Unknown action: ${action}`)
    }

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})

/**
 * Create complete client setup (assistant + vector store)
 */
async function createClientSetup(
  { clientId, clientName }: { clientId: string; clientName: string },
  openaiHeaders: Record<string, string>,
  supabaseClient: any
) {
  // Create vector store
  const vectorStoreResponse = await fetch('https://api.openai.com/v1/vector_stores', {
    method: 'POST',
    headers: openaiHeaders,
    body: JSON.stringify({
      name: `${clientName} Knowledge Base`
    })
  })

  if (!vectorStoreResponse.ok) {
    throw new Error('Failed to create vector store')
  }

  const vectorStore = await vectorStoreResponse.json() as OpenAIVectorStore

  // Create assistant
  const assistantResponse = await fetch('https://api.openai.com/v1/assistants', {
    method: 'POST',
    headers: openaiHeaders,
    body: JSON.stringify({
      name: `${clientName} Bridge Selling Coach`,
      instructions: `You are a Bridge Selling expert coach for ${clientName}. You evaluate sales calls based on the Bridge Selling methodology, providing detailed feedback and scores for each step. Always respond with structured JSON as requested.`,
      model: 'gpt-4-turbo',
      tools: [{ type: 'file_search' }],
      tool_resources: {
        file_search: {
          vector_store_ids: [vectorStore.id]
        }
      }
    })
  })

  if (!assistantResponse.ok) {
    throw new Error('Failed to create assistant')
  }

  const assistant = await assistantResponse.json() as OpenAIAssistant

  // Update client record with OpenAI IDs
  const { error } = await supabaseClient
    .from('clients')
    .update({
      openai_assistant_id: assistant.id,
      openai_vector_store_id: vectorStore.id
    })
    .eq('id', clientId)

  if (error) {
    throw new Error('Failed to update client record')
  }

  return {
    assistantId: assistant.id,
    vectorStoreId: vectorStore.id,
    clientId
  }
}

/**
 * Create complete organization setup (assistant + vector store) 
 */
async function createOrganizationSetup(
  { organizationId, organizationName }: { organizationId: string; organizationName: string },
  openaiHeaders: Record<string, string>,
  supabaseClient: any
) {
  // Create vector store
  const vectorStoreResponse = await fetch('https://api.openai.com/v1/vector_stores', {
    method: 'POST',
    headers: openaiHeaders,
    body: JSON.stringify({
      name: `${organizationName} Knowledge Base`
    })
  })

  if (!vectorStoreResponse.ok) {
    throw new Error('Failed to create vector store')
  }

  const vectorStore = await vectorStoreResponse.json() as OpenAIVectorStore

  // Create assistant
  const assistantResponse = await fetch('https://api.openai.com/v1/assistants', {
    method: 'POST',
    headers: openaiHeaders,
    body: JSON.stringify({
      name: `${organizationName} Bridge Selling Coach`,
      instructions: `You are a Bridge Selling expert coach for ${organizationName}. You evaluate sales calls based on the Bridge Selling methodology, providing detailed feedback and scores for each step. Always respond with structured JSON as requested.`,
      model: 'gpt-4o',
      tools: [{ type: 'file_search' }],
      tool_resources: {
        file_search: {
          vector_store_ids: [vectorStore.id]
        }
      }
    })
  })

  if (!assistantResponse.ok) {
    throw new Error('Failed to create assistant')
  }

  const assistant = await assistantResponse.json() as OpenAIAssistant

  // Update organization record with OpenAI IDs
  const { error } = await supabaseClient
    .from('organizations')
    .update({
      openai_assistant_id: assistant.id,
      openai_vector_store_id: vectorStore.id
    })
    .eq('id', organizationId)

  if (error) {
    throw new Error('Failed to update organization record')
  }

  return {
    assistantId: assistant.id,
    vectorStoreId: vectorStore.id,
    organizationId
  }
}

/**
 * Create OpenAI Assistant
 */
async function createAssistant(
  { name, instructions, vectorStoreId }: { name: string; instructions: string; vectorStoreId?: string },
  openaiHeaders: Record<string, string>
) {
  const response = await fetch('https://api.openai.com/v1/assistants', {
    method: 'POST',
    headers: openaiHeaders,
    body: JSON.stringify({
      name,
      instructions,
      model: 'gpt-4-turbo',
      tools: vectorStoreId ? [{ type: 'file_search' }] : [],
      tool_resources: vectorStoreId ? {
        file_search: {
          vector_store_ids: [vectorStoreId]
        }
      } : undefined
    })
  })

  if (!response.ok) {
    throw new Error('Failed to create assistant')
  }

  return await response.json()
}

/**
 * Create Vector Store
 */
async function createVectorStore(
  { name }: { name: string },
  openaiHeaders: Record<string, string>
) {
  const response = await fetch('https://api.openai.com/v1/vector_stores', {
    method: 'POST',
    headers: openaiHeaders,
    body: JSON.stringify({ name })
  })

  if (!response.ok) {
    throw new Error('Failed to create vector store')
  }

  return await response.json()
}

/**
 * Upload file to vector store
 */
async function uploadFile(
  { fileData, fileName, vectorStoreId }: { fileData: string; fileName: string; vectorStoreId: string },
  openaiHeaders: Record<string, string>
) {
  // First upload file to OpenAI
  const formData = new FormData()
  const fileBlob = new Blob([atob(fileData)], { type: 'application/octet-stream' })
  formData.append('file', fileBlob, fileName)
  formData.append('purpose', 'assistants')

  const uploadResponse = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      'Authorization': openaiHeaders.Authorization
    },
    body: formData
  })

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload file')
  }

  const uploadedFile = await uploadResponse.json()

  // Add file to vector store
  const vectorStoreResponse = await fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/files`, {
    method: 'POST',
    headers: openaiHeaders,
    body: JSON.stringify({
      file_id: uploadedFile.id
    })
  })

  if (!vectorStoreResponse.ok) {
    throw new Error('Failed to add file to vector store')
  }

  return {
    fileId: uploadedFile.id,
    vectorStoreFileId: (await vectorStoreResponse.json()).id
  }
}

/**
 * Score a call using organization's assistant
 */
async function scoreCall(
  { transcript, organizationId, clientId }: { transcript: string; organizationId?: string; clientId?: string },
  openaiHeaders: Record<string, string>,
  supabaseClient: any
) {
  let organization;
  
  // Handle both legacy client-based and new organization-based scoring
  if (organizationId) {
    // New organization-based scoring
    const { data: org, error } = await supabaseClient
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .single()

    if (error || !org) {
      throw new Error('Organization not found')
    }

    if (!org.openai_assistant_id) {
      throw new Error('Organization does not have an OpenAI assistant configured')
    }

    organization = org;
  } else if (clientId) {
    // Legacy client-based scoring
    const { data: client, error } = await supabaseClient
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single()

    if (error || !client) {
      throw new Error('Client not found')
    }

    if (!client.openai_assistant_id) {
      throw new Error('Client does not have an OpenAI assistant configured')
    }

    organization = client;
  } else {
    throw new Error('Either organizationId or clientId must be provided')
  }

  const bridgeSteps = organization.bridge_steps as any[]
  const stepScores = []

  // Score each step individually
  for (const step of bridgeSteps.sort((a, b) => a.order - b.order)) {
    const stepScore = await scoreIndividualStep(
      transcript,
      step,
      organization.name,
      organization.openai_assistant_id,
      openaiHeaders
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
    organization.name,
    organization.openai_assistant_id,
    openaiHeaders
  )

  return {
    total,
    stepScores,
    coaching,
    organizationId: organizationId || clientId,
    assistantId: organization.openai_assistant_id,
    scoredAt: new Date().toISOString()
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
  openaiHeaders: Record<string, string>
) {
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
    coachingThreadId: thread.id, // For debugging purposes
    coachingRunId: run.id // For debugging purposes
  }
}

/**
 * Score individual step
 */
async function scoreIndividualStep(
  transcript: string,
  step: any,
  clientName: string,
  assistantId: string,
  openaiHeaders: Record<string, string>
) {
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
    openaiThreadId: thread.id, // For debugging purposes
    openaiRunId: run.id // For debugging purposes
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

/**
 * Update Assistant Model
 */
async function updateAssistantModel(
  { assistantId, model }: { assistantId: string; model: string },
  openaiHeaders: Record<string, string>
) {
  const response = await fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
    method: 'POST',
    headers: openaiHeaders,
    body: JSON.stringify({
      model: model
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to update assistant model: ${errorText}`)
  }

  const updatedAssistant = await response.json()
  
  return {
    assistantId: updatedAssistant.id,
    model: updatedAssistant.model,
    success: true
  }
}