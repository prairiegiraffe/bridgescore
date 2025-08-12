import OpenAI from 'openai';
import type { BridgeSellingScore } from './scoring';

let openaiClient: OpenAI | null = null;

export function getOpenAIClient(apiKey: string): OpenAI {
  if (!openaiClient || openaiClient.apiKey !== apiKey) {
    openaiClient = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true
    });
  }
  return openaiClient;
}

export interface OpenAIAssistantConfig {
  assistantId: string;
  apiKey: string;
}

export interface OpenAIScoreResult {
  score: BridgeSellingScore;
  rawResponse: string;
  threadId: string;
  runId: string;
}

export async function scoreCallWithOpenAIAssistant(
  transcript: string,
  config: OpenAIAssistantConfig
): Promise<OpenAIScoreResult> {
  const openai = getOpenAIClient(config.apiKey);

  try {
    // Create a thread
    const thread = await openai.beta.threads.create();

    // Add the transcript as a message
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: `Please score the following sales call transcript using the Bridge Selling methodology. 
      
Provide scores for each of the 6 steps:
1. Pinpoint Pain (weight: 5) - Did they identify and explore the customer's pain points?
2. Qualify (weight: 3) - Did they qualify budget, authority, and timeline?
3. Solution Success (weight: 3) - Did they present the solution with success stories?
4. Q&A (weight: 3) - Did they handle questions and objections well?
5. Next Steps (weight: 3) - Did they establish clear next steps?
6. Close or Schedule (weight: 3) - Did they attempt to close or schedule follow-up?

For each step, provide:
- credit: 1 (full credit), 0.5 (partial credit), or 0 (no credit)
- color: "green" (full credit), "yellow" (partial), or "red" (no credit)
- notes: Brief explanation of the score

Return the response in JSON format like this:
{
  "total": <calculated total 0-20>,
  "pinpoint_pain": {
    "weight": 5,
    "credit": <0, 0.5, or 1>,
    "color": "<green, yellow, or red>",
    "notes": "<explanation>"
  },
  "qualify": {
    "weight": 3,
    "credit": <0, 0.5, or 1>,
    "color": "<green, yellow, or red>",
    "notes": "<explanation>"
  },
  "solution_success": {
    "weight": 3,
    "credit": <0, 0.5, or 1>,
    "color": "<green, yellow, or red>",
    "notes": "<explanation>"
  },
  "qa": {
    "weight": 3,
    "credit": <0, 0.5, or 1>,
    "color": "<green, yellow, or red>",
    "notes": "<explanation>"
  },
  "next_steps": {
    "weight": 3,
    "credit": <0, 0.5, or 1>,
    "color": "<green, yellow, or red>",
    "notes": "<explanation>"
  },
  "close_or_schedule": {
    "weight": 3,
    "credit": <0, 0.5, or 1>,
    "color": "<green, yellow, or red>",
    "notes": "<explanation>"
  }
}

Transcript:
${transcript}`
    });

    // Create a run with the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: config.assistantId
    });

    // Wait for the run to complete
    let runStatus = await openai.beta.threads.runs.retrieve(run.id, { thread_id: thread.id });
    
    while (runStatus.status !== 'completed') {
      if (runStatus.status === 'failed' || runStatus.status === 'cancelled' || runStatus.status === 'expired') {
        throw new Error(`Assistant run ${runStatus.status}: ${runStatus.last_error?.message || 'Unknown error'}`);
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(run.id, { thread_id: thread.id });
    }

    // Get the assistant's response
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data.find(msg => msg.role === 'assistant');
    
    if (!assistantMessage || !assistantMessage.content[0] || assistantMessage.content[0].type !== 'text') {
      throw new Error('No response from assistant');
    }

    const rawResponse = assistantMessage.content[0].text.value;

    // Parse the JSON response
    let scoreData: BridgeSellingScore;
    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      scoreData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse assistant response:', rawResponse);
      throw new Error('Invalid response format from assistant');
    }

    // Validate the response structure
    validateScoreStructure(scoreData);

    return {
      score: scoreData,
      rawResponse,
      threadId: thread.id,
      runId: run.id
    };
  } catch (error) {
    console.error('Error scoring with OpenAI Assistant:', error);
    throw error;
  }
}

function validateScoreStructure(score: any): asserts score is BridgeSellingScore {
  const requiredFields = ['total', 'pinpoint_pain', 'qualify', 'solution_success', 'qa', 'next_steps', 'close_or_schedule'];
  const stepFields = ['weight', 'credit', 'color', 'notes'];
  
  for (const field of requiredFields) {
    if (!(field in score)) {
      throw new Error(`Missing required field: ${field}`);
    }
    
    if (field !== 'total') {
      for (const stepField of stepFields) {
        if (!(stepField in score[field])) {
          throw new Error(`Missing required field in ${field}: ${stepField}`);
        }
      }
      
      // Validate credit values
      if (![0, 0.5, 1].includes(score[field].credit)) {
        throw new Error(`Invalid credit value in ${field}: ${score[field].credit}`);
      }
      
      // Validate color values
      if (!['green', 'yellow', 'red'].includes(score[field].color)) {
        throw new Error(`Invalid color value in ${field}: ${score[field].color}`);
      }
    }
  }
  
  // Validate total is a number
  if (typeof score.total !== 'number') {
    throw new Error('Total must be a number');
  }
}

export async function testOpenAIConnection(apiKey: string): Promise<boolean> {
  try {
    const openai = getOpenAIClient(apiKey);
    // Try to list assistants to verify the API key works
    await openai.beta.assistants.list({ limit: 1 });
    return true;
  } catch (error) {
    console.error('OpenAI connection test failed:', error);
    return false;
  }
}

export async function listOpenAIAssistants(apiKey: string): Promise<Array<{ id: string; name: string | null }>> {
  try {
    const openai = getOpenAIClient(apiKey);
    const assistants = await openai.beta.assistants.list({ limit: 100 });
    return assistants.data.map(assistant => ({
      id: assistant.id,
      name: assistant.name
    }));
  } catch (error) {
    console.error('Failed to list OpenAI assistants:', error);
    throw error;
  }
}