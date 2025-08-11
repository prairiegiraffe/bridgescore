import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { supabase } from '../lib/supabase';
import { scoreBridgeSelling } from '../lib/scoring';
import { FLAGS } from '../lib/flags';

interface Call {
  id: string;
  title: string;
  score_total: number;
  created_at: string;
}

export default function Dashboard() {
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentCalls, setRecentCalls] = useState<Call[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const navigate = useNavigate();

  // Fetch recent calls
  useEffect(() => {
    fetchRecentCalls();
  }, [user, currentOrg]);

  const fetchRecentCalls = async () => {
    if (!user) return;
    
    try {
      let query = (supabase as any)
        .from('calls')
        .select('id, title, score_total, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      if (FLAGS.ORGS && currentOrg) {
        // Org-scoped: only calls from current org
        query = query.eq('org_id', currentOrg.id);
      } else {
        // Legacy: personal calls only
        query = query.eq('user_id', user.id).is('org_id', null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transcript.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Score the transcript
      const score = scoreBridgeSelling(transcript);

      // Insert into database
      const baseCallData = {
        user_id: user?.id,
        title: title.trim() || 'Untitled Call',
        transcript: transcript.trim(),
        score_total: score.total,
        score_breakdown: score,
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
    <div className="p-6 max-w-4xl mx-auto">
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
                    <p className="text-sm text-gray-500">
                      {formatDate(call.created_at)}
                    </p>
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
    </div>
  );
}