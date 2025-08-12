import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { supabase } from '../lib/supabase';
import { scoreBridgeSelling } from '../lib/scoring';
import { FLAGS } from '../lib/flags';
import { getActiveAssistantVersion, getAssistantVersions, type AssistantVersion } from '../lib/assistants';

interface Call {
  id: string;
  title: string;
  score_total: number;
  created_at: string;
  user_id: string;
  framework_version?: string;
  assistant_version_id?: string;
  user?: {
    email: string;
  };
  assistant_version?: {
    name: string;
    version: string;
  };
}

interface FilterParams {
  rep?: string;
  dateFrom?: string;
  dateTo?: string;
  scoreMin?: string;
  scoreMax?: string;
  assistantVersion?: string;
  framework?: string;
}

interface SavedView {
  id: string;
  name: string;
  params: FilterParams;
  user_id: string;
  created_at: string;
  user?: {
    email: string;
  };
}

export default function Dashboard() {
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentCalls, setRecentCalls] = useState<Call[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  
  // Filter state
  const [searchParams, setSearchParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [assistantVersions, setAssistantVersions] = useState<AssistantVersion[]>([]);
  const [orgMembers, setOrgMembers] = useState<Array<{id: string, email: string}>>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveViewName, setSaveViewName] = useState('');
  
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const navigate = useNavigate();

  // Get current filters from URL
  const currentFilters: FilterParams = {
    rep: searchParams.get('rep') || undefined,
    dateFrom: searchParams.get('dateFrom') || undefined,
    dateTo: searchParams.get('dateTo') || undefined,
    scoreMin: searchParams.get('scoreMin') || undefined,
    scoreMax: searchParams.get('scoreMax') || undefined,
    assistantVersion: searchParams.get('assistantVersion') || undefined,
    framework: searchParams.get('framework') || undefined,
  };

  // Fetch recent calls when user, org, or filters change
  useEffect(() => {
    fetchRecentCalls();
  }, [user, currentOrg, searchParams]);

  // Load filter data
  useEffect(() => {
    if (currentOrg) {
      loadFilterData();
    }
  }, [currentOrg]);

  const fetchRecentCalls = async () => {
    if (!user) return;
    
    try {
      setCallsLoading(true);
      // Try enhanced query first, fall back to basic query if columns don't exist
      let query = (supabase as any)
        .from('calls')
        .select('id, title, score_total, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      // Base org/user filtering
      if (FLAGS.ORGS && currentOrg) {
        query = query.eq('org_id', currentOrg.id);
      } else if (FLAGS.ORGS) {
        query = query.eq('user_id', user.id);
      } else {
        query = query.eq('user_id', user.id).is('org_id', null);
      }

      // Apply filters
      if (currentFilters.rep) {
        query = query.eq('user_id', currentFilters.rep);
      }
      
      if (currentFilters.dateFrom) {
        query = query.gte('created_at', `${currentFilters.dateFrom}T00:00:00`);
      }
      
      if (currentFilters.dateTo) {
        query = query.lte('created_at', `${currentFilters.dateTo}T23:59:59`);
      }
      
      if (currentFilters.scoreMin) {
        query = query.gte('score_total', parseInt(currentFilters.scoreMin));
      }
      
      if (currentFilters.scoreMax) {
        query = query.lte('score_total', parseInt(currentFilters.scoreMax));
      }
      
      if (currentFilters.assistantVersion) {
        query = query.eq('assistant_version_id', currentFilters.assistantVersion);
      }
      
      if (currentFilters.framework) {
        query = query.eq('framework_version', currentFilters.framework);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRecentCalls(data || []);
    } catch (err) {
      console.error('Error fetching calls:', err);
    } finally {
      setCallsLoading(false);
    }
  };

  const loadFilterData = async () => {
    if (!currentOrg) return;

    try {
      // Load assistant versions (gracefully handle missing table)
      try {
        const versions = await getAssistantVersions(currentOrg.id);
        setAssistantVersions(versions);
      } catch (err) {
        console.warn('Assistant versions not available:', err);
        setAssistantVersions([]);
      }

      // Load org members (gracefully handle missing table)
      try {
        const { data: memberData } = await (supabase as any)
          .from('memberships')
          .select(`
            user_id,
            user:user_id(email)
          `)
          .eq('org_id', currentOrg.id);

        if (memberData) {
          setOrgMembers(memberData.map((m: any) => ({
            id: m.user_id,
            email: m.user.email
          })));
        }
      } catch (err) {
        console.warn('Org members not available:', err);
        setOrgMembers([]);
      }

      // Load saved views (gracefully handle missing table)
      try {
        const { data: viewData } = await (supabase as any)
          .from('saved_views')
          .select(`
            *,
            user:user_id(email)
          `)
          .eq('org_id', currentOrg.id)
          .order('created_at', { ascending: false });

        if (viewData) {
          setSavedViews(viewData);
        }
      } catch (err) {
        console.warn('Saved views not available:', err);
        setSavedViews([]);
      }
    } catch (err) {
      console.error('Error loading filter data:', err);
    }
  };

  const updateFilter = (key: keyof FilterParams, value: string | undefined) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const loadSavedView = (view: SavedView) => {
    const newParams = new URLSearchParams();
    Object.entries(view.params).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value);
      }
    });
    setSearchParams(newParams);
  };

  const saveCurrentView = async () => {
    if (!currentOrg || !saveViewName.trim()) return;

    try {
      const { error } = await (supabase as any)
        .from('saved_views')
        .insert({
          org_id: currentOrg.id,
          user_id: user?.id,
          name: saveViewName.trim(),
          params: currentFilters
        });

      if (error) throw error;
      
      await loadFilterData();
      setShowSaveModal(false);
      setSaveViewName('');
      alert('Filter saved successfully!');
    } catch (err) {
      console.error('Error saving view:', err);
      alert('Filter saving not available yet. Please run database migrations.');
    }
  };

  const scoreCallWithOpenAI = async (transcript: string, org: any) => {
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
            action: 'score_call',
            transcript,
            organizationId: org.id
          })
        }
      );

      const result = await response.json();
      
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to score call with OpenAI');
      }

      return result;
    } catch (err) {
      console.error('Error scoring call with OpenAI:', err);
      throw new Error(`OpenAI scoring failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transcript.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Check if organization has OpenAI assistant configured
      if (!currentOrg?.openai_assistant_id) {
        setError('System is being configured. Please contact support@bridgeselling.com for information.');
        setLoading(false);
        return;
      }

      // Score the transcript using OpenAI
      const score = await scoreCallWithOpenAI(transcript, currentOrg);
      
      // Get active assistant version if org is enabled
      let assistantVersionId = null;
      if (FLAGS.ORGS && currentOrg) {
        const activeVersion = await getActiveAssistantVersion(currentOrg.id);
        assistantVersionId = activeVersion?.id || null;
      }

      // Insert into database
      const baseCallData = {
        user_id: user?.id,
        title: title.trim() || 'Untitled Call',
        transcript: transcript.trim(),
        score_total: score.total,
        score_breakdown: score.stepScores,
        coaching: score.coaching,
        openai_raw_response: score,
        framework_version: '1.0',
        assistant_version_id: assistantVersionId,
      };

      const callData = FLAGS.ORGS && currentOrg 
        ? { ...baseCallData, org_id: currentOrg.id }
        : baseCallData;

      const { data, error: insertError } = await (supabase as any)
        .from('calls')
        .insert(callData)
        .select()
        .single();

      if (insertError) throw insertError;

      // Navigate to call detail page
      navigate(`/calls/${data.id}`);
      
      // Refresh the recent calls list
      fetchRecentCalls();
    } catch (err) {
      console.error('Error creating call:', err);
      setError('Failed to create call. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 16) return 'text-green-600 bg-green-100';
    if (score >= 10) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>
      
      {/* Create New Call Form */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Score a New Call</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Call Title (optional)
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Discovery call with Acme Corp"
            />
          </div>

          <div>
            <label htmlFor="transcript" className="block text-sm font-medium text-gray-700 mb-2">
              Call Transcript *
            </label>
            <textarea
              id="transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              required
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Paste your call transcript here..."
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !transcript.trim()}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Scoring Call...' : 'Score Call'}
          </button>
        </form>
      </div>

      {/* Filter Panel */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">All Calls</h2>
          <div className="flex space-x-2">
            {/* Saved Views Dropdown */}
            {savedViews.length > 0 && (
              <select
                onChange={(e) => {
                  const view = savedViews.find(v => v.id === e.target.value);
                  if (view) loadSavedView(view);
                }}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md"
                value=""
              >
                <option value="">Load Saved Filter...</option>
                {savedViews.map(view => (
                  <option key={view.id} value={view.id}>
                    {view.name} {view.user?.email !== user?.email ? `(by ${view.user?.email})` : ''}
                  </option>
                ))}
              </select>
            )}
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        {showFilters && (
          <div className="border-t border-gray-200 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {/* Rep Filter */}
              {FLAGS.ORGS && orgMembers.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rep
                  </label>
                  <select
                    value={currentFilters.rep || ''}
                    onChange={(e) => updateFilter('rep', e.target.value || undefined)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                  >
                    <option value="">All Reps</option>
                    {orgMembers.map(member => (
                      <option key={member.id} value={member.id}>
                        {member.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date From */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={currentFilters.dateFrom || ''}
                  onChange={(e) => updateFilter('dateFrom', e.target.value || undefined)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={currentFilters.dateTo || ''}
                  onChange={(e) => updateFilter('dateTo', e.target.value || undefined)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                />
              </div>

              {/* Score Min */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Score
                </label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={currentFilters.scoreMin || ''}
                  onChange={(e) => updateFilter('scoreMin', e.target.value || undefined)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                  placeholder="0"
                />
              </div>

              {/* Score Max */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Score
                </label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={currentFilters.scoreMax || ''}
                  onChange={(e) => updateFilter('scoreMax', e.target.value || undefined)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                  placeholder="20"
                />
              </div>

              {/* Assistant Version */}
              {assistantVersions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assistant Version
                  </label>
                  <select
                    value={currentFilters.assistantVersion || ''}
                    onChange={(e) => updateFilter('assistantVersion', e.target.value || undefined)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                  >
                    <option value="">All Versions</option>
                    {assistantVersions.map(version => (
                      <option key={version.id} value={version.id}>
                        {version.name} v{version.version}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Framework Version */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Framework
                </label>
                <select
                  value={currentFilters.framework || ''}
                  onChange={(e) => updateFilter('framework', e.target.value || undefined)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                >
                  <option value="">All Frameworks</option>
                  <option value="1.0">Framework v1.0</option>
                </select>
              </div>
            </div>

            {/* Filter Actions */}
            <div className="flex justify-between items-center">
              <div className="flex space-x-2">
                <button
                  onClick={clearFilters}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                >
                  Clear All
                </button>
                <button
                  onClick={() => setShowSaveModal(true)}
                  disabled={Object.values(currentFilters).every(v => !v)}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  Save Filter
                </button>
              </div>
              
              <div className="text-sm text-gray-500">
                {recentCalls.length} call{recentCalls.length !== 1 ? 's' : ''} found
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Calls List */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Calls</h2>
        
        {callsLoading ? (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : recentCalls.length === 0 ? (
          <p className="text-gray-600 text-center py-4">
            No calls yet. Score your first call above to get started!
          </p>
        ) : (
          <div className="space-y-3">
            {recentCalls.map((call) => (
              <Link
                key={call.id}
                to={`/calls/${call.id}`}
                className="block border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {call.title}
                    </h3>
                    <div className="flex items-center space-x-4 mt-1">
                      <p className="text-sm text-gray-500">
                        {formatDate(call.created_at)}
                      </p>
                      {FLAGS.ORGS && call.user?.email && (
                        <p className="text-sm text-gray-500">
                          by {call.user.email}
                        </p>
                      )}
                      {call.assistant_version && (
                        <span className="text-xs text-gray-400">
                          {call.assistant_version.name} v{call.assistant_version.version}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getScoreColor(call.score_total)}`}>
                      {call.score_total}/20
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Save Filter Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Save Filter</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter Name
              </label>
              <input
                type="text"
                value={saveViewName}
                onChange={(e) => setSaveViewName(e.target.value)}
                placeholder="e.g., High Score Calls This Month"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                autoFocus
              />
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Current filters will be saved:
              </p>
              <ul className="text-xs text-gray-500 mt-2 space-y-1">
                {Object.entries(currentFilters).map(([key, value]) => 
                  value ? (
                    <li key={key}>
                      <strong>{key}:</strong> {value}
                    </li>
                  ) : null
                )}
              </ul>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setSaveViewName('');
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={saveCurrentView}
                disabled={!saveViewName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Save Filter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}