import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface Organization {
  id: string;
  name: string;
  demo_mode?: boolean;
  role: string;
  is_superadmin?: boolean;
  openai_assistant_id?: string;
  openai_vector_store_id?: string;
}

interface OrgContextType {
  organizations: Organization[];
  currentOrg: Organization | null;
  setCurrentOrg: (org: Organization | null) => void;
  loading: boolean;
  error: string | null;
}

const OrgContext = createContext<OrgContextType | undefined>(undefined);

export function OrgProvider({ children }: { children: ReactNode }) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchOrganizations();
    } else {
      setOrganizations([]);
      setCurrentOrg(null);
      setLoading(false);
    }
  }, [user]);

  const fetchOrganizations = async () => {
    try {
      setLoading(true);
      setError(null);

      // First check if user is SuperAdmin
      const { data: superAdminCheck, error: superAdminError } = await (supabase as any)
        .from('memberships')
        .select('is_superadmin')
        .eq('user_id', user?.id)
        .limit(1)
        .single();

      const isSuperAdmin = superAdminCheck?.is_superadmin || false;
      console.log('User is SuperAdmin:', isSuperAdmin);

      if (isSuperAdmin) {
        // SuperAdmins can see ALL organizations
        const { data: allOrgs, error: allOrgsError } = await (supabase as any)
          .from('organizations')
          .select('id, name, demo_mode, openai_assistant_id, openai_vector_store_id')
          .order('name');

        if (allOrgsError) throw allOrgsError;

        // Get user's actual role in each organization (for display purposes)
        const { data: userMemberships } = await (supabase as any)
          .from('memberships')
          .select('org_id, role, is_superadmin')
          .eq('user_id', user?.id);

        const membershipMap = new Map(
          userMemberships?.map((m: any) => [m.org_id, { role: m.role, is_superadmin: m.is_superadmin }]) || []
        );

        const orgs = allOrgs?.map((org: any) => ({
          id: org.id,
          name: org.name,
          demo_mode: org.demo_mode,
          role: membershipMap.get(org.id)?.role || 'superadmin',
          is_superadmin: membershipMap.get(org.id)?.is_superadmin || true,
          openai_assistant_id: org.openai_assistant_id,
          openai_vector_store_id: org.openai_vector_store_id,
        })) || [];

        console.log('SuperAdmin - All organizations:', orgs);
        setOrganizations(orgs);

        // Auto-select first org if none selected
        if (orgs.length > 0 && !currentOrg) {
          setCurrentOrg(orgs[0]);
        }
      } else {
        // Regular users only see their member organizations
        const { data, error: fetchError } = await (supabase as any)
          .from('memberships')
          .select(`
            role,
            is_superadmin,
            organization:organizations(
              id,
              name,
              demo_mode,
              openai_assistant_id,
              openai_vector_store_id
            )
          `)
          .eq('user_id', user?.id);

        if (fetchError) throw fetchError;

        console.log('Regular user - Fetched memberships:', data);
        
        const orgs = data?.map((membership: any) => ({
          id: membership.organization.id,
          name: membership.organization.name,
          demo_mode: membership.organization.demo_mode,
          role: membership.role,
          is_superadmin: membership.is_superadmin,
          openai_assistant_id: membership.organization.openai_assistant_id,
          openai_vector_store_id: membership.organization.openai_vector_store_id,
        })) || [];

        console.log('Regular user - Processed orgs:', orgs);
        setOrganizations(orgs);
        
        // Auto-select first org if none selected
        if (orgs.length > 0 && !currentOrg) {
          setCurrentOrg(orgs[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching organizations:', err);
      setError('Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  const value: OrgContextType = {
    organizations,
    currentOrg,
    setCurrentOrg,
    loading,
    error,
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const context = useContext(OrgContext);
  if (context === undefined) {
    throw new Error('useOrg must be used within an OrgProvider');
  }
  return context;
}