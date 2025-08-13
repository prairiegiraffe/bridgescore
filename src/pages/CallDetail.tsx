import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { usePivots } from '../hooks/usePivots';
import { useOrg } from '../contexts/OrgContext';
import { useAuth } from '../contexts/AuthContext';
import { FLAGS } from '../lib/flags';
import CoachingTaskModal from '../components/CoachingTaskModal';
import { getAssistantVersions, type AssistantVersion } from '../lib/assistants';
import { rescoreCall } from '../lib/newCallScoring';

interface CallData {
  id: string;
  title: string;
  transcript: string;
  score_total: number;
  score_breakdown: any; // Will be either old BridgeSellingScore or new OpenAI stepScores array
  coaching?: {
    thingsTheyDidWell: string[];
    areasForImprovement: Array<{
      area: string;
      howToImprove: string;
      bridgeStep: string;
    }>;
  };
  created_at: string;
  user_id: string;
  framework_version?: string;
  assistant_version_id?: string;
  assistant_version?: {
    name: string;
    version: string;
  };
  scoring_method?: 'local' | 'openai';
  client_id?: string;
  openai_thread_id?: string;
  openai_run_id?: string;
  openai_raw_response?: any;
}

export default function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const [call, setCall] = useState<CallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'scorecard' | 'coaching' | 'transcript' | 'ai-reasoning' | 'debug'>('scorecard');
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [showCoachingModal, setShowCoachingModal] = useState(false);
  const [showRescoreMenu, setShowRescoreMenu] = useState(false);
  const [assistantVersions, setAssistantVersions] = useState<AssistantVersion[]>([]);
  const [rescoring, setRescoring] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    fetchCall();
  }, [id]);

  // Check user's role in org
  useEffect(() => {
    checkUserRole();
    checkSuperAdminAccess();
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

    const steps = renderScoreBreakdown().map(({ key, step, stepName }) => ({
      key,
      name: stepName,
      ...step,
    })).sort((a, b) => b.credit - a.credit);

    const strengths = steps
      .filter(step => step.credit >= 0.5)
      .slice(0, 3);

    const improvements = steps
      .filter(step => step.credit < 0.5)
      .slice(0, 3);

    return { strengths, improvements };
  };

  const checkSuperAdminAccess = async () => {
    if (!user || !currentOrg) {
      setIsSuperAdmin(false);
      return;
    }

    try {
      const { data, error } = await (supabase as any)
        .from('memberships')
        .select('is_superadmin')
        .eq('user_id', user.id)
        .eq('is_superadmin', true)
        .single();

      if (!error && data) {
        setIsSuperAdmin(true);
      } else {
        setIsSuperAdmin(false);
      }
    } catch (err) {
      console.error('Error checking SuperAdmin access:', err);
      setIsSuperAdmin(false);
    }
  };

  // Render score breakdown for both old and new formats
  const renderScoreBreakdown = () => {
    if (!call) return [];
    
    // New OpenAI format (array of stepScores)
    if (Array.isArray(call.score_breakdown)) {
      return call.score_breakdown.map((stepScore: any) => ({
        key: stepScore.step,
        step: stepScore,
        stepName: stepScore.stepName
      }));
    }
    
    // Old format (object with keys)
    return Object.entries(call.score_breakdown)
      .filter(([key]) => key !== 'total')
      .map(([key, step]: [string, any]) => ({
        key,
        step,
        stepName: stepLabels[key as keyof typeof stepLabels]
      }));
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

  const handleDirectRescore = async () => {
    if (!call) return;
    
    setRescoring(true);
    try {
      // Use the new rescoreCall function which handles organization-based OpenAI integration
      await rescoreCall(call.id);
      
      // Refresh the call data to show updated scores and coaching
      await fetchCall();
      
      alert('Call rescored successfully with OpenAI!');
    } catch (err) {
      console.error('Error rescoring call:', err);
      alert('Failed to rescore call. Please check your OpenAI configuration and try again.');
    } finally {
      setRescoring(false);
    }
  };

  const handleRescore = async (assistantVersionId: string) => {
    if (!call || !currentOrg || !user || memberRole !== 'owner' && memberRole !== 'admin') return;

    setRescoring(true);
    try {
      // Find the selected version details
      const selectedVersion = assistantVersions.find(v => v.id === assistantVersionId);
      
      // Use the new rescoreCall function which handles client-based OpenAI integration
      await rescoreCall(call.id);
      
      // Refresh the call data to show updated scores and chips
      await fetchCall();
      
      const versionName = selectedVersion ? 
        `${selectedVersion.name} v${selectedVersion.version}` : 
        'selected assistant';
      alert(`Call rescored successfully with ${versionName}!`);
      setShowRescoreMenu(false);
    } catch (err) {
      console.error('Error rescoring call:', err);
      alert('Failed to rescore call. Please check your OpenAI configuration and try again.');
    } finally {
      setRescoring(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  if (error || !call) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error || 'Call not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
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
                {(FLAGS.RESCORE_WITH_VERSION || true) && (
                  <button
                    onClick={handleDirectRescore}
                    className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700"
                    disabled={rescoring}
                  >
                    {rescoring ? 'Rescoring...' : 'Re-score'}
                  </button>
                )}
                
                {/* Old version-based rescore - hidden but kept for reference */}
                {false && FLAGS.RESCORE_WITH_VERSION && (
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
            {call.scoring_method === 'openai' && call.openai_raw_response && (
              <button
                onClick={() => setActiveTab('ai-reasoning')}
                className={`py-3 px-6 text-sm font-medium ${
                  activeTab === 'ai-reasoning'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                AI Reasoning
              </button>
            )}
            {isSuperAdmin && call.openai_raw_response && (
              <button
                onClick={() => setActiveTab('debug')}
                className={`py-3 px-6 text-sm font-medium ${
                  activeTab === 'debug'
                    ? 'border-b-2 border-purple-500 text-purple-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                🔧 Debug
              </button>
            )}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'scorecard' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Bridge Selling Scorecard
              </h3>
              
              {renderScoreBreakdown().map((stepData, index) => {
                const { key, step, stepName } = stepData;
                
                return (
                  <div key={key || index} className="border border-gray-200 rounded-lg p-4">
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
                    {step.reasoning && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">AI Reasoning</h5>
                        <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">{step.reasoning}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'coaching' && (
            <div>
              {call.coaching ? (
                <AICoachingTab coaching={call.coaching} />
              ) : (
                <CoachingTab strengths={strengths} improvements={improvements} />
              )}
            </div>
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

          {activeTab === 'ai-reasoning' && call.openai_raw_response && (
            <AIReasoningTab rawResponse={call.openai_raw_response} />
          )}
          
          {activeTab === 'debug' && isSuperAdmin && call.openai_raw_response && (
            <DebugTab rawResponse={call.openai_raw_response} />
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

// AI Reasoning Tab Component
interface AIReasoningTabProps {
  rawResponse: string;
}

function AIReasoningTab({ rawResponse }: AIReasoningTabProps) {
  const stepLabels = {
    pinpoint_pain: 'Pinpoint Pain',
    qualify: 'Qualify',
    solution_success: 'Solution Success',
    qa: 'Q&A',
    next_steps: 'Next Steps',
    close_or_schedule: 'Close or Schedule',
  };

  let parsedResponse;
  try {
    parsedResponse = JSON.parse(rawResponse);
  } catch (err) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          AI Reasoning
        </h3>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Failed to parse OpenAI response data.</p>
          <details className="mt-2">
            <summary className="text-sm text-red-600 cursor-pointer">Show raw response</summary>
            <pre className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">{rawResponse}</pre>
          </details>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        AI Reasoning
      </h3>
      <div className="space-y-6">
        {parsedResponse.steps && parsedResponse.steps.map((step: any, index: number) => (
          <div key={step.stepKey || index} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-900">
                {stepLabels[step.stepKey as keyof typeof stepLabels] || step.stepKey}
              </h4>
              <div className="flex items-center space-x-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  step.score >= 3 ? 'bg-green-100 text-green-800' :
                  step.score >= 2 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  Score: {step.score}/4
                </span>
              </div>
            </div>
            
            {step.reasoning && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                <h5 className="text-sm font-medium text-blue-900 mb-2">AI Analysis:</h5>
                <p className="text-sm text-blue-800 whitespace-pre-wrap">{step.reasoning}</p>
              </div>
            )}

            {step.evidence && step.evidence.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <h5 className="text-sm font-medium text-gray-900 mb-2">Evidence Found:</h5>
                <ul className="space-y-1">
                  {step.evidence.map((evidence: string, evidenceIndex: number) => (
                    <li key={evidenceIndex} className="text-sm text-gray-700 flex items-start">
                      <span className="text-gray-400 mr-2">•</span>
                      <span className="italic">"{evidence}"</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}

        {parsedResponse.summary && (
          <div className="border-t border-gray-200 pt-4">
            <h4 className="font-medium text-gray-900 mb-3">Overall Summary</h4>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{parsedResponse.summary}</p>
            </div>
          </div>
        )}
      </div>
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
// AI Coaching Tab Component
interface AICoachingTabProps {
  coaching: {
    thingsTheyDidWell: string[];
    areasForImprovement: Array<{
      area: string;
      howToImprove: string;
      bridgeStep: string;
    }>;
  };
}

function AICoachingTab({ coaching }: AICoachingTabProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-6">AI Coaching Feedback</h3>
      
      {/* Things They Did Well */}
      <div className="mb-8">
        <h4 className="text-md font-semibold text-green-800 mb-4 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Things They Did Well
        </h4>
        <div className="space-y-3">
          {coaching.thingsTheyDidWell.map((item, index) => (
            <div key={index} className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start">
                <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-800 text-sm font-medium rounded-full flex items-center justify-center mr-3">
                  {index + 1}
                </span>
                <p className="text-green-800">{item}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Areas for Improvement */}
      <div>
        <h4 className="text-md font-semibold text-blue-800 mb-4 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          Areas for Improvement
        </h4>
        <div className="space-y-4">
          {coaching.areasForImprovement.map((item, index) => (
            <div key={index} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start mb-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-800 text-sm font-medium rounded-full flex items-center justify-center mr-3">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <h5 className="font-medium text-blue-900 mb-1">{item.area}</h5>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    {item.bridgeStep}
                  </span>
                </div>
              </div>
              <div className="ml-9">
                <p className="text-blue-800 text-sm"><strong>How to improve:</strong> {item.howToImprove}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Debug Tab Component (SuperAdmin only)
interface DebugTabProps {
  rawResponse: any;
}

function DebugTab({ rawResponse }: DebugTabProps) {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard\!`);
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-purple-900 mb-6 flex items-center">
        🔧 SuperAdmin Debug Information
        <span className="ml-2 text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded-full">
          Private
        </span>
      </h3>

      <div className="space-y-6">
        {/* Step Scores Debug */}
        {rawResponse.stepScores && Array.isArray(rawResponse.stepScores) && (
          <div>
            <h4 className="text-md font-semibold text-purple-800 mb-4">Step Scoring Threads</h4>
            <div className="space-y-3">
              {rawResponse.stepScores.map((step: any, index: number) => (
                <div key={index} className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-medium text-purple-900">{step.stepName}</h5>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      step.color === "green" ? "bg-green-100 text-green-800" :
                      step.color === "yellow" ? "bg-yellow-100 text-yellow-800" :
                      "bg-red-100 text-red-800"
                    }`}>
                      {step.credit} × {step.weight} = {step.credit * step.weight}
                    </span>
                  </div>
                  
                  {step.openaiThreadId && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="block text-xs font-medium text-purple-700 mb-1">
                          OpenAI Thread ID:
                        </label>
                        <div className="flex items-center space-x-2">
                          <code className="flex-1 bg-white px-2 py-1 rounded border text-xs font-mono">
                            {step.openaiThreadId}
                          </code>
                          <button
                            onClick={() => copyToClipboard(step.openaiThreadId, "Thread ID")}
                            className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                      
                      {step.openaiRunId && (
                        <div>
                          <label className="block text-xs font-medium text-purple-700 mb-1">
                            OpenAI Run ID:
                          </label>
                          <div className="flex items-center space-x-2">
                            <code className="flex-1 bg-white px-2 py-1 rounded border text-xs font-mono">
                              {step.openaiRunId}
                            </code>
                            <button
                              onClick={() => copyToClipboard(step.openaiRunId, "Run ID")}
                              className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coaching Debug */}
        {rawResponse.coaching && (rawResponse.coaching.coachingThreadId || rawResponse.coaching.coachingRunId) && (
          <div>
            <h4 className="text-md font-semibold text-purple-800 mb-4">Coaching Generation Thread</h4>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rawResponse.coaching.coachingThreadId && (
                  <div>
                    <label className="block text-xs font-medium text-purple-700 mb-1">
                      Coaching Thread ID:
                    </label>
                    <div className="flex items-center space-x-2">
                      <code className="flex-1 bg-white px-2 py-1 rounded border text-xs font-mono">
                        {rawResponse.coaching.coachingThreadId}
                      </code>
                      <button
                        onClick={() => copyToClipboard(rawResponse.coaching.coachingThreadId, "Coaching Thread ID")}
                        className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
                
                {rawResponse.coaching.coachingRunId && (
                  <div>
                    <label className="block text-xs font-medium text-purple-700 mb-1">
                      Coaching Run ID:
                    </label>
                    <div className="flex items-center space-x-2">
                      <code className="flex-1 bg-white px-2 py-1 rounded border text-xs font-mono">
                        {rawResponse.coaching.coachingRunId}
                      </code>
                      <button
                        onClick={() => copyToClipboard(rawResponse.coaching.coachingRunId, "Coaching Run ID")}
                        className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* General Debug Info */}
        <div>
          <h4 className="text-md font-semibold text-purple-800 mb-4">General Debug Information</h4>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-medium text-purple-700 mb-1">Assistant ID:</label>
                <code className="bg-white px-2 py-1 rounded border block">
                  {rawResponse.assistantId || "Not available"}
                </code>
              </div>
              <div>
                <label className="block font-medium text-purple-700 mb-1">Scored At:</label>
                <code className="bg-white px-2 py-1 rounded border block">
                  {rawResponse.scoredAt ? new Date(rawResponse.scoredAt).toLocaleString() : "Not available"}
                </code>
              </div>
              <div>
                <label className="block font-medium text-purple-700 mb-1">Total Score:</label>
                <code className="bg-white px-2 py-1 rounded border block">
                  {rawResponse.total || "Not available"}
                </code>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-400 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-blue-800">
                How to use Thread IDs
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>Copy any Thread ID above and paste it in the OpenAI Dashboard → Playground → Threads to see the exact conversation and prompts sent to the AI assistant.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
