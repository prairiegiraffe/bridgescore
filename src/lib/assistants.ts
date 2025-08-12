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
 * First checks org settings default, then falls back to is_active flag
 * Returns null if no active version is found
 */
export async function getActiveAssistantVersion(orgId: string): Promise<AssistantVersion | null> {
  try {
    // First check if org has a default assistant version set
    try {
      const { data: orgConfig } = await (supabase as any)
        .from('org_ai_configs')
        .select(`
          default_assistant_version_id,
          default_assistant_version:ai_assistant_versions(*)
        `)
        .eq('org_id', orgId)
        .single();

      if (orgConfig?.default_assistant_version) {
        return orgConfig.default_assistant_version;
      }
    } catch (err) {
      console.warn('org_ai_configs table not available:', err);
    }

    // Fall back to the is_active flag for backwards compatibility
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
      console.warn('ai_assistant_versions table not available:', err);
      return null;
    }
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
    console.warn('Assistant versions not available:', err);
    return [];
  }
}