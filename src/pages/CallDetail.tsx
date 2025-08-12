import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { BridgeSellingScore } from '../lib/scoring';
import { usePivots } from '../hooks/usePivots';
import { useOrg } from '../contexts/OrgContext';
import { useAuth } from '../contexts/AuthContext';
import { FLAGS } from '../lib/flags';
import CoachingTaskModal from '../components/CoachingTaskModal';
import { getAssistantVersions, type AssistantVersion } from '../lib/assistants';
import { scoreBridgeSelling } from '../lib/scoring';

interface CallData {
  id: string;
  title: string;
  transcript: string;
  score_total: number;
  score_breakdown: BridgeSellingScore;
  created_at: string;
  user_id: string;
  framework_version?: string;
  assistant_version_id?: string;
  assistant_version?: {
    name: string;
    version: string;
  };
}

export default function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const [call, setCall] = useState<CallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'scorecard' | 'coaching' | 'transcript'>('scorecard');
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [showCoachingModal, setShowCoachingModal] = useState(false);
  const [showRescoreMenu, setShowRescoreMenu] = useState(false);
  const [assistantVersions, setAssistantVersions] = useState<AssistantVersion[]>([]);
  const [rescoring, setRescoring] = useState(false);

  useEffect(() => {
    fetchCall();
  }, [id]);

  // Check user's role in org
  useEffect(() => {
    checkUserRole();
  }, [user, currentOrg]);

  // Fetch assistant versions when needed
  useEffect(() => {
    if (showRescoreMenu && currentOrg && (memberRole === 'owner' || memberRole === 'admin')) {
      fetchAssistantVersions();
    }
  }, [showRescoreMenu, currentOrg, memberRole]);

  // Close rescore menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showRescoreMenu && !(event.target as Element).closest('.relative')) {
        setShowRescoreMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showRescoreMenu]);

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
    } catch (err) {
      console.error('Error checking role:', err);
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

  const fetchCall = async () => {
    if (!id) return;

    try {
      // First try with assistant version join
      let { data, error: fetchError } = await (supabase as any)
        .from('calls')
        .select(`
          *,
          assistant_version:ai_assistant_versions(name, version)
        `)
        .eq('id', id)
        .single();

      // If that fails, try without the join (backwards compatibility)
      if (fetchError && fetchError.code) {
        const { data: fallbackData, error: fallbackError } = await (supabase as any)
          .from('calls')
          .select('*')
          .eq('id', id)
          .single();
        
        if (fallbackError) throw fallbackError;
        data = fallbackData;
      } else if (fetchError) {
        throw fetchError;
      }

      setCall(data);
    } catch (err) {
      console.error('Error fetching call:', err);
      setError('Failed to load call details.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getColorClasses = (color: 'green' | 'yellow' | 'red') => {
    switch (color) {
      case 'green':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'yellow':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'red':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const stepLabels = {
    pinpoint_pain: 'Pinpoint Pain',
    qualify: 'Qualify',
    solution_success: 'Solution Success',
    qa: 'Q&A',
    next_steps: 'Next Steps',
    close_or_schedule: 'Close or Schedule',
  };

  // Coaching analysis
  const getCoachingAnalysis = () => {
    if (!call) return { strengths: [], improvements: [] };

    const steps = Object.entries(call.score_breakdown)
      .filter(([key]) => key !== 'total')
      .map(([key, step]: [string, any]) => ({
        key,
        name: stepLabels[key as keyof typeof stepLabels],
        ...step,
      }))
      .sort((a, b) => b.credit - a.credit);

    const strengths = steps
      .filter(step => step.credit >= 0.5)
      .slice(0, 3);

    const improvements = steps
      .filter(step => step.credit < 0.5)
      .slice(0, 3);

    return { strengths, improvements };
  };

  const { strengths, improvements } = getCoachingAnalysis();

  // Team action functions
  const handleSendToReview = async () => {
    if (!call || !currentOrg || !user || memberRole !== 'owner' && memberRole !== 'admin') return;

    try {
      const { error } = await (supabase as any)
        .from('review_queue')
        .insert({
          org_id: currentOrg.id,
          call_id: call.id,
          status: 'new'
        });

      if (error) throw error;
      alert('Call sent to review queue successfully!');
    } catch (err: any) {
      if (err.code === '23505') { // Unique constraint violation
        alert('This call is already in the review queue.');
      } else {
        console.error('Error sending to review:', err);
        alert('Review queue not available yet. Please run database migrations.');
      }
    }
  };

  const handleCreateCoachingTask = async (stepKey: string, dueDate: string) => {
    if (!call || !currentOrg || !user || memberRole !== 'owner' && memberRole !== 'admin') return;

    try {
      const { error } = await (supabase as any)
        .from('coaching_tasks')
        .insert({
          org_id: currentOrg.id,
          rep_user_id: call.user_id,
          call_id: call.id,
          step_key: stepKey,
          status: 'todo',
          due_date: dueDate || null
        });

      if (error) throw error;
      alert('Coaching task created successfully!');
      setShowCoachingModal(false);
    } catch (err) {
      console.error('Error creating coaching task:', err);
      alert('Coaching tasks not available yet. Please run database migrations.');
    }
  };

  const handleRescore = async (assistantVersionId: string) => {
    if (!call || !currentOrg || !user || memberRole !== 'owner' && memberRole !== 'admin') return;

    setRescoring(true);
    try {
      // Re-run the scoring function
      const newScore = scoreBridgeSelling(call.transcript);
      
      // Find the selected version details
      const selectedVersion = assistantVersions.find(v => v.id === assistantVersionId);
      
      // Prepare update data - only include new columns if they exist
      let updateData: any = {
        score_total: newScore.total,
        score_breakdown: newScore
      };

      // Add version info if supported (try/catch for backwards compatibility)
      try {
        updateData.assistant_version_id = assistantVersionId;
        updateData.framework_version = '1.0';
      } catch (e) {
        // Continue without version tracking if columns don't exist
      }

      // Update the call with new score and version info
      const { error } = await (supabase as any)
        .from('calls')
        .update(updateData)
        .eq('id', call.id);

      if (error) throw error;
      
      // Refresh the call data to show updated scores and chips
      await fetchCall();
      
      alert(`Call rescored successfully with ${selectedVersion?.name} v${selectedVersion?.version}!`);
      setShowRescoreMenu(false);
    } catch (err) {
      console.error('Error rescoring call:', err);
      alert('Failed to rescore call. Please try again.');
    } finally {
      setRescoring(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  if (error || !call) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error || 'Call not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/dashboard"
          className="text-blue-600 hover:text-blue-800 text-sm mb-2 inline-block"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">{call.title}</h1>
        <div className="flex items-center space-x-4 mt-2">
          <p className="text-gray-500">{formatDate(call.created_at)}</p>
          
          {/* Version Chips */}
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Framework v{call.framework_version || '1.0'}
            </span>
            {call.assistant_version && call.assistant_version.name && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                {call.assistant_version.name} v{call.assistant_version.version}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Score Summary */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Overall Score</h2>
          <div className="flex items-center space-x-4">
            <div className="text-3xl font-bold text-blue-600">
              {call.score_total}/20
            </div>
            {/* Admin Actions */}
            {(memberRole === 'owner' || memberRole === 'admin') && (
              <div className="flex space-x-2">
                {FLAGS.TEAM_BOARDS && (
                  <>
                    <button
                      onClick={handleSendToReview}
                      className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                    >
                      Send to Review
                    </button>
                    <button
                      onClick={() => setShowCoachingModal(true)}
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                    >
                      Create Task
                    </button>
                  </>
                )}
                {FLAGS.RESCORE_WITH_VERSION && (
                  <div className="relative">
                    <button
                      onClick={() => setShowRescoreMenu(!showRescoreMenu)}
                      className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700"
                      disabled={rescoring}
                    >
                      {rescoring ? 'Rescoring...' : 'Re-score'}
                    </button>
                    
                    {/* Re-score Menu */}
                    {showRescoreMenu && (
                      <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                        <div className="py-1">
                          <div className="px-4 py-2 text-sm text-gray-700 border-b border-gray-200">
                            Select Assistant Version
                          </div>
                          {assistantVersions.map(version => (
                            <button
                              key={version.id}
                              onClick={() => handleRescore(version.id)}
                              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              disabled={rescoring}
                            >
                              {version.name} v{version.version}
                              {version.is_active && (
                                <span className="ml-2 text-xs text-green-600">(Active)</span>
                              )}
                            </button>
                          ))}
                          {assistantVersions.length === 0 && (
                            <div className="px-4 py-2 text-sm text-gray-500">
                              No assistant versions available
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex">
            <button
              onClick={() => setActiveTab('scorecard')}
              className={`py-3 px-6 text-sm font-medium ${
                activeTab === 'scorecard'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Scorecard
            </button>
            <button
              onClick={() => setActiveTab('coaching')}
              className={`py-3 px-6 text-sm font-medium ${
                activeTab === 'coaching'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Coaching
            </button>
            <button
              onClick={() => setActiveTab('transcript')}
              className={`py-3 px-6 text-sm font-medium ${
                activeTab === 'transcript'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Raw Transcript
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'scorecard' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Bridge Selling Scorecard
              </h3>
              
              {Object.entries(call.score_breakdown).map(([key, value]) => {
                if (key === 'total') return null;
                
                const step = value as any;
                const stepName = stepLabels[key as keyof typeof stepLabels];
                
                return (
                  <div key={key} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900">{stepName}</h4>
                      <div className="flex items-center space-x-2">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getColorClasses(step.color)}`}
                        >
                          {step.credit === 1 ? 'Full' : step.credit === 0.5 ? 'Partial' : 'None'}
                        </span>
                        <span className="text-sm font-medium text-gray-600">
                          {step.credit} × {step.weight} = {step.credit * step.weight}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">{step.notes}</p>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'coaching' && (
            <CoachingTab strengths={strengths} improvements={improvements} />
          )}

          {activeTab === 'transcript' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Call Transcript
              </h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                  {call.transcript}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Coaching Task Modal */}
      {showCoachingModal && (
        <CoachingTaskModal
          onClose={() => setShowCoachingModal(false)}
          onCreate={handleCreateCoachingTask}
          stepLabels={stepLabels}
        />
      )}
    </div>
  );
}

// Coaching Tab Component
interface CoachingTabProps {
  strengths: any[];
  improvements: any[];
}

function CoachingTab({ strengths, improvements }: CoachingTabProps) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">
        Coaching Insights
      </h3>

      {/* Strengths Section */}
      <div>
        <h4 className="text-md font-medium text-green-700 mb-3 flex items-center">
          <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
          Things Done Well
        </h4>
        <div className="space-y-3">
          {strengths.length > 0 ? (
            strengths.map((step) => (
              <div
                key={step.key}
                className="bg-green-50 border border-green-200 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-green-900">{step.name}</h5>
                  <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                    {step.credit === 1 ? 'Excellent' : 'Good'}
                  </span>
                </div>
                <p className="text-sm text-green-700">{step.notes}</p>
              </div>
            ))
          ) : (
            <p className="text-gray-500 italic">No strong areas identified in this call.</p>
          )}
        </div>
      </div>

      {/* Improvements Section */}
      <div>
        <h4 className="text-md font-medium text-orange-700 mb-3 flex items-center">
          <span className="w-2 h-2 bg-orange-500 rounded-full mr-2"></span>
          Areas for Improvement
        </h4>
        <div className="space-y-4">
          {improvements.length > 0 ? (
            improvements.map((step) => (
              <div key={step.key}>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-medium text-orange-900">{step.name}</h5>
                    <span className="bg-orange-100 text-orange-800 text-xs font-medium px-2 py-1 rounded-full">
                      Needs Work
                    </span>
                  </div>
                  <p className="text-sm text-orange-700 mb-3">{step.notes}</p>
                </div>
                
                {/* Pivot suggestions for this weak step */}
                <PivotSuggestions stepKey={step.key} stepName={step.name} />
              </div>
            ))
          ) : (
            <p className="text-gray-500 italic">All areas performed well!</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Pivot Suggestions Component
interface PivotSuggestionsProps {
  stepKey: string;
  stepName: string;
}

function PivotSuggestions({ stepKey, stepName }: PivotSuggestionsProps) {
  const { pivots, loading, error } = usePivots(stepKey);

  if (loading) {
    return (
      <div className="ml-4 p-3 bg-gray-50 rounded-lg">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error || !pivots.length) {
    return (
      <div className="ml-4 p-3 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-500">
          No coaching suggestions available for {stepName}.
        </p>
      </div>
    );
  }

  return (
    <div className="ml-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <h6 className="text-sm font-medium text-blue-900 mb-2">
        Coaching Questions for {stepName}:
      </h6>
      <ul className="space-y-1">
        {pivots.slice(0, 3).map((pivot) => (
          <li key={pivot.id} className="text-sm text-blue-700 flex items-start">
            <span className="text-blue-400 mr-2">•</span>
            {pivot.prompt}
          </li>
        ))}
      </ul>
      {pivots.length > 3 && (
        <p className="text-xs text-blue-600 mt-2">
          +{pivots.length - 3} more suggestions available
        </p>
      )}
    </div>
  );
}