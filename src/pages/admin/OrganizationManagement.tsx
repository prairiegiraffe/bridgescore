import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
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
  created_at: string;
}

interface User {
  id: string;
  email: string;
  full_name?: string;
  role?: string;
  is_superadmin?: boolean;
  created_at: string;
}

export default function OrganizationManagement() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgUsers, setSelectedOrgUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showOpenAIModal, setShowOpenAIModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);

  useEffect(() => {
    checkSuperAdminAccess();
  }, [currentUser]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchOrganizations();
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
      const { data, error } = await (supabase as any)
        .from('organization_details')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrganizations(data || []);
      
      // Auto-select first organization
      if (data && data.length > 0 && !selectedOrg) {
        setSelectedOrg(data[0]);
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
        created_at: row.created_at
      })) || [];

      setSelectedOrgUsers(users);
    } catch (err) {
      console.error('Error fetching organization users:', err);
      setSelectedOrgUsers([]);
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
      // If model is being updated and we have an assistant ID, update the assistant model via OpenAI API
      if (openaiData.model && openaiData.assistant_id) {
        await updateAssistantModel(openaiData.assistant_id, openaiData.model);
      }

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

  const updateAssistantModel = async (assistantId: string, model: string) => {
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
            action: 'update_assistant_model',
            assistantId,
            model
          })
        }
      );

      const result = await response.json();
      
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to update assistant model');
      }
    } catch (err) {
      console.error('Error updating assistant model:', err);
      throw err;
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

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          Access denied. SuperAdmin privileges required.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Organization Management</h1>
        <p className="text-gray-500 mt-1">Manage organizations and their users</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Organizations List */}
        <div className="lg:col-span-1">
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
        <div className="lg:col-span-2">
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
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
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
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {new Date(user.created_at).toLocaleDateString()}
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
        />
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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