import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { createClientSetup, uploadFileToVectorStore } from '../../lib/openai-api';
import BridgeStepsEditor from '../../components/BridgeStepsEditor';

interface Client {
  id: string;
  name: string;
  domain?: string;
  logo_url?: string;
  primary_color: string;
  secondary_color: string;
  bridge_steps: BridgeStep[];
  openai_assistant_id?: string;
  openai_vector_store_id?: string;
  created_at: string;
  created_by: string;
}

interface BridgeStep {
  key: string;
  name: string;
  weight: number;
  order: number;
  customPrompt?: string;
}

interface ClientFile {
  id: string;
  client_id: string;
  filename: string;
  original_name: string;
  file_size: number;
  status: string;
  created_at: string;
}

export default function ClientManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientFiles, setClientFiles] = useState<ClientFile[]>([]);
  const [showFilesModal, setShowFilesModal] = useState(false);

  useEffect(() => {
    checkSuperAdminAccess();
  }, [user]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchClients();
    }
  }, [isSuperAdmin]);

  const checkSuperAdminAccess = async () => {
    if (!user) {
      navigate('/dashboard');
      return;
    }

    try {
      const { data, error } = await (supabase as any)
        .from('memberships')
        .select('is_superadmin')
        .eq('user_id', user.id)
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

  const fetchClients = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClients(data || []);
    } catch (err) {
      console.error('Error fetching clients:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClientFiles = async (clientId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('client_files')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClientFiles(data || []);
    } catch (err) {
      console.error('Error fetching client files:', err);
    }
  };

  const createClient = async (clientData: Partial<Client>) => {
    try {
      const { data: newClient, error } = await (supabase as any)
        .from('clients')
        .insert({
          ...clientData,
          created_by: user?.id
        })
        .select()
        .single();

      if (error) throw error;

      // Skip OpenAI setup for now to test basic client creation
      console.log('Client created successfully:', newClient);
      alert(`Client "${newClient.name}" created successfully! OpenAI setup can be added later via the "Setup OpenAI" button.`);
      
      // TODO: Re-enable OpenAI auto-setup once basic creation is working
      // try {
      //   await createClientSetup(newClient.id, newClient.name);
      //   alert(`Client "${newClient.name}" created successfully with OpenAI integration!`);
      // } catch (openaiError) {
      //   console.error('Failed to create OpenAI setup:', openaiError);
      //   console.error('OpenAI Error Details:', openaiError);
      //   alert(`Client "${newClient.name}" created successfully! OpenAI setup can be completed later.`);
      // }

      await fetchClients();
      setShowCreateModal(false);
    } catch (err) {
      console.error('Error creating client:', err);
      console.error('Full error details:', err);
      
      // More specific error message
      if (err instanceof Error) {
        alert(`Failed to create client: ${err.message}`);
      } else {
        alert('Failed to create client: Unknown error occurred');
      }
    }
  };

  const setupOpenAI = async (client: Client) => {
    try {
      await createClientSetup(client.id, client.name);
      alert('OpenAI setup completed successfully!');
      await fetchClients();
    } catch (err) {
      console.error('Error setting up OpenAI:', err);
      alert('Failed to setup OpenAI integration');
    }
  };

  const handleFileUpload = async (file: File, clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (!client?.openai_vector_store_id) {
      alert('Client must have a vector store before uploading files');
      return;
    }

    try {
      // Create file record
      const { data: fileRecord, error: fileError } = await (supabase as any)
        .from('client_files')
        .insert({
          client_id: clientId,
          filename: file.name,
          original_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          uploaded_by: user?.id,
          status: 'uploading'
        })
        .select()
        .single();

      if (fileError) throw fileError;

      // Upload to OpenAI
      const { fileId } = await uploadFileToVectorStore(file, client.openai_vector_store_id);

      // Update file record with OpenAI file ID
      await (supabase as any)
        .from('client_files')
        .update({
          openai_file_id: fileId,
          status: 'ready'
        })
        .eq('id', fileRecord.id);

      alert('File uploaded successfully!');
      await fetchClientFiles(clientId);
    } catch (err) {
      console.error('Error uploading file:', err);
      alert('Failed to upload file');
    }
  };

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
        <h1 className="text-3xl font-bold text-gray-900">Client Management</h1>
        <p className="text-gray-500 mt-1">Manage client configurations, Bridge Selling steps, and OpenAI assistants</p>
      </div>

      {/* Clients Table */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Clients</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Add New Client
          </button>
        </div>
        
        {clients.length === 0 ? (
          <p className="text-gray-500">No clients yet. Create your first client!</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Domain</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">OpenAI Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center">
                        {client.logo_url && (
                          <img 
                            src={client.logo_url} 
                            alt={`${client.name} logo`}
                            className="w-8 h-8 rounded mr-3"
                          />
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">{client.name}</div>
                          <div className="flex items-center mt-1">
                            <div 
                              className="w-3 h-3 rounded-full mr-2" 
                              style={{ backgroundColor: client.primary_color }}
                            />
                            <span className="text-xs text-gray-500">{client.primary_color}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{client.domain || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      {client.openai_assistant_id ? (
                        <div>
                          <span className="text-green-600">✓ Configured</span>
                          <div className="text-xs text-gray-500 mt-1">
                            Assistant: {client.openai_assistant_id.slice(0, 20)}...
                          </div>
                          {client.openai_vector_store_id && (
                            <div className="text-xs text-gray-500">
                              Vector: {client.openai_vector_store_id.slice(0, 20)}...
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => setupOpenAI(client)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          Setup OpenAI
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(client.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right space-x-2">
                      <button
                        onClick={() => setEditingClient(client)}
                        className="text-indigo-600 hover:text-indigo-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          setSelectedClient(client);
                          setShowFilesModal(true);
                          fetchClientFiles(client.id);
                        }}
                        className="text-green-600 hover:text-green-800"
                      >
                        Files
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Client Modal */}
      {showCreateModal && (
        <CreateClientModal 
          onClose={() => setShowCreateModal(false)} 
          onCreate={createClient}
        />
      )}

      {/* Edit Client Modal */}
      {editingClient && (
        <BridgeStepsEditor 
          client={editingClient}
          onClose={() => setEditingClient(null)} 
          onUpdate={async () => {
            setEditingClient(null);
            await fetchClients();
          }}
        />
      )}

      {/* Files Modal */}
      {showFilesModal && selectedClient && (
        <ClientFilesModal
          client={selectedClient}
          files={clientFiles}
          onClose={() => setShowFilesModal(false)}
          onFileUpload={(file) => handleFileUpload(file, selectedClient.id)}
        />
      )}
    </div>
  );
}

// Create Client Modal Component
function CreateClientModal({ onClose, onCreate }: { 
  onClose: () => void; 
  onCreate: (client: Partial<Client>) => void 
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
        primary_color: primaryColor,
        secondary_color: '#1E40AF' // Default secondary color
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full">
        <h3 className="text-lg font-semibold mb-4">Create New Client</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client Name *
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
              {saving ? 'Creating...' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Client Files Modal Component
function ClientFilesModal({ client, files, onClose, onFileUpload }: {
  client: Client;
  files: ClientFile[];
  onClose: () => void;
  onFileUpload: (file: File) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      await onFileUpload(file);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[70vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">Knowledge Base Files: {client.name}</h3>
        
        {client.openai_vector_store_id ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload New File
              </label>
              <input
                type="file"
                onChange={handleFileSelect}
                disabled={uploading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                accept=".pdf,.doc,.docx,.txt,.md"
              />
              {uploading && <p className="text-sm text-blue-600 mt-1">Uploading...</p>}
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">Uploaded Files</h4>
              {files.length === 0 ? (
                <p className="text-gray-500 text-sm">No files uploaded yet</p>
              ) : (
                <div className="space-y-2">
                  {files.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div>
                        <div className="font-medium text-sm">{file.original_name}</div>
                        <div className="text-xs text-gray-500">
                          {(file.file_size / 1024).toFixed(1)} KB • {file.status}
                        </div>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded ${
                        file.status === 'ready' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {file.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-gray-500">This client needs OpenAI setup before uploading files.</p>
          </div>
        )}

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}