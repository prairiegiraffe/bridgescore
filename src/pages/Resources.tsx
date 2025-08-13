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
      
      // For now, we'll use mock data since the resources table doesn't exist yet
      // In production, this would fetch from the database
      const mockResources: Resource[] = [
        {
          id: '1',
          title: 'BridgeSelling™ Framework Guide',
          description: 'Complete guide to the 6-step BridgeSelling framework with examples and best practices.',
          icon: '🌉',
          category: 'Framework',
          file_url: '/resources/bridgeselling-framework-guide.pdf',
          last_updated: '2024-12-10',
          created_by: 'BridgeSelling Team',
          is_global: true,
          download_count: 1247,
          file_size: '2.3 MB',
          file_type: 'PDF'
        },
        {
          id: '2',
          title: 'Magic Pivots Cheat Sheet',
          description: 'Key phrases and questions to smoothly navigate between each step of the bridge.',
          icon: '🎯',
          category: 'Quick Reference',
          file_url: '/resources/magic-pivots-cheat-sheet.pdf',
          last_updated: '2024-12-08',
          created_by: 'BridgeSelling Team',
          is_global: true,
          download_count: 892,
          file_size: '1.1 MB',
          file_type: 'PDF'
        },
        {
          id: '3',
          title: 'Call Scoring Criteria',
          description: 'Detailed breakdown of how calls are scored and what constitutes excellent performance.',
          icon: '📊',
          category: 'Scoring',
          file_url: '/resources/call-scoring-criteria.pdf',
          last_updated: '2024-12-12',
          created_by: 'BridgeSelling Team',
          is_global: true,
          download_count: 634,
          file_size: '1.7 MB',
          file_type: 'PDF'
        },
        {
          id: '4',
          title: 'Objection Handling Scripts',
          description: 'Common objections and proven responses for each step of the sales process.',
          icon: '🛡️',
          category: 'Scripts',
          file_url: '/resources/objection-handling-scripts.pdf',
          last_updated: '2024-12-05',
          created_by: 'BridgeSelling Team',
          is_global: true,
          download_count: 756,
          file_size: '2.1 MB',
          file_type: 'PDF'
        },
        {
          id: '5',
          title: 'Call Flow Templates',
          description: 'Industry-specific call flow templates customized for different types of prospects.',
          icon: '📝',
          category: 'Templates',
          file_url: '/resources/call-flow-templates.pdf',
          last_updated: '2024-11-28',
          created_by: 'BridgeSelling Team',
          is_global: true,
          download_count: 923,
          file_size: '3.2 MB',
          file_type: 'PDF'
        },
        {
          id: '6',
          title: 'Self-Coaching Worksheets',
          description: 'Interactive worksheets to review your calls and identify improvement opportunities.',
          icon: '🎓',
          category: 'Worksheets',
          file_url: '/resources/self-coaching-worksheets.pdf',
          last_updated: '2024-12-01',
          created_by: 'BridgeSelling Team',
          is_global: true,
          download_count: 445,
          file_size: '1.9 MB',
          file_type: 'PDF'
        }
      ];

      setResources(mockResources);
    } catch (err) {
      console.error('Error fetching resources:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (resource: Resource) => {
    // In a real implementation, this would:
    // 1. Increment download count in database
    // 2. Log the download for analytics
    // 3. Handle file serving or redirect to external URL
    
    if (resource.external_url) {
      window.open(resource.external_url, '_blank');
    } else if (resource.file_url) {
      // For now, just alert that this is a placeholder
      alert(`This would download: ${resource.title}\nFile: ${resource.file_url}\nSize: ${resource.file_size}`);
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
            
            <button
              onClick={() => handleDownload(resource)}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-4-4m4 4l4-4m-4-4V4" />
              </svg>
              <span>Download {resource.file_type}</span>
            </button>
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Use custom category if "custom" is selected, otherwise use selected category
    const finalCategory = category === 'custom' ? customCategory : category;
    
    if (!finalCategory.trim()) {
      alert('Please select or enter a category');
      return;
    }
    
    // This would implement the actual resource creation logic
    setSaving(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    alert(`Resource would be added to the database:\nTitle: ${title}\nCategory: ${finalCategory}\nIcon: ${icon}`);
    setSaving(false);
    onAdd();
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
              Icon
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md"
                placeholder="📄"
              />
              <div className="flex items-center justify-center border border-gray-300 rounded-md bg-gray-50">
                <span className="text-2xl">{icon || '📄'}</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Common icons: 📄 📊 🎯 🛡️ 📝 🎓 📚 ⚡ 🔧 💡
            </p>
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