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
        .from('memberships')
        .select(`
          role,
          is_superadmin,
          profiles:profiles(
            id,
            email,
            full_name,
            created_at
          )
        `)
        .eq('org_id', orgId);

      if (error) throw error;
      
      const users = data?.map((membership: any) => ({
        id: membership.profiles.id,
        email: membership.profiles.email,
        full_name: membership.profiles.full_name,
        role: membership.role,
        is_superadmin: membership.is_superadmin,
        created_at: membership.profiles.created_at
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
                        <span className="text-sm text-green-600">✓ AI Assistant: {selectedOrg.openai_assistant_id.slice(0, 20)}...</span>
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