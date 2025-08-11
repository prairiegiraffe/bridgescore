import { supabase } from './supabase';

export interface AssistantVersion {
  id: string;
  org_id: string;
  name: string;
  version: string;
  prompt_template: string;
  is_active: boolean;
  created_at: string;
}

/**
 * Get the active assistant version for an organization
 * Returns null if no active version is found
 */
export async function getActiveAssistantVersion(orgId: string): Promise<AssistantVersion | null> {
  try {
    const { data, error } = await (supabase as any)
      .from('ai_assistant_versions')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .single();

    if (error) {
      console.warn('No active assistant version found:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error fetching active assistant version:', err);
    return null;
  }
}

/**
 * Get all assistant versions for an organization
 */
export async function getAssistantVersions(orgId: string): Promise<AssistantVersion[]> {
  try {
    const { data, error } = await (supabase as any)
      .from('ai_assistant_versions')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching assistant versions:', err);
    return [];
  }
}