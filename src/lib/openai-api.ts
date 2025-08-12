import { supabase } from './supabase';

/**
 * Client-side service for OpenAI operations via Supabase Edge Functions
 */

export interface BridgeStep {
  key: string;
  name: string;
  weight: number;
  order: number;
  customPrompt?: string;
}

export interface StepScoreResult {
  step: string;
  stepName: string;
  weight: number;
  credit: 0 | 0.5 | 1;
  color: 'green' | 'yellow' | 'red';
  notes: string;
  reasoning: string;
  threadId: string;
  runId: string;
}

export interface FullCallScore {
  total: number;
  stepScores: StepScoreResult[];
  clientId: string;
  assistantId: string;
  scoredAt: string;
}

/**
 * Call the OpenAI operations edge function
 */
async function callOpenAIFunction(action: string, payload: any) {
  const { data, error } = await supabase.functions.invoke('openai-operations', {
    body: { action, ...payload }
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

/**
 * Create complete client setup (assistant + vector store)
 */
export async function createClientSetup(clientId: string, clientName: string) {
  return callOpenAIFunction('create_client_setup', { clientId, clientName });
}

/**
 * Create OpenAI Assistant
 */
export async function createAssistant(name: string, instructions: string, vectorStoreId?: string) {
  return callOpenAIFunction('create_assistant', { name, instructions, vectorStoreId });
}

/**
 * Create Vector Store
 */
export async function createVectorStore(name: string) {
  return callOpenAIFunction('create_vector_store', { name });
}

/**
 * Upload file to vector store
 */
export async function uploadFileToVectorStore(file: File, vectorStoreId: string) {
  // Convert file to base64
  const fileData = await fileToBase64(file);
  
  return callOpenAIFunction('upload_file', {
    fileData,
    fileName: file.name,
    vectorStoreId
  });
}

/**
 * Score a call using client's OpenAI assistant
 */
export async function scoreCallWithClient(transcript: string, clientId: string): Promise<FullCallScore> {
  return callOpenAIFunction('score_call', { transcript, clientId });
}

/**
 * Helper function to convert file to base64
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:application/pdf;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
  });
}

/**
 * Test OpenAI connection (for SuperAdmins)
 */
export async function testOpenAIConnection(): Promise<boolean> {
  try {
    await callOpenAIFunction('test_connection', {});
    return true;
  } catch (error) {
    console.error('OpenAI connection test failed:', error);
    return false;
  }
}