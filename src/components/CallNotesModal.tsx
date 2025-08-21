import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';

interface CallNote {
  id: string;
  call_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  note_type: 'flag' | 'manager' | 'trainer' | 'user' | 'general';
  title?: string;
  content: string;
  is_private: boolean;
  visible_to_user: boolean;
  created_by_name?: string;
}

interface CallNotesModalProps {
  callId: string;
  callTitle: string;
  callUserId: string;
  onClose: () => void;
}

export default function CallNotesModal({ callId, callTitle, callUserId, onClose }: CallNotesModalProps) {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const [notes, setNotes] = useState<CallNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'view' | 'add'>('view');
  
  // New note form state
  const [newNoteType, setNewNoteType] = useState<CallNote['note_type']>('user');
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNotePrivate, setNewNotePrivate] = useState(false);
  const [newNoteVisibleToUser, setNewNoteVisibleToUser] = useState(true);
  
  // Edit state
  const [editingNote, setEditingNote] = useState<CallNote | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  
  // User permissions
  const [userRole, setUserRole] = useState<string>('member');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isCallOwner, setIsCallOwner] = useState(false);

  useEffect(() => {
    fetchNotes();
    checkUserPermissions();
  }, [callId, user]);

  const checkUserPermissions = async () => {
    if (!user || !currentOrg) return;
    
    // Check if user is the call owner
    setIsCallOwner(user.id === callUserId);
    
    // Check SuperAdmin status and role
    try {
      const { data: membership } = await (supabase as any)
        .from('memberships')
        .select('role, is_superadmin')
        .eq('user_id', user.id)
        .eq('org_id', currentOrg.id)
        .single();
      
      if (membership) {
        setUserRole(membership.role || 'member');
        setIsSuperAdmin(membership.is_superadmin || false);
      }
    } catch (err) {
      console.error('Error checking permissions:', err);
    }
  };

  const canCreateManagerNotes = () => {
    return isSuperAdmin || ['manager', 'admin', 'owner'].includes(userRole.toLowerCase());
  };

  const canCreateTrainerNotes = () => {
    return isSuperAdmin || ['trainer', 'manager', 'admin', 'owner'].includes(userRole.toLowerCase());
  };

  const canEditNote = (note: CallNote) => {
    return note.created_by === user?.id || canCreateManagerNotes();
  };

  const fetchNotes = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('call_notes')
        .select('*')
        .eq('call_id', callId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch user names for each note
      const notesWithNames = await Promise.all(
        (data || []).map(async (note: CallNote) => {
          const userName = await fetchUserName(note.created_by);
          return { ...note, created_by_name: userName };
        })
      );

      setNotes(notesWithNames);
    } catch (err) {
      console.error('Error fetching notes:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserName = async (userId: string): Promise<string> => {
    try {
      // Try auth.users first
      let { data: userData } = await (supabase as any)
        .from('auth.users')
        .select('raw_user_meta_data')
        .eq('id', userId)
        .single();

      if (userData?.raw_user_meta_data?.full_name) {
        return userData.raw_user_meta_data.full_name;
      }

      // Fallback to profiles
      const { data: profileData } = await (supabase as any)
        .from('profiles')
        .select('full_name, email')
        .eq('id', userId)
        .single();

      return profileData?.full_name || profileData?.email || 'Unknown User';
    } catch (err) {
      return 'Unknown User';
    }
  };

  const handleSaveNote = async () => {
    if (!newNoteContent.trim() || !user) return;

    setSaving(true);
    try {
      const noteData = {
        call_id: callId,
        created_by: user.id,
        note_type: newNoteType,
        title: newNoteTitle.trim() || null,
        content: newNoteContent.trim(),
        is_private: newNotePrivate,
        visible_to_user: newNoteVisibleToUser
      };

      const { error } = await (supabase as any)
        .from('call_notes')
        .insert(noteData);

      if (error) throw error;

      // Reset form
      setNewNoteContent('');
      setNewNoteTitle('');
      setNewNotePrivate(false);
      setNewNoteVisibleToUser(true);
      setActiveTab('view');
      
      // Refresh notes
      await fetchNotes();
      
    } catch (err) {
      console.error('Error saving note:', err);
      alert('Failed to save note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditNote = async () => {
    if (!editingNote || !editContent.trim()) return;

    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('call_notes')
        .update({
          title: editTitle.trim() || null,
          content: editContent.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', editingNote.id);

      if (error) throw error;

      setEditingNote(null);
      setEditContent('');
      setEditTitle('');
      
      await fetchNotes();
      
    } catch (err) {
      console.error('Error updating note:', err);
      alert('Failed to update note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      const { error } = await (supabase as any)
        .from('call_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
      
      await fetchNotes();
      
    } catch (err) {
      console.error('Error deleting note:', err);
      alert('Failed to delete note. Please try again.');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getNoteTypeColor = (type: CallNote['note_type']) => {
    switch (type) {
      case 'flag': return 'bg-red-100 text-red-800';
      case 'manager': return 'bg-purple-100 text-purple-800';
      case 'trainer': return 'bg-blue-100 text-blue-800';
      case 'user': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getNoteTypeLabel = (type: CallNote['note_type']) => {
    switch (type) {
      case 'flag': return '🚩 Flag';
      case 'manager': return '👔 Manager';
      case 'trainer': return '🎓 Trainer';
      case 'user': return '👤 User';
      default: return '📝 General';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Call Notes</h2>
            <p className="text-sm text-gray-500">{callTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 py-2 border-b border-gray-200">
          <nav className="flex space-x-4">
            <button
              onClick={() => setActiveTab('view')}
              className={`px-3 py-2 text-sm font-medium rounded-md ${
                activeTab === 'view' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              View Notes ({notes.length})
            </button>
            <button
              onClick={() => setActiveTab('add')}
              className={`px-3 py-2 text-sm font-medium rounded-md ${
                activeTab === 'add' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Add Note
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'view' && (
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-500">Loading notes...</p>
                </div>
              ) : notes.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>No notes yet</p>
                  <p className="text-sm mt-1">Add the first note to get started</p>
                </div>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getNoteTypeColor(note.note_type)}`}>
                          {getNoteTypeLabel(note.note_type)}
                        </span>
                        {note.is_private && (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
                            🔒 Private
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {canEditNote(note) && (
                          <>
                            <button
                              onClick={() => {
                                setEditingNote(note);
                                setEditContent(note.content);
                                setEditTitle(note.title || '');
                              }}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {note.title && (
                      <h4 className="font-medium text-gray-900 mb-1">{note.title}</h4>
                    )}
                    
                    <p className="text-gray-700 whitespace-pre-wrap mb-2">{note.content}</p>
                    
                    <div className="text-xs text-gray-500">
                      by {note.created_by_name} on {formatDate(note.created_at)}
                      {note.updated_at !== note.created_at && (
                        <span> • edited {formatDate(note.updated_at)}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'add' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Note Type
                </label>
                <select
                  value={newNoteType}
                  onChange={(e) => setNewNoteType(e.target.value as CallNote['note_type'])}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="user">👤 User Note</option>
                  {canCreateManagerNotes() && <option value="manager">👔 Manager Note</option>}
                  {canCreateTrainerNotes() && <option value="trainer">🎓 Trainer Note</option>}
                  <option value="general">📝 General Note</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title (Optional)
                </label>
                <input
                  type="text"
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  placeholder="Enter a title for this note..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Note Content *
                </label>
                <textarea
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder="Enter your note here..."
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {(newNoteType === 'manager' || newNoteType === 'trainer') && (
                <div className="space-y-3">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="private-note"
                      checked={newNotePrivate}
                      onChange={(e) => setNewNotePrivate(e.target.checked)}
                      className="mr-2"
                    />
                    <label htmlFor="private-note" className="text-sm text-gray-700">
                      🔒 Private note (only managers/trainers can see)
                    </label>
                  </div>

                  {!newNotePrivate && (
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="visible-to-user"
                        checked={newNoteVisibleToUser}
                        onChange={(e) => setNewNoteVisibleToUser(e.target.checked)}
                        className="mr-2"
                      />
                      <label htmlFor="visible-to-user" className="text-sm text-gray-700">
                        👁️ Visible to call owner
                      </label>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  onClick={() => setActiveTab('view')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNote}
                  disabled={!newNoteContent.trim() || saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Edit Modal */}
        {editingNote && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold">Edit Note</h3>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setEditingNote(null);
                    setEditContent('');
                    setEditTitle('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditNote}
                  disabled={!editContent.trim() || saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}