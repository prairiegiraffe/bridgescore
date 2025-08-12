import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface User {
  id: string;
  email: string;
  full_name?: string;
  created_at: string;
  memberships?: {
    org_id: string;
    organization: {
      id: string;
      name: string;
      client?: {
        id: string;
        name: string;
      };
    };
    role: string;
    is_superadmin: boolean;
  }[];
}

interface Client {
  id: string;
  name: string;
  organizations?: {
    id: string;
    name: string;
  }[];
}

interface Organization {
  id: string;
  name: string;
  client_id?: string;
  client?: {
    name: string;
  };
}

export default function UserManagement() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<string>('');

  useEffect(() => {
    checkSuperAdminAccess();
  }, [currentUser]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchData();
    }
  }, [isSuperAdmin]);

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

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch all users with their memberships
      const { data: userData, error: userError } = await (supabase as any)
        .from('auth.users')
        .select(`
          id,
          email,
          created_at,
          raw_user_meta_data->full_name
        `)
        .order('created_at', { ascending: false });

      if (userError) throw userError;

      // Fetch memberships with organization and client details
      const { data: membershipData, error: membershipError } = await (supabase as any)
        .from('memberships')
        .select(`
          user_id,
          org_id,
          role,
          is_superadmin,
          organization:organizations(
            id,
            name,
            client:clients(
              id,
              name
            )
          )
        `);

      if (membershipError) throw membershipError;

      // Combine user data with memberships
      const usersWithMemberships = userData?.map((user: any) => ({
        ...user,
        full_name: user.raw_user_meta_data?.full_name,
        memberships: membershipData?.filter((m: any) => m.user_id === user.id) || []
      })) || [];

      setUsers(usersWithMemberships);

      // Fetch clients
      const { data: clientData, error: clientError } = await (supabase as any)
        .from('clients')
        .select(`
          *,
          organizations(id, name)
        `)
        .order('name');

      if (clientError) throw clientError;
      setClients(clientData || []);

      // Fetch organizations
      const { data: orgData, error: orgError } = await (supabase as any)
        .from('organizations')
        .select(`
          *,
          client:clients(name)
        `)
        .order('name');

      if (orgError) throw orgError;
      setOrganizations(orgData || []);

    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const createUser = async (userData: {
    email: string;
    password: string;
    full_name: string;
    org_id?: string;
    role: string;
    is_superadmin: boolean;
  }) => {
    try {
      // Create the user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: userData.email,
        password: userData.password,
        email_confirm: true,
        user_metadata: {
          full_name: userData.full_name
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('User creation failed');

      // If organization is selected, create membership
      if (userData.org_id) {
        const { error: membershipError } = await (supabase as any)
          .from('memberships')
          .insert({
            user_id: authData.user.id,
            org_id: userData.org_id,
            role: userData.role,
            is_superadmin: userData.is_superadmin
          });

        if (membershipError) throw membershipError;
      }

      alert(`User "${userData.email}" created successfully!`);
      await fetchData();
      setShowCreateModal(false);
    } catch (err) {
      console.error('Error creating user:', err);
      alert(`Failed to create user: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const runAsUser = async (_userId: string) => {
    // This would require implementing an impersonation system
    // For now, we'll just show an alert
    alert('Run As feature coming soon! This will allow you to see the app as this user sees it.');
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) throw error;
      
      alert('User deleted successfully');
      await fetchData();
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('Failed to delete user');
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!selectedClient) return matchesSearch;
    
    const userInClient = user.memberships?.some(m => 
      m.organization?.client?.id === selectedClient
    );
    
    return matchesSearch && userInClient;
  });

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          Access denied. SuperAdmin privileges required.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
        <p className="text-gray-500 mt-1">Manage users, assign them to organizations, and control access</p>
      </div>

      {/* Filters and Actions */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            placeholder="Search users by email or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
          />
          
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="">All Clients</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>

          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Create User
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organization</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredUsers.map((user) => {
              const membership = user.memberships?.[0];
              return (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{user.email}</div>
                      {user.full_name && (
                        <div className="text-sm text-gray-500">{user.full_name}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {membership?.organization?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {membership?.organization?.client?.name || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {membership?.is_superadmin && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                          SuperAdmin
                        </span>
                      )}
                      {membership?.role && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          {membership.role}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right space-x-2">
                    <button
                      onClick={() => runAsUser(user.id)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Run As
                    </button>
                    <button
                      onClick={() => setEditingUser(user)}
                      className="text-indigo-600 hover:text-indigo-800"
                    >
                      Edit
                    </button>
                    {user.id !== currentUser?.id && (
                      <button
                        onClick={() => deleteUser(user.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {filteredUsers.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No users found matching your criteria
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createUser}
          organizations={organizations}
          clients={clients}
        />
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onUpdate={async () => {
            setEditingUser(null);
            await fetchData();
          }}
          organizations={organizations}
        />
      )}
    </div>
  );
}

// Create User Modal Component
function CreateUserModal({ onClose, onCreate, organizations, clients }: {
  onClose: () => void;
  onCreate: (userData: any) => void;
  organizations: Organization[];
  clients: Client[];
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('');
  const [role, setRole] = useState('member');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [selectedClient, setSelectedClient] = useState('');
  const [saving, setSaving] = useState(false);

  // Filter organizations by selected client
  const filteredOrgs = selectedClient 
    ? organizations.filter(org => org.client_id === selectedClient)
    : organizations;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setSaving(true);
    try {
      await onCreate({
        email,
        password,
        full_name: fullName,
        org_id: selectedOrg || undefined,
        role,
        is_superadmin: isSuperAdmin
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">Create New User</h3>
        
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
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password *
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client (optional)
            </label>
            <select
              value={selectedClient}
              onChange={(e) => {
                setSelectedClient(e.target.value);
                setSelectedOrg(''); // Reset org when client changes
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">No Client</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organization (optional)
            </label>
            <select
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              disabled={!selectedClient && organizations.length > 0}
            >
              <option value="">No Organization</option>
              {filteredOrgs.map(org => (
                <option key={org.id} value={org.id}>
                  {org.name}
                  {org.client && ` (${org.client.name})`}
                </option>
              ))}
            </select>
            {!selectedClient && organizations.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">Select a client first to see organizations</p>
            )}
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
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Edit User Modal Component  
function EditUserModal({ user, onClose, onUpdate, organizations }: {
  user: User;
  onClose: () => void;
  onUpdate: () => void;
  organizations: Organization[];
}) {
  const membership = user.memberships?.[0];
  const [selectedOrg, setSelectedOrg] = useState(membership?.org_id || '');
  const [role, setRole] = useState(membership?.role || 'member');
  const [isSuperAdmin, setIsSuperAdmin] = useState(membership?.is_superadmin || false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (membership) {
        // Update existing membership
        const { error } = await (supabase as any)
          .from('memberships')
          .update({
            org_id: selectedOrg,
            role,
            is_superadmin: isSuperAdmin
          })
          .eq('user_id', user.id)
          .eq('org_id', membership.org_id);

        if (error) throw error;
      } else if (selectedOrg) {
        // Create new membership
        const { error } = await (supabase as any)
          .from('memberships')
          .insert({
            user_id: user.id,
            org_id: selectedOrg,
            role,
            is_superadmin: isSuperAdmin
          });

        if (error) throw error;
      }

      alert('User updated successfully!');
      onUpdate();
    } catch (err) {
      console.error('Error updating user:', err);
      alert('Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full">
        <h3 className="text-lg font-semibold mb-4">Edit User: {user.email}</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organization
            </label>
            <select
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">No Organization</option>
              {organizations.map(org => (
                <option key={org.id} value={org.id}>
                  {org.name}
                  {org.client && ` (${org.client.name})`}
                </option>
              ))}
            </select>
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
              id="edit-superadmin"
              checked={isSuperAdmin}
              onChange={(e) => setIsSuperAdmin(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="edit-superadmin" className="text-sm text-gray-700">
              Grant SuperAdmin privileges
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
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}