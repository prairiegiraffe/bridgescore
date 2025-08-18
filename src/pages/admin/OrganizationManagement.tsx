import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useBranding } from '../../contexts/BrandingContext';
import { supabase } from '../../lib/supabase';
import BridgeStepsEditor from '../../components/BridgeStepsEditor';

interface Organization {
  id: string;
  name: string;
  domain?: string;
  primary_color: string;
  secondary_color: string;
  bridge_steps: any[];
  openai_assistant_id?: string;
  openai_vector_store_id?: string;
  openai_model?: string;
  member_count: number;
  demo_mode?: boolean;
  created_at: string;
}

interface User {
  id: string;
  email: string;
  full_name?: string;
  role?: string;
  is_superadmin?: boolean;
  created_at: string;
  active?: boolean;
}

export default function OrganizationManagement() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { refreshBranding } = useBranding();
  
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgUsers, setSelectedOrgUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showOpenAIModal, setShowOpenAIModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [showBrandingModal, setShowBrandingModal] = useState(false);
  const [globalBranding, setGlobalBranding] = useState({
    app_name: 'BridgeScore',
    logo_url: '',
    favicon_url: '',
    primary_color: '#3B82F6',
    secondary_color: '#1E40AF',
    accent_color: '#10B981'
  });

  // User management state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showEditUserModal, setShowEditUserModal] = useState(false);

  useEffect(() => {
    checkSuperAdminAccess();
  }, [currentUser]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchOrganizations();
      fetchGlobalBranding();
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (selectedOrg) {
      fetchOrgUsers(selectedOrg.id);
    }
  }, [selectedOrg]);

  const checkSuperAdminAccess = async () => {
    if (!currentUser) {
      navigate('/dashboard');
      return;
    }

    try {
      const { data, error } = await (supabase as any)
        .from('memberships')
        .select('is_superadmin')
        .eq('user_id', currentUser.id)
        .eq('is_superadmin', true)
        .single();

      if (error || !data) {
        navigate('/dashboard');
        return;
      }

      setIsSuperAdmin(true);
    } catch (err) {
      console.error('Error checking SuperAdmin access:', err);
      navigate('/dashboard');
    }
  };

  const fetchOrganizations = async () => {
    setLoading(true);
    try {
      // First fetch from organization_details view for most data
      const { data: orgDetails, error: detailsError } = await (supabase as any)
        .from('organization_details')
        .select('*')
        .order('created_at', { ascending: false });

      if (detailsError) throw detailsError;
      
      // Then fetch demo_mode from organizations table directly
      const { data: orgSettings, error: settingsError } = await (supabase as any)
        .from('organizations')
        .select('id, demo_mode');
      
      if (settingsError) throw settingsError;
      
      // Merge the demo_mode into the organization details
      const mergedData = orgDetails?.map((org: any) => {
        const settings = orgSettings?.find((s: any) => s.id === org.id);
        return { ...org, demo_mode: settings?.demo_mode || false };
      }) || [];
      
      setOrganizations(mergedData);
      
      // Update selected org if it exists
      if (selectedOrg && mergedData.length > 0) {
        const updatedSelectedOrg = mergedData.find((org: any) => org.id === selectedOrg.id);
        if (updatedSelectedOrg) {
          setSelectedOrg(updatedSelectedOrg);
        }
      } else if (mergedData.length > 0 && !selectedOrg) {
        setSelectedOrg(mergedData[0]);
      }
    } catch (err) {
      console.error('Error fetching organizations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrgUsers = async (orgId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('membership_with_profiles')
        .select('*')
        .eq('org_id', orgId);

      if (error) throw error;
      
      const users = data?.map((row: any) => ({
        id: row.user_id,
        email: row.email,
        full_name: row.full_name,
        role: row.role,
        is_superadmin: row.is_superadmin,
        created_at: row.created_at,
        active: true // For now, assume all users are active - we can add this field later
      })) || [];

      setSelectedOrgUsers(users);
    } catch (err) {
      console.error('Error fetching organization users:', err);
      setSelectedOrgUsers([]);
    }
  };

  // User Management Functions
  const editUser = (user: User) => {
    setEditingUser(user);
    setShowEditUserModal(true);
  };

  const updateUser = async (userId: string, updates: { full_name?: string; role?: string }) => {
    try {
      console.log('Updating user:', userId, 'with updates:', updates);
      
      // Update user profile (try different approaches)
      if (updates.full_name !== undefined) {
        console.log('Updating full_name to:', updates.full_name);
        
        // Try updating auth.users first (if accessible)
        try {
          const { error: authError } = await (supabase as any)
            .from('auth.users')
            .update({ 
              raw_user_meta_data: { full_name: updates.full_name }
            })
            .eq('id', userId);
          
          if (authError) {
            console.log('Auth users update failed, trying profiles table:', authError);
            
            // Fallback to profiles table
            const { error: profileError } = await (supabase as any)
              .from('profiles')
              .upsert({ 
                id: userId, 
                full_name: updates.full_name 
              });
            
            if (profileError) {
              console.log('Profiles table update also failed:', profileError);
              // Don't throw error for full_name update failure - it's not critical
              console.warn('Could not update full name, but continuing with role update');
            }
          }
        } catch (profileErr) {
          console.warn('Profile update failed, but continuing:', profileErr);
        }
      }

      // Update membership role - this is the critical part
      if (updates.role !== undefined && selectedOrg) {
        console.log('Updating role to:', updates.role, 'for org:', selectedOrg.id);
        
        const { error: roleError, data: roleData } = await (supabase as any)
          .from('memberships')
          .update({ role: updates.role })
          .eq('user_id', userId)
          .eq('org_id', selectedOrg.id)
          .select();
        
        if (roleError) {
          console.error('Role update error details:', roleError);
          throw new Error(`Failed to update role: ${roleError.message || roleError.details || 'Database error'}`);
        }
        
        console.log('Role update successful:', roleData);
        
        if (!roleData || roleData.length === 0) {
          throw new Error('No membership record found to update. User may not be a member of this organization.');
        }
      }

      // Refresh users list
      if (selectedOrg) {
        console.log('Refreshing users list...');
        await fetchOrgUsers(selectedOrg.id);
      }

      setShowEditUserModal(false);
      setEditingUser(null);
      alert('User updated successfully!');
    } catch (err: any) {
      console.error('Error updating user:', err);
      
      // Provide more detailed error messages
      let errorMessage = 'Unknown error occurred';
      if (err?.message) {
        errorMessage = err.message;
      } else if (err?.error_description) {
        errorMessage = err.error_description;
      } else if (err?.details) {
        errorMessage = err.details;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      alert(`Failed to update user: ${errorMessage}`);
    }
  };

  const toggleUserActive = async (user: User) => {
    const newActiveStatus = !user.active;
    const action = newActiveStatus ? 'activate' : 'deactivate';
    
    if (!confirm(`Are you sure you want to ${action} ${user.email}?`)) {
      return;
    }

    try {
      // For now, we'll simulate this by updating a field or removing/adding membership
      // In a real implementation, you might have an 'active' field in memberships table
      
      if (newActiveStatus) {
        // Reactivate: ensure membership exists
        // This is a simplified approach - in real app you'd restore their previous role
        const { error } = await (supabase as any)
          .from('memberships')
          .upsert({
            user_id: user.id,
            org_id: selectedOrg?.id,
            role: user.role || 'member',
            is_superadmin: user.is_superadmin || false
          });
        if (error) throw error;
      } else {
        // Deactivate: remove membership (or set active: false if that field exists)
        const { error } = await (supabase as any)
          .from('memberships')
          .delete()
          .eq('user_id', user.id)
          .eq('org_id', selectedOrg?.id);
        if (error) throw error;
      }

      // Refresh users list
      if (selectedOrg) {
        await fetchOrgUsers(selectedOrg.id);
      }

      alert(`User ${action}d successfully!`);
    } catch (err) {
      console.error(`Error ${action}ing user:`, err);
      alert(`Failed to ${action} user: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const deleteUser = async (user: User) => {
    if (!confirm(`Are you sure you want to permanently delete ${user.email}? This action cannot be undone.`)) {
      return;
    }

    try {
      // Remove membership
      const { error: membershipError } = await (supabase as any)
        .from('memberships')
        .delete()
        .eq('user_id', user.id)
        .eq('org_id', selectedOrg?.id);
      if (membershipError) throw membershipError;

      // Note: We're not deleting the actual user account from auth.users
      // as that could affect other organizations they belong to
      // We're just removing them from this organization

      // Refresh users list
      if (selectedOrg) {
        await fetchOrgUsers(selectedOrg.id);
      }

      alert('User removed from organization successfully!');
    } catch (err) {
      console.error('Error deleting user:', err);
      alert(`Failed to delete user: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const createOrganization = async (orgData: {
    name: string;
    domain?: string;
    primary_color: string;
  }) => {
    try {
      const { error } = await (supabase as any)
        .rpc('create_organization_as_superadmin', {
          org_name: orgData.name,
          org_domain: orgData.domain,
          org_primary_color: orgData.primary_color
        });

      if (error) throw error;
      
      alert(`Organization "${orgData.name}" created successfully!`);
      await fetchOrganizations();
      setShowCreateOrgModal(false);
    } catch (err) {
      console.error('Error creating organization:', err);
      alert(`Failed to create organization: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const inviteUser = async (userData: {
    email: string;
    full_name: string;
    role: string;
    is_superadmin: boolean;
  }) => {
    if (!selectedOrg) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email: userData.email,
            full_name: userData.full_name,
            org_id: selectedOrg.id,
            role: userData.role,
            is_superadmin: userData.is_superadmin
          })
        }
      );

      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to send invitation');
      }

      alert(`Invitation sent to ${userData.email}!`);
      await fetchOrgUsers(selectedOrg.id);
      setShowInviteModal(false);
    } catch (err) {
      console.error('Error inviting user:', err);
      alert(`Failed to invite user: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const updateOpenAISettings = async (openaiData: {
    assistant_id: string;
    vector_store_id: string;
    model?: string;
  }) => {
    if (!selectedOrg) return;

    try {
      // Update the database with the new settings
      const { error } = await (supabase as any)
        .from('organizations')
        .update({
          openai_assistant_id: openaiData.assistant_id || null,
          openai_vector_store_id: openaiData.vector_store_id || null,
          openai_model: openaiData.model || null
        })
        .eq('id', selectedOrg.id);

      if (error) throw error;
      
      alert('OpenAI settings updated successfully!');
      await fetchOrganizations();
      setShowOpenAIModal(false);
    } catch (err) {
      console.error('Error updating OpenAI settings:', err);
      alert(`Failed to update OpenAI settings: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const toggleDemoMode = async (enabled: boolean) => {
    if (!selectedOrg) return;
    try {
      const { error } = await (supabase as any)
        .from('organizations')
        .update({ demo_mode: enabled })
        .eq('id', selectedOrg.id);

      if (error) throw error;
      
      // Update the selected org in state immediately for UI feedback
      setSelectedOrg({ ...selectedOrg, demo_mode: enabled });
      
      // Then fetch fresh data from database
      await fetchOrganizations();
      
      alert(`Demo mode ${enabled ? 'enabled' : 'disabled'} successfully for ${selectedOrg.name}!`);
    } catch (err) {
      console.error('Error updating demo mode:', err);
      alert(`Failed to update demo mode: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };


  const autoCreateOpenAI = async () => {
    if (!selectedOrg) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-operations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: 'create_organization_setup',
            organizationId: selectedOrg.id,
            organizationName: selectedOrg.name
          })
        }
      );

      const result = await response.json();
      
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to create OpenAI setup');
      }

      alert(`OpenAI setup created successfully!\nAssistant ID: ${result.assistantId}\nVector Store ID: ${result.vectorStoreId}`);
      await fetchOrganizations();
      setShowOpenAIModal(false);
    } catch (err) {
      console.error('Error auto-creating OpenAI setup:', err);
      alert(`Failed to auto-create OpenAI setup: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const fetchGlobalBranding = async () => {
    try {
      const { data, error } = await (supabase as any)
        .rpc('get_global_branding');

      if (error) throw error;
      
      if (data) {
        setGlobalBranding(data);
      }
    } catch (err) {
      console.error('Error fetching global branding:', err);
    }
  };

  const updateGlobalBranding = async (brandingData: any) => {
    if (!currentUser) return;

    try {
      const { error } = await (supabase as any)
        .rpc('update_global_branding', {
          new_settings: brandingData,
          updated_by_user: currentUser.id
        });

      if (error) throw error;
      
      alert('Global branding updated successfully!');
      await fetchGlobalBranding();
      await refreshBranding(); // Refresh branding context
      setShowBrandingModal(false);
    } catch (err) {
      console.error('Error updating global branding:', err);
      alert(`Failed to update branding: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-6 lg:py-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-6 lg:py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          Access denied. SuperAdmin privileges required.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-6 lg:py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Organization Management</h1>
        <p className="text-gray-500 mt-1">Manage organizations and their users</p>
      </div>

      {/* Global Branding Section */}
      <div className="mb-6">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Global App Branding</h2>
              <p className="text-sm text-gray-600 mt-1">Configure the app's logo, colors, and branding for all users</p>
            </div>
            <button
              onClick={() => setShowBrandingModal(true)}
              className="bg-purple-600 text-white px-4 py-2 rounded text-sm hover:bg-purple-700"
            >
              Edit Branding
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mt-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <h4 className="text-sm font-medium text-gray-700 mb-2">App Name</h4>
              <p className="text-lg font-semibold" style={{ color: globalBranding.primary_color }}>
                {globalBranding.app_name}
              </p>
            </div>
            
            <div className="p-4 border border-gray-200 rounded-lg">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Logo</h4>
              {globalBranding.logo_url ? (
                <img src={globalBranding.logo_url} alt="App Logo" className="h-8 w-auto" />
              ) : (
                <p className="text-sm text-gray-500">No logo set</p>
              )}
            </div>

            <div className="p-4 border border-gray-200 rounded-lg">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Favicon</h4>
              {globalBranding.favicon_url ? (
                <img src={globalBranding.favicon_url} alt="Favicon" className="h-8 w-8" />
              ) : (
                <p className="text-sm text-gray-500">No favicon set</p>
              )}
            </div>
            
            <div className="p-4 border border-gray-200 rounded-lg">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Primary Color</h4>
              <div className="flex items-center space-x-2">
                <div 
                  className="w-6 h-6 rounded border border-gray-300" 
                  style={{ backgroundColor: globalBranding.primary_color }}
                />
                <span className="text-sm font-mono">{globalBranding.primary_color}</span>
              </div>
            </div>
            
            <div className="p-4 border border-gray-200 rounded-lg">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Secondary Color</h4>
              <div className="flex items-center space-x-2">
                <div 
                  className="w-6 h-6 rounded border border-gray-300" 
                  style={{ backgroundColor: globalBranding.secondary_color }}
                />
                <span className="text-sm font-mono">{globalBranding.secondary_color}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Organizations List */}
        <div className="xl:col-span-1">
          <div className="bg-white shadow rounded-lg">
            <div className="p-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">Organizations</h2>
                <button
                  onClick={() => setShowCreateOrgModal(true)}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                >
                  Create
                </button>
              </div>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {organizations.map((org) => (
                <button
                  key={org.id}
                  onClick={() => setSelectedOrg(org)}
                  className={`w-full text-left p-4 hover:bg-gray-50 border-b border-gray-100 ${
                    selectedOrg?.id === org.id ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ backgroundColor: org.primary_color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{org.name}</div>
                      <div className="text-sm text-gray-500">
                        {org.member_count} members
                      </div>
                      {org.openai_assistant_id && (
                        <div className="text-xs text-green-600">✓ AI Enabled</div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              
              {organizations.length === 0 && (
                <div className="p-4 text-center text-gray-500">
                  No organizations yet
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Organization Details */}
        <div className="xl:col-span-2">
          {selectedOrg ? (
            <div className="space-y-6">
              {/* Organization Info */}
              <div className="bg-white shadow rounded-lg p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{selectedOrg.name}</h3>
                    {selectedOrg.domain && (
                      <p className="text-gray-500">{selectedOrg.domain}</p>
                    )}
                    <div className="flex items-center space-x-4 mt-2">
                      <div className="flex items-center space-x-2">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: selectedOrg.primary_color }}
                        />
                        <span className="text-sm text-gray-600">{selectedOrg.primary_color}</span>
                      </div>
                      {selectedOrg.openai_assistant_id && (
                        <div className="space-y-1">
                          <span className="text-sm text-green-600">✓ AI Assistant: {selectedOrg.openai_assistant_id.slice(0, 20)}...</span>
                          {selectedOrg.openai_model && (
                            <span className="text-sm text-blue-600 block">Model: {selectedOrg.openai_model}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingOrg(selectedOrg)}
                    className="text-indigo-600 hover:text-indigo-800 text-sm"
                  >
                    Edit Settings
                  </button>
                </div>
              </div>

              {/* OpenAI Settings */}
              <div className="bg-white shadow rounded-lg p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">OpenAI Integration</h3>
                    <p className="text-sm text-gray-500">Manage AI assistant and vector store for call scoring</p>
                  </div>
                  <button
                    onClick={() => setShowOpenAIModal(true)}
                    className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700"
                  >
                    Configure OpenAI
                  </button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">AI Assistant</h4>
                    {selectedOrg.openai_assistant_id ? (
                      <div>
                        <p className="text-sm text-green-600 font-mono break-all">
                          {selectedOrg.openai_assistant_id}
                        </p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 mt-2">
                          ✓ Configured
                        </span>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-gray-500">No assistant configured</p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 mt-2">
                          Not Configured
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Vector Store</h4>
                    {selectedOrg.openai_vector_store_id ? (
                      <div>
                        <p className="text-sm text-green-600 font-mono break-all">
                          {selectedOrg.openai_vector_store_id}
                        </p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 mt-2">
                          ✓ Configured
                        </span>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-gray-500">No vector store configured</p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 mt-2">
                          Not Configured
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">AI Model</h4>
                    {selectedOrg.openai_model ? (
                      <div>
                        <p className="text-sm text-green-600 font-medium">
                          {selectedOrg.openai_model}
                        </p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 mt-2">
                          ✓ Configured
                        </span>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-gray-500">Default model</p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 mt-2">
                          Using Default
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Demo Mode Settings */}
              <div className="bg-white shadow rounded-lg p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Team Dashboard Settings</h3>
                    <p className="text-sm text-gray-500">Configure how team performance data is displayed for {selectedOrg.name}</p>
                  </div>
                </div>
                
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700">Demo Mode</h4>
                      <p className="text-sm text-gray-500">Show demo data on Team page for client presentations</p>
                    </div>
                    <button
                      onClick={() => toggleDemoMode(!(selectedOrg.demo_mode || false))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        selectedOrg.demo_mode ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          selectedOrg.demo_mode ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  {selectedOrg.demo_mode && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center">
                        <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <div className="ml-3">
                          <p className="text-sm text-blue-800">
                            Demo mode is enabled. The Team page will show sample performance data for presentations.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Users Table */}
              <div className="bg-white shadow rounded-lg">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-900">Users</h3>
                    <button
                      onClick={() => setShowInviteModal(true)}
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                    >
                      Invite User
                    </button>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {selectedOrgUsers.map((user) => (
                        <tr key={user.id}>
                          <td className="px-4 py-3">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{user.email}</div>
                              {user.full_name && (
                                <div className="text-sm text-gray-500">{user.full_name}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {user.is_superadmin && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                  SuperAdmin
                                </span>
                              )}
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                {user.role}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              user.active 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {user.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {new Date(user.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => editUser(user)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                title="Edit user"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => toggleUserActive(user)}
                                className={`text-sm font-medium ${
                                  user.active 
                                    ? 'text-orange-600 hover:text-orange-800' 
                                    : 'text-green-600 hover:text-green-800'
                                }`}
                                title={user.active ? 'Deactivate user' : 'Activate user'}
                              >
                                {user.active ? 'Deactivate' : 'Activate'}
                              </button>
                              <button
                                onClick={() => deleteUser(user)}
                                className="text-red-600 hover:text-red-800 text-sm font-medium"
                                title="Remove user from organization"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {selectedOrgUsers.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No users in this organization yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white shadow rounded-lg p-8 text-center">
              <p className="text-gray-500">Select an organization to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Organization Modal */}
      {showCreateOrgModal && (
        <CreateOrganizationModal
          onClose={() => setShowCreateOrgModal(false)}
          onCreate={createOrganization}
        />
      )}

      {/* Invite User Modal */}
      {showInviteModal && selectedOrg && (
        <InviteUserModal
          organization={selectedOrg}
          onClose={() => setShowInviteModal(false)}
          onInvite={inviteUser}
        />
      )}

      {/* OpenAI Settings Modal */}
      {showOpenAIModal && selectedOrg && (
        <OpenAISettingsModal
          organization={selectedOrg}
          onClose={() => setShowOpenAIModal(false)}
          onUpdate={updateOpenAISettings}
          onAutoCreate={autoCreateOpenAI}
        />
      )}

      {/* Edit Organization Modal */}
      {editingOrg && (
        <BridgeStepsEditor 
          client={editingOrg as any}
          onClose={() => setEditingOrg(null)} 
          onUpdate={async () => {
            setEditingOrg(null);
            await fetchOrganizations();
          }}
          isOrganization={true}
        />
      )}

      {/* Global Branding Modal */}
      {showBrandingModal && (
        <GlobalBrandingModal
          branding={globalBranding}
          onClose={() => setShowBrandingModal(false)}
          onUpdate={updateGlobalBranding}
        />
      )}

      {/* Edit User Modal */}
      {showEditUserModal && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Edit User</h2>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const full_name = formData.get('full_name') as string;
              const role = formData.get('role') as string;
              updateUser(editingUser.id, { full_name, role });
            }}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    value={editingUser.email}
                    disabled
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Full Name</label>
                  <input
                    type="text"
                    name="full_name"
                    defaultValue={editingUser.full_name || ''}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter full name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Role</label>
                  <select
                    name="role"
                    defaultValue={editingUser.role || 'member'}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="member">Member (Sales Staff)</option>
                    <option value="manager">Manager (Organization Admin)</option>
                  </select>
                </div>

                {editingUser.is_superadmin && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <div className="flex items-center">
                      <svg className="w-5 h-5 text-purple-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm text-purple-700 font-medium">
                        This user is a SuperAdmin and has elevated system privileges.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditUserModal(false);
                    setEditingUser(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  Update User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// OpenAI Settings Modal
function OpenAISettingsModal({ organization, onClose, onUpdate, onAutoCreate }: {
  organization: Organization;
  onClose: () => void;
  onUpdate: (data: any) => void;
  onAutoCreate: () => void;
}) {
  const [assistantId, setAssistantId] = useState(organization.openai_assistant_id || '');
  const [vectorStoreId, setVectorStoreId] = useState(organization.openai_vector_store_id || '');
  const [selectedModel, setSelectedModel] = useState(organization.openai_model || 'gpt-4o-2024-11-20');
  const [saving, setSaving] = useState(false);
  const [autoCreating, setAutoCreating] = useState(false);

  // Available OpenAI models - organized by generation and capability
  const availableModels = [
    // Latest O-series Models (Reasoning Models)
    { id: 'o3-mini-2025-01-31', name: 'O3 Mini (2025-01-31)', description: 'Latest reasoning model, optimized for complex problem solving', category: 'O-Series' },
    { id: 'o3-mini', name: 'O3 Mini', description: 'Latest reasoning model, compact version', category: 'O-Series' },
    { id: 'o1-2024-12-17', name: 'O1 (2024-12-17)', description: 'Advanced reasoning model', category: 'O-Series' },
    { id: 'o1', name: 'O1', description: 'OpenAI reasoning model', category: 'O-Series' },
    
    // GPT-4.1 Series (Latest Generation)
    { id: 'gpt-4.1-2025-04-14', name: 'GPT-4.1 (2025-04-14)', description: 'Latest GPT-4.1 model with enhanced capabilities', category: 'GPT-4.1' },
    { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Next-generation GPT model', category: 'GPT-4.1' },
    { id: 'gpt-4.1-mini-2025-04-14', name: 'GPT-4.1 Mini (2025-04-14)', description: 'Compact GPT-4.1, faster and cost-effective', category: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: 'Efficient GPT-4.1 variant', category: 'GPT-4.1' },
    { id: 'gpt-4.1-nano-2025-04-14', name: 'GPT-4.1 Nano (2025-04-14)', description: 'Ultra-compact GPT-4.1, fastest response', category: 'GPT-4.1' },
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', description: 'Ultra-lightweight GPT-4.1', category: 'GPT-4.1' },
    
    // GPT-4o Series (Multimodal)
    { id: 'gpt-4o-2024-11-20', name: 'GPT-4o (2024-11-20) - Recommended', description: 'Latest multimodal model, best performance', category: 'GPT-4o' },
    { id: 'gpt-4o', name: 'GPT-4o', description: 'Multimodal GPT-4 optimized', category: 'GPT-4o' },
    { id: 'gpt-4o-2024-08-06', name: 'GPT-4o (2024-08-06)', description: 'Stable GPT-4o release', category: 'GPT-4o' },
    { id: 'gpt-4o-2024-05-13', name: 'GPT-4o (2024-05-13)', description: 'Initial GPT-4o release', category: 'GPT-4o' },
    { id: 'gpt-4o-mini-2024-07-18', name: 'GPT-4o Mini (2024-07-18)', description: 'Compact multimodal model', category: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Faster, more cost-effective multimodal', category: 'GPT-4o' },
    
    // GPT-4 Turbo Series
    { id: 'gpt-4-turbo-2024-04-09', name: 'GPT-4 Turbo (2024-04-09)', description: 'Latest GPT-4 Turbo with enhanced capabilities', category: 'GPT-4 Turbo' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'High-performance GPT-4 variant', category: 'GPT-4 Turbo' },
    { id: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo Preview', description: 'Preview version of GPT-4 Turbo', category: 'GPT-4 Turbo' },
    
    // GPT-4 Classic Series
    { id: 'gpt-4-0125-preview', name: 'GPT-4 (0125-preview)', description: 'GPT-4 preview with improvements', category: 'GPT-4' },
    { id: 'gpt-4-1106-preview', name: 'GPT-4 (1106-preview)', description: 'GPT-4 November preview', category: 'GPT-4' },
    { id: 'gpt-4-0613', name: 'GPT-4 (0613)', description: 'Stable GPT-4 June release', category: 'GPT-4' },
    { id: 'gpt-4', name: 'GPT-4', description: 'Original GPT-4 model', category: 'GPT-4' },
    
    // GPT-3.5 Series
    { id: 'gpt-3.5-turbo-0125', name: 'GPT-3.5 Turbo (0125)', description: 'Latest GPT-3.5 Turbo', category: 'GPT-3.5' },
    { id: 'gpt-3.5-turbo-1106', name: 'GPT-3.5 Turbo (1106)', description: 'GPT-3.5 November update', category: 'GPT-3.5' },
    { id: 'gpt-3.5-turbo-16k', name: 'GPT-3.5 Turbo 16K', description: 'Extended context GPT-3.5', category: 'GPT-3.5' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and cost-effective', category: 'GPT-3.5' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    try {
      await onUpdate({
        assistant_id: assistantId.trim(),
        vector_store_id: vectorStoreId.trim(),
        model: selectedModel
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAutoCreate = async () => {
    setAutoCreating(true);
    try {
      await onAutoCreate();
    } finally {
      setAutoCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full">
        <h3 className="text-lg font-semibold mb-2">Configure OpenAI for {organization.name}</h3>
        <p className="text-sm text-gray-600 mb-4">
          Set up AI assistant and vector store for automated call scoring.
        </p>

        {/* Auto-Create Section */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-sm font-semibold text-purple-800 mb-1">🤖 Automatic Setup</h4>
              <p className="text-sm text-purple-700 mb-3">
                Let BridgeSelling automatically create an AI assistant and vector store optimized for your organization.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAutoCreate}
            disabled={autoCreating}
            className="w-full bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {autoCreating ? '🔄 Creating OpenAI Setup...' : '✨ Auto-Create Assistant & Vector Store'}
          </button>
        </div>

        <div className="flex items-center my-6">
          <div className="flex-grow border-t border-gray-300"></div>
          <span className="flex-shrink mx-4 text-gray-500 text-sm">OR</span>
          <div className="flex-grow border-t border-gray-300"></div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">🛠️ Manual Configuration</h4>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              OpenAI Assistant ID
            </label>
            <input
              type="text"
              value={assistantId}
              onChange={(e) => setAssistantId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
              placeholder="asst_xxxxxxxxxxxxxxxxxx"
            />
            <p className="text-xs text-gray-500 mt-1">
              Found in OpenAI Dashboard → Assistants
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vector Store ID
            </label>
            <input
              type="text"
              value={vectorStoreId}
              onChange={(e) => setVectorStoreId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
              placeholder="vs_xxxxxxxxxxxxxxxxxx"
            />
            <p className="text-xs text-gray-500 mt-1">
              Found in OpenAI Dashboard → Storage → Vector Stores
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              AI Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              {/* Group models by category */}
              {['O-Series', 'GPT-4.1', 'GPT-4o', 'GPT-4 Turbo', 'GPT-4', 'GPT-3.5'].map(category => {
                const categoryModels = availableModels.filter(model => model.category === category);
                if (categoryModels.length === 0) return null;
                
                return (
                  <optgroup key={category} label={`${category} Models`}>
                    {categoryModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {availableModels.find(m => m.id === selectedModel)?.description}
            </p>
            <div className="mt-2">
              <a 
                href="https://openai.com/api/pricing/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 underline flex items-center"
              >
                💰 View OpenAI Model Pricing
                <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  Setting up OpenAI Integration
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>These IDs connect your organization to OpenAI for call scoring. You can find them in your OpenAI Dashboard.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save OpenAI Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Create Organization Modal
function CreateOrganizationModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (data: any) => void;
}) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#3B82F6');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      await onCreate({
        name: name.trim(),
        domain: domain.trim() || undefined,
        primary_color: primaryColor
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full">
        <h3 className="text-lg font-semibold mb-4">Create New Organization</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organization Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Acme Corporation"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Domain
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="acme.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Brand Color
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-12 h-10 border border-gray-300 rounded"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Invite User Modal
function InviteUserModal({ organization, onClose, onInvite }: {
  organization: Organization;
  onClose: () => void;
  onInvite: (data: any) => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('member');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setSaving(true);
    try {
      await onInvite({
        email,
        full_name: fullName,
        role,
        is_superadmin: isSuperAdmin
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full">
        <h3 className="text-lg font-semibold mb-2">Invite User to {organization.name}</h3>
        <p className="text-sm text-gray-600 mb-4">
          The user will receive an email invitation to join this organization.
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="user@company.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="member">Member (Sales Rep)</option>
              <option value="admin">Admin (Manager)</option>
              <option value="owner">Owner</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="superadmin"
              checked={isSuperAdmin}
              onChange={(e) => setIsSuperAdmin(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="superadmin" className="text-sm text-gray-700">
              Grant SuperAdmin privileges (BridgeSelling employee)
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Sending Invitation...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Global Branding Modal
function GlobalBrandingModal({ branding, onClose, onUpdate }: {
  branding: any;
  onClose: () => void;
  onUpdate: (data: any) => void;
}) {
  const [appName, setAppName] = useState(branding.app_name || 'BridgeScore');
  const [logoUrl, setLogoUrl] = useState(branding.logo_url || '');
  const [faviconUrl, setFaviconUrl] = useState(branding.favicon_url || '');
  const [primaryColor, setPrimaryColor] = useState(branding.primary_color || '#3B82F6');
  const [secondaryColor, setSecondaryColor] = useState(branding.secondary_color || '#1E40AF');
  const [accentColor, setAccentColor] = useState(branding.accent_color || '#10B981');
  const [saving, setSaving] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/x-icon', 'image/png', 'image/jpeg', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      alert('Please upload a valid image file (ICO, PNG, JPG, or SVG)');
      return;
    }

    // Validate file size (max 1MB for favicon)
    if (file.size > 1024 * 1024) {
      alert('Favicon file size must be less than 1MB');
      return;
    }

    setUploadingFavicon(true);
    try {
      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `favicon-${Date.now()}.${fileExt}`;
      const filePath = `branding/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('resources')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('resources')
        .getPublicUrl(filePath);

      setFaviconUrl(urlData.publicUrl);
    } catch (error) {
      console.error('Error uploading favicon:', error);
      alert('Failed to upload favicon. Please try again.');
    } finally {
      setUploadingFavicon(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    try {
      await onUpdate({
        app_name: appName.trim(),
        logo_url: logoUrl.trim(),
        favicon_url: faviconUrl.trim(),
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        accent_color: accentColor
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">Global App Branding</h3>
        <p className="text-sm text-gray-600 mb-6">
          Configure the global branding for the entire application. These settings will affect all users.
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              App Name
            </label>
            <input
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="BridgeScore"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Logo URL
            </label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="https://example.com/logo.png"
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter a URL to an image file. Leave blank for no logo.
            </p>
            {logoUrl && (
              <div className="mt-2">
                <img src={logoUrl} alt="Logo Preview" className="h-12 w-auto border border-gray-200 rounded" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Favicon
            </label>
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <input
                  type="file"
                  accept=".ico,.png,.jpg,.jpeg,.svg,image/*"
                  onChange={handleFaviconUpload}
                  disabled={uploadingFavicon}
                  className="hidden"
                  id="favicon-upload"
                />
                <label
                  htmlFor="favicon-upload"
                  className={`px-4 py-2 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 ${
                    uploadingFavicon ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {uploadingFavicon ? 'Uploading...' : 'Choose File'}
                </label>
                {faviconUrl && (
                  <div className="flex items-center space-x-2">
                    <img src={faviconUrl} alt="Favicon" className="h-6 w-6 border border-gray-200 rounded" />
                    <button
                      type="button"
                      onClick={() => setFaviconUrl('')}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
              <input
                type="url"
                value={faviconUrl}
                onChange={(e) => setFaviconUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="Or enter a URL directly"
              />
              <p className="text-xs text-gray-500">
                Upload an ICO, PNG, JPG, or SVG file (max 1MB). This will be shown in browser tabs.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Primary Color
              </label>
              <div className="flex items-center space-x-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-12 h-10 border border-gray-300 rounded"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Secondary Color
              </label>
              <div className="flex items-center space-x-3">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="w-12 h-10 border border-gray-300 rounded"
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Accent Color
              </label>
              <div className="flex items-center space-x-3">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-12 h-10 border border-gray-300 rounded"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md font-mono"
                />
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Preview</h4>
            <div className="flex items-center space-x-4">
              {logoUrl && (
                <img src={logoUrl} alt="Logo" className="h-8 w-auto" />
              )}
              <div>
                <div className="font-semibold" style={{ color: primaryColor }}>
                  {appName}
                </div>
                <div className="text-sm" style={{ color: secondaryColor }}>
                  Sales Call Scoring Platform
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Branding'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}