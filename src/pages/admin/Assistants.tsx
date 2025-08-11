import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useOrg } from '../../contexts/OrgContext';
import { supabase } from '../../lib/supabase';
import { FLAGS } from '../../lib/flags';

interface AIConfig {
  org_id: string;
  active_assistant_version_id: string | null;
  default_model: string;
  tool_flags: Record<string, boolean>;
  last_synced_at: string | null;
}

interface AssistantVersion {
  id: string;
  org_id: string;
  label: string;
  model: string;
  system_prompt: string;
  vectorstore_id: string | null;
  tool_flags: Record<string, boolean>;
  created_at: string;
}

interface KnowledgePack {
  id: string;
  org_id: string;
  title: string;
  source_type: 'file' | 'url' | 'text' | 'integration';
  source_ref: string | null;
  vectorstore_id: string | null;
  updated_at: string;
}

export default function Assistants() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [versions, setVersions] = useState<AssistantVersion[]>([]);
  const [knowledgePacks, setKnowledgePacks] = useState<KnowledgePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showKnowledgeModal, setShowKnowledgeModal] = useState(false);
  const [memberRole, setMemberRole] = useState<string | null>(null);

  // Check if feature is enabled
  useEffect(() => {
    if (!FLAGS.ASSISTANTS) {
      navigate('/dashboard');
    }
  }, [navigate]);

  // Check user's role in org
  useEffect(() => {
    checkUserRole();
  }, [user, currentOrg]);

  // Fetch data
  useEffect(() => {
    if (memberRole === 'owner' || memberRole === 'admin') {
      fetchAssistantData();
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
      setMemberRole(data?.role || null);
      
      // Redirect if not owner/admin
      if (data?.role !== 'owner' && data?.role !== 'admin') {
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('Error checking role:', err);
      navigate('/dashboard');
    }
  };

  const fetchAssistantData = async () => {
    if (!currentOrg) return;
    
    setLoading(true);
    try {
      // Fetch org AI config
      const { data: configData } = await (supabase as any)
        .from('org_ai_configs')
        .select('*')
        .eq('org_id', currentOrg.id)
        .single();
      
      setConfig(configData);

      // Fetch assistant versions
      const { data: versionsData } = await (supabase as any)
        .from('ai_assistant_versions')
        .select('*')
        .eq('org_id', currentOrg.id)
        .order('created_at', { ascending: false });
      
      setVersions(versionsData || []);

      // Fetch knowledge packs
      const { data: packsData } = await (supabase as any)
        .from('ai_knowledge_packs')
        .select('*')
        .eq('org_id', currentOrg.id)
        .order('updated_at', { ascending: false });
      
      setKnowledgePacks(packsData || []);
    } catch (err) {
      console.error('Error fetching assistant data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetActive = async (versionId: string) => {
    if (!currentOrg) return;

    try {
      if (config) {
        // Update existing config
        const { error } = await (supabase as any)
          .from('org_ai_configs')
          .update({ 
            active_assistant_version_id: versionId,
            last_synced_at: new Date().toISOString()
          })
          .eq('org_id', currentOrg.id);
        
        if (error) throw error;
      } else {
        // Create new config
        const { error } = await (supabase as any)
          .from('org_ai_configs')
          .insert({
            org_id: currentOrg.id,
            active_assistant_version_id: versionId,
            last_synced_at: new Date().toISOString()
          });
        
        if (error) throw error;
      }

      await fetchAssistantData();
    } catch (err) {
      console.error('Error setting active version:', err);
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    if (!confirm('Are you sure you want to delete this assistant version?')) return;

    try {
      const { error } = await (supabase as any)
        .from('ai_assistant_versions')
        .delete()
        .eq('id', versionId);
      
      if (error) throw error;
      await fetchAssistantData();
    } catch (err) {
      console.error('Error deleting version:', err);
    }
  };

  const activeVersion = versions.find(v => v.id === config?.active_assistant_version_id);

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">AI Assistant Management</h1>
        <p className="text-gray-500 mt-1">Configure AI assistants and knowledge for {currentOrg?.name}</p>
      </div>

      {/* Current Assistant Card */}
      {activeVersion && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Current Assistant</h2>
          <div className="space-y-3">
            <div>
              <span className="text-sm font-medium text-gray-500">Model:</span>
              <span className="ml-2 text-gray-900">{activeVersion.model}</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">System Prompt:</span>
              <p className="mt-1 text-gray-700 bg-gray-50 p-3 rounded">
                {activeVersion.system_prompt?.substring(0, 200)}
                {activeVersion.system_prompt?.length > 200 && '...'}
              </p>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Tools:</span>
              <div className="mt-1 flex gap-2">
                {Object.entries(activeVersion.tool_flags || {}).map(([tool, enabled]) => (
                  <span
                    key={tool}
                    className={`px-2 py-1 text-xs rounded ${
                      enabled 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {tool.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
            {config?.last_synced_at && (
              <div>
                <span className="text-sm font-medium text-gray-500">Last Synced:</span>
                <span className="ml-2 text-gray-900">
                  {new Date(config.last_synced_at).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Assistant Versions Table */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Assistant Versions</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Create Version
          </button>
        </div>
        
        {versions.length === 0 ? (
          <p className="text-gray-500">No assistant versions yet. Create your first one!</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Label</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {versions.map((version) => (
                  <tr key={version.id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{version.label}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{version.model}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(version.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {version.id === config?.active_assistant_version_id && (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right space-x-2">
                      {version.id !== config?.active_assistant_version_id && (
                        <button
                          onClick={() => handleSetActive(version.id)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Set Active
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteVersion(version.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Knowledge Packs Table */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Knowledge Packs</h2>
          <button
            onClick={() => setShowKnowledgeModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Attach from Resources
          </button>
        </div>
        
        {knowledgePacks.length === 0 ? (
          <p className="text-gray-500">No knowledge packs attached. Add resources to enhance your assistant!</p>
        ) : (
          <div className="grid gap-3">
            {knowledgePacks.map((pack) => (
              <div key={pack.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium text-gray-900">{pack.title}</h4>
                    <div className="mt-1 text-sm text-gray-500">
                      <span className="capitalize">{pack.source_type}</span>
                      {pack.source_ref && <span> • {pack.source_ref}</span>}
                    </div>
                  </div>
                  <button className="text-red-600 hover:text-red-800 text-sm">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Version Modal */}
      {showCreateModal && <CreateVersionModal onClose={() => setShowCreateModal(false)} onCreated={fetchAssistantData} />}
      
      {/* Knowledge Resources Modal */}
      {showKnowledgeModal && <KnowledgeResourcesModal onClose={() => setShowKnowledgeModal(false)} />}
    </div>
  );
}

// Create Version Modal Component
function CreateVersionModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { currentOrg } = useOrg();
  const [label, setLabel] = useState('');
  const [model, setModel] = useState('gpt-4');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [tools, setTools] = useState({
    web_search: true,
    code_interpreter: false,
    retrieval: true,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !label.trim()) return;

    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('ai_assistant_versions')
        .insert({
          org_id: currentOrg.id,
          label: label.trim(),
          model,
          system_prompt: systemPrompt.trim(),
          tool_flags: tools,
        });

      if (error) throw error;
      onCreated();
      onClose();
    } catch (err) {
      console.error('Error creating version:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">Create Assistant Version</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Version Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="e.g., v1.0 - Sales Focus"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="gpt-4">GPT-4</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="You are a Bridge Selling coach analyzing sales calls..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tools
            </label>
            <div className="space-y-2">
              {Object.entries(tools).map(([tool, enabled]) => (
                <label key={tool} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setTools({ ...tools, [tool]: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm">{tool.replace('_', ' ')}</span>
                </label>
              ))}
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
              {saving ? 'Creating...' : 'Create Version'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Knowledge Resources Modal Component (stub)
function KnowledgeResourcesModal({ onClose }: { onClose: () => void }) {
  const fakeResources = [
    { id: '1', title: 'Bridge Selling Methodology.pdf', type: 'file' },
    { id: '2', title: 'Sales Best Practices', type: 'url' },
    { id: '3', title: 'Product Documentation', type: 'text' },
    { id: '4', title: 'CRM Integration Guide', type: 'integration' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full">
        <h3 className="text-lg font-semibold mb-4">Attach Knowledge Resources</h3>
        
        <div className="space-y-2 mb-4">
          {fakeResources.map((resource) => (
            <label key={resource.id} className="flex items-center p-3 border border-gray-200 rounded hover:bg-gray-50">
              <input type="checkbox" className="mr-3" />
              <div className="flex-1">
                <div className="font-medium text-gray-900">{resource.title}</div>
                <div className="text-sm text-gray-500">{resource.type}</div>
              </div>
            </label>
          ))}
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Attach Selected
          </button>
        </div>
      </div>
    </div>
  );
}