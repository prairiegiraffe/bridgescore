import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { supabase } from '../lib/supabase';
import { FLAGS } from '../lib/flags';
import { getAssistantVersions, type AssistantVersion } from '../lib/assistants';

interface Member {
  id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
  user: {
    email: string;
  };
}

interface OrgConfig {
  id: string;
  org_id: string;
  default_framework_version: string;
  default_assistant_version_id: string | null;
  tool_flags: Record<string, boolean>;
  default_assistant_version?: AssistantVersion;
}

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  
  const [loading, setLoading] = useState(true);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [assistantVersions, setAssistantVersions] = useState<AssistantVersion[]>([]);
  const [orgConfig, setOrgConfig] = useState<OrgConfig | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [saving, setSaving] = useState(false);

  // Check if feature is enabled and user has access
  useEffect(() => {
    if (!FLAGS.SETTINGS || !FLAGS.ORGS) {
      navigate('/dashboard');
      return;
    }
    
    checkUserRole();
  }, [navigate, user, currentOrg]);

  // Load data when user role is confirmed
  useEffect(() => {
    if (memberRole && currentOrg && (memberRole === 'owner' || memberRole === 'admin')) {
      fetchData();
    }
  }, [memberRole, currentOrg]);

  const checkUserRole = async () => {
    if (!user || !currentOrg) return;

    try {
      const { data, error } = await (supabase as any)
        .from('memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('org_id', currentOrg.id)
        .single();

      if (error) throw error;
      const role = data?.role;
      setMemberRole(role);

      // Redirect non-admins
      if (role !== 'owner' && role !== 'admin') {
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('Error checking role:', err);
      navigate('/dashboard');
    }
  };

  const fetchData = async () => {
    if (!currentOrg) return;
    
    setLoading(true);
    try {
      await Promise.all([
        fetchMembers(),
        fetchAssistantVersions(),
        fetchOrgConfig()
      ]);
    } catch (err) {
      console.error('Error fetching settings data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    if (!currentOrg) return;

    try {
      const { data, error } = await (supabase as any)
        .from('memberships')
        .select(`
          *,
          user:user_id(email)
        `)
        .eq('org_id', currentOrg.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMembers(data || []);
    } catch (err) {
      console.error('Error fetching members:', err);
    }
  };

  const fetchAssistantVersions = async () => {
    if (!currentOrg) return;

    try {
      const versions = await getAssistantVersions(currentOrg.id);
      setAssistantVersions(versions);
    } catch (err) {
      console.error('Error fetching assistant versions:', err);
    }
  };

  const fetchOrgConfig = async () => {
    if (!currentOrg) return;

    try {
      const { data, error } = await (supabase as any)
        .from('org_ai_configs')
        .select(`
          *,
          default_assistant_version:ai_assistant_versions(id, name, version)
        `)
        .eq('org_id', currentOrg.id)
        .single();

      if (error) {
        // Create default config if it doesn't exist
        const { data: newConfig, error: createError } = await (supabase as any)
          .from('org_ai_configs')
          .insert({
            org_id: currentOrg.id,
            default_framework_version: '1.0',
            tool_flags: {
              require_suitability_first: false,
              enable_compliance_mode: false,
              require_disclosure: false
            }
          })
          .select()
          .single();

        if (createError) throw createError;
        setOrgConfig(newConfig);
      } else {
        setOrgConfig(data);
      }
    } catch (err) {
      console.error('Error fetching org config:', err);
    }
  };

  const updateMemberRole = async (memberId: string, newRole: 'owner' | 'admin' | 'member') => {
    if (memberRole !== 'owner') return;

    try {
      setSaving(true);
      const { error } = await (supabase as any)
        .from('memberships')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;
      await fetchMembers();
      alert('Member role updated successfully!');
    } catch (err) {
      console.error('Error updating member role:', err);
      alert('Failed to update member role.');
    } finally {
      setSaving(false);
    }
  };

  const inviteMember = async (email: string) => {
    if (!currentOrg || !email.trim()) return;

    try {
      setSaving(true);
      
      // For now, we'll create a stub membership invite
      // In a real implementation, you'd send an email invitation
      // and the user would accept it to create the membership
      
      // For this stub, we'll just show a message that email would be sent
      alert(`Invitation would be sent to ${email}. This is a stub implementation.`);
      setInviteEmail('');
    } catch (err) {
      console.error('Error inviting member:', err);
      alert('Failed to invite member.');
    } finally {
      setSaving(false);
    }
  };

  const updateOrgConfig = async (updates: Partial<OrgConfig>) => {
    if (!currentOrg || !orgConfig) return;

    try {
      setSaving(true);
      const { error } = await (supabase as any)
        .from('org_ai_configs')
        .update(updates)
        .eq('id', orgConfig.id);

      if (error) throw error;
      await fetchOrgConfig();
      alert('Settings updated successfully!');
    } catch (err) {
      console.error('Error updating org config:', err);
      alert('Failed to update settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !memberRole) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  if (memberRole !== 'owner' && memberRole !== 'admin') {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          Access denied. Only owners and admins can access settings.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Organization Settings</h1>
        <p className="text-gray-500 mt-1">Manage members, scoring defaults, and compliance settings for {currentOrg?.name}</p>
      </div>

      {/* Members & Roles */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Members & Roles</h2>
        </div>
        <div className="p-6">
          {/* Current Members */}
          <div className="mb-6">
            <h3 className="text-md font-medium text-gray-900 mb-3">Current Members</h3>
            <div className="space-y-3">
              {members.map(member => (
                <div key={member.id} className="flex items-center justify-between py-2 px-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{member.user.email}</p>
                    <p className="text-sm text-gray-500">Joined {new Date(member.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {memberRole === 'owner' && member.user_id !== user?.id ? (
                      <select
                        value={member.role}
                        onChange={(e) => updateMemberRole(member.id, e.target.value as any)}
                        className="text-sm px-2 py-1 border border-gray-300 rounded"
                        disabled={saving}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        member.role === 'owner' ? 'bg-purple-100 text-purple-800' :
                        member.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Invite New Member */}
          <div>
            <h3 className="text-md font-medium text-gray-900 mb-3">Invite New Member</h3>
            <div className="flex space-x-3">
              <input
                type="email"
                placeholder="Enter email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                disabled={saving}
              />
              <button
                onClick={() => inviteMember(inviteEmail)}
                disabled={saving || !inviteEmail.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Inviting...' : 'Invite'}
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Note: The user must already have a BridgeScore account.
            </p>
          </div>
        </div>
      </div>

      {/* Scoring Defaults */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Scoring Defaults</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Framework Version */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Framework Version
              </label>
              <select
                value={orgConfig?.default_framework_version || '1.0'}
                onChange={(e) => updateOrgConfig({ default_framework_version: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                disabled={saving}
              >
                <option value="1.0">Framework v1.0 (Heuristic)</option>
              </select>
            </div>

            {/* Assistant Version */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Assistant Version
              </label>
              <select
                value={orgConfig?.default_assistant_version_id || ''}
                onChange={(e) => updateOrgConfig({ default_assistant_version_id: e.target.value || null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                disabled={saving}
              >
                <option value="">No Assistant (Heuristic Only)</option>
                {assistantVersions.map(version => (
                  <option key={version.id} value={version.id}>
                    {version.name} v{version.version}
                    {version.is_active ? ' (Currently Active)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Compliance Toggles */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Compliance Settings</h2>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="require_suitability_first"
                checked={orgConfig?.tool_flags?.require_suitability_first || false}
                onChange={(e) => updateOrgConfig({
                  tool_flags: {
                    ...orgConfig?.tool_flags,
                    require_suitability_first: e.target.checked
                  }
                })}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                disabled={saving}
              />
              <label htmlFor="require_suitability_first" className="ml-2 text-sm text-gray-700">
                Require suitability assessment before product presentation
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="enable_compliance_mode"
                checked={orgConfig?.tool_flags?.enable_compliance_mode || false}
                onChange={(e) => updateOrgConfig({
                  tool_flags: {
                    ...orgConfig?.tool_flags,
                    enable_compliance_mode: e.target.checked
                  }
                })}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                disabled={saving}
              />
              <label htmlFor="enable_compliance_mode" className="ml-2 text-sm text-gray-700">
                Enable enhanced compliance monitoring
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="require_disclosure"
                checked={orgConfig?.tool_flags?.require_disclosure || false}
                onChange={(e) => updateOrgConfig({
                  tool_flags: {
                    ...orgConfig?.tool_flags,
                    require_disclosure: e.target.checked
                  }
                })}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                disabled={saving}
              />
              <label htmlFor="require_disclosure" className="ml-2 text-sm text-gray-700">
                Require risk disclosure before closing
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}