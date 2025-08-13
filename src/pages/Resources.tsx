import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { supabase } from '../lib/supabase';

interface Resource {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  file_url?: string;
  external_url?: string;
  last_updated: string;
  created_by: string;
  org_id?: string;
  is_global: boolean;
  download_count: number;
  file_size?: string;
  file_type?: string;
}


export default function Resources() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    if (user) {
      checkSuperAdminAccess();
      fetchResources();
    }
  }, [user, currentOrg]);

  const checkSuperAdminAccess = async () => {
    if (!user) return;

    try {
      const { data } = await (supabase as any)
        .from('memberships')
        .select('is_superadmin')
        .eq('user_id', user.id)
        .eq('is_superadmin', true)
        .single();

      setIsSuperAdmin(!!data);
    } catch (err) {
      setIsSuperAdmin(false);
    }
  };

  const fetchResources = async () => {
    try {
      setLoading(true);
      
      // Fetch resources from database
      const { data: resourcesData, error } = await supabase
        .from('resources')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Transform database records to match our Resource interface
      const transformedResources: Resource[] = (resourcesData || []).map(resource => ({
        id: resource.id,
        title: resource.title,
        description: resource.description,
        icon: resource.icon || '📄',
        category: resource.category,
        file_url: resource.file_url,
        external_url: resource.external_url,
        last_updated: new Date(resource.updated_at).toISOString().split('T')[0],
        created_by: 'SuperAdmin', // We could join with users table to get actual names
        org_id: resource.org_id,
        is_global: resource.is_global,
        download_count: resource.download_count || 0,
        file_size: resource.file_size,
        file_type: resource.file_type?.toUpperCase() || 'FILE'
      }));

      setResources(transformedResources);
    } catch (err) {
      console.error('Error fetching resources:', err);
      // Fall back to empty array instead of mock data
      setResources([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (resource: Resource) => {
    try {
      // Increment download count in database
      await supabase
        .from('resources')
        .update({ download_count: (resource.download_count || 0) + 1 })
        .eq('id', resource.id);
      
      // Update local state
      setResources(prevResources => 
        prevResources.map(r => 
          r.id === resource.id 
            ? { ...r, download_count: (r.download_count || 0) + 1 }
            : r
        )
      );
      
      if (resource.external_url) {
        window.open(resource.external_url, '_blank');
      } else if (resource.file_url) {
        // Open the file URL directly for download
        window.open(resource.file_url, '_blank');
      }
    } catch (error) {
      console.error('Error updating download count:', error);
      // Still allow download even if count update fails
      if (resource.external_url) {
        window.open(resource.external_url, '_blank');
      } else if (resource.file_url) {
        window.open(resource.file_url, '_blank');
      }
    }
  };

  const handleDelete = async (resource: Resource) => {
    if (!isSuperAdmin) {
      alert('You do not have permission to delete resources.');
      return;
    }
    
    const confirmed = window.confirm(
      `Are you sure you want to delete "${resource.title}"?\n\nThis action cannot be undone.`
    );
    
    if (!confirmed) return;
    
    try {
      // First, delete from database to get the file path
      const { data: deletedResource, error: dbError } = await supabase
        .from('resources')
        .delete()
        .eq('id', resource.id)
        .select('file_path')
        .single();

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      // Delete file from Supabase Storage if it exists
      if (deletedResource?.file_path) {
        const { error: storageError } = await supabase.storage
          .from('resources')
          .remove([deletedResource.file_path]);
          
        if (storageError) {
          console.warn('Storage deletion failed:', storageError.message);
          // Don't fail the whole operation if storage deletion fails
        }
      }
      
      // Update local state
      setResources(prevResources => 
        prevResources.filter(r => r.id !== resource.id)
      );
      
      alert(`"${resource.title}" has been deleted successfully.`);
    } catch (error: any) {
      console.error('Delete error:', error);
      alert(`Error deleting resource: ${error.message}`);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const categories = ['all', ...Array.from(new Set(resources.map(r => r.category)))];
  const filteredResources = selectedCategory === 'all' 
    ? resources 
    : resources.filter(r => r.category === selectedCategory);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center">
              📚 Training Resources
            </h1>
            <p className="text-gray-600 mt-2">
              Access training materials, templates, and best practices to improve your sales performance.
            </p>
          </div>
          
          {isSuperAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center space-x-2"
            >
              <span>+</span>
              <span>Add New Resource</span>
            </button>
          )}
        </div>
      </div>

      {/* Category Filter */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === category
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {category === 'all' ? 'All Resources' : category}
            </button>
          ))}
        </div>
      </div>

      {/* Resources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredResources.map((resource) => (
          <div key={resource.id} className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="text-3xl">{resource.icon}</div>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {resource.category}
              </span>
            </div>
            
            <h3 className="font-semibold text-gray-900 mb-2 text-lg">
              {resource.title}
            </h3>
            
            <p className="text-gray-600 text-sm mb-4 line-clamp-3">
              {resource.description}
            </p>
            
            <div className="space-y-2 mb-4 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Last updated:</span>
                <span>{formatDate(resource.last_updated)}</span>
              </div>
              
              {resource.file_size && (
                <div className="flex justify-between">
                  <span>File size:</span>
                  <span>{resource.file_size}</span>
                </div>
              )}
              
              <div className="flex justify-between">
                <span>Downloads:</span>
                <span>{resource.download_count.toLocaleString()}</span>
              </div>
            </div>
            
            <div className={`flex gap-2 ${isSuperAdmin ? 'flex' : ''}`}>
              <button
                onClick={() => handleDownload(resource)}
                className={`bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 ${
                  isSuperAdmin ? 'flex-1' : 'w-full'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-4-4m4 4l4-4m-4-4V4" />
                </svg>
                <span>Download {resource.file_type}</span>
              </button>
              
              {isSuperAdmin && (
                <button
                  onClick={() => handleDelete(resource)}
                  className="bg-red-600 text-white py-2 px-3 rounded-md hover:bg-red-700 transition-colors flex items-center justify-center"
                  title="Delete Resource"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredResources.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">📚</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No resources found</h3>
          <p className="text-gray-500">
            {selectedCategory === 'all' 
              ? 'No resources have been added yet.'
              : `No resources found in the "${selectedCategory}" category.`
            }
          </p>
        </div>
      )}

      {/* Add Resource Modal - Placeholder */}
      {showAddModal && (
        <AddResourceModal 
          onClose={() => setShowAddModal(false)} 
          onAdd={() => {
            setShowAddModal(false);
            fetchResources();
          }}
        />
      )}
    </div>
  );
}

// Add Resource Modal Component
function AddResourceModal({ onClose, onAdd }: { onClose: () => void; onAdd: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [icon, setIcon] = useState('📄');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Predefined categories based on existing resources
  const predefinedCategories = [
    'Framework',
    'Quick Reference', 
    'Scoring',
    'Scripts',
    'Templates',
    'Worksheets',
    'Training',
    'Best Practices',
    'Case Studies',
    'Checklists'
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Check file type
      if (!selectedFile.type.includes('pdf') && !selectedFile.type.includes('document')) {
        alert('Please select a PDF or document file');
        return;
      }
      
      // Check file size (max 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
      }
      
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Use custom category if "custom" is selected, otherwise use selected category
    const finalCategory = category === 'custom' ? customCategory : category;
    
    if (!finalCategory.trim()) {
      alert('Please select or enter a category');
      return;
    }
    
    if (!file) {
      alert('Please select a file to upload');
      return;
    }
    
    setSaving(true);
    
    try {
      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const filePath = `resources/${fileName}`;
      
      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('resources')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });
        
      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }
      
      // Get public URL for the uploaded file
      const { data: urlData } = supabase.storage
        .from('resources')
        .getPublicUrl(filePath);
      
      // Calculate file size in MB/KB
      const fileSize = file.size > 1024 * 1024 
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${(file.size / 1024).toFixed(0)} KB`;
      
      // Save resource to database
      console.log('Saving resource with data:', {
        title,
        description,
        category: finalCategory,
        icon: icon,
        icon_length: icon.length,
        file_url: urlData.publicUrl,
        file_path: filePath,
        file_size: fileSize,
        file_type: file.type,
        is_global: true,
        download_count: 0
      });
      
      const { error: dbError } = await supabase
        .from('resources')
        .insert({
          title,
          description,
          category: finalCategory,
          icon: icon.substring(0, 10), // Temporarily limit to 10 chars to avoid error
          file_url: urlData.publicUrl,
          file_path: filePath,
          file_size: fileSize,
          file_type: file.type,
          is_global: true, // For now, make all resources global
          download_count: 0
        })
        .select()
        .single();

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      alert(`Resource "${title}" has been added successfully!`);
      
      onAdd();
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(`Error uploading file: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">Add New Resource</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="e.g., Discovery Questions Playbook"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Brief description of what this resource contains..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Select a category...</option>
              {predefinedCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="custom">+ Add New Category</option>
            </select>
          </div>

          {category === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom Category *
              </label>
              <input
                type="text"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Enter new category name..."
                autoFocus
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              File Upload *
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
              <input
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
                required
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                {file ? (
                  <div className="flex items-center justify-center space-x-2">
                    <span className="text-2xl">📄</span>
                    <div>
                      <p className="text-sm font-medium text-green-600">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {file.size > 1024 * 1024 
                          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                          : `${(file.size / 1024).toFixed(0)} KB`
                        }
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="text-2xl text-gray-400">📁</span>
                    <p className="text-sm text-gray-600 mt-1">Click to select file</p>
                    <p className="text-xs text-gray-400">PDF, DOC, DOCX, PPT, PPTX (Max 10MB)</p>
                  </div>
                )}
              </label>
              {file && (
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="mt-2 text-xs text-red-600 hover:text-red-800"
                >
                  Remove file
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Icon
            </label>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <input
                  type="text"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="📄"
                />
              </div>
              <div className="flex items-center justify-center border border-gray-300 rounded-md bg-gray-50">
                <span className="text-2xl">{icon}</span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {['📄', '📊', '🎯', '🛡️', '📝', '🎓', '📚', '⚡', '🔧', '💡'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`text-lg hover:bg-gray-100 p-2 rounded border transition-colors cursor-pointer ${
                    icon === emoji ? 'bg-blue-100 border-blue-300' : 'border-gray-300'
                  }`}
                >
                  {emoji}
                </button>
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
              {saving ? 'Adding...' : 'Add Resource'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}