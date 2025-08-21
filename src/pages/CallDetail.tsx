import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { usePivots } from '../hooks/usePivots';
import { useOrg } from '../contexts/OrgContext';
import { useAuth } from '../contexts/AuthContext';
import { FLAGS } from '../lib/flags';
import { getAssistantVersions, type AssistantVersion } from '../lib/assistants';
import { rescoreCall } from '../lib/newCallScoring';
import OrganizationBanner from '../components/OrganizationBanner';
import CallNotesModal from '../components/CallNotesModal';

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
  manually_adjusted?: boolean;
  manually_adjusted_by?: string;
  manually_adjusted_at?: string;
  flagged_for_review?: boolean;
  flagged_by?: string;
  flagged_at?: string;
  flag_reason?: string;
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
  const [showRescoreMenu, setShowRescoreMenu] = useState(false);
  const [assistantVersions, setAssistantVersions] = useState<AssistantVersion[]>([]);
  const [rescoring, setRescoring] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [editingScores, setEditingScores] = useState(false);
  const [adjustedScores, setAdjustedScores] = useState<any[]>([]);
  const [savingAdjustments, setSavingAdjustments] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [adjustedByUserName, setAdjustedByUserName] = useState<string | null>(null);
  const [flaggedByUserName, setFlaggedByUserName] = useState<string | null>(null);
  const [showNotesModal, setShowNotesModal] = useState(false);

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
    if (showRescoreMenu && currentOrg && (memberRole === 'manager' || memberRole === 'superadmin')) {
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

  const checkUserRole = () => {
    if (!user || !currentOrg) return;

    // Get SuperAdmin status and role from currentOrg (set by OrgContext)
    const isSuperAdmin = currentOrg.is_superadmin || false;
    const userRole = currentOrg.role || null;
    
    console.log('CallDetail: Using global SuperAdmin status:', isSuperAdmin, 'Role:', userRole, 'from currentOrg:', currentOrg.id);
    
    // For call management, treat SuperAdmins as having manager access
    if (isSuperAdmin) {
      setMemberRole('superadmin');
    } else {
      setMemberRole(userRole);
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
      // Try without the join first (backwards compatibility)
      let { data, error: fetchError } = await (supabase as any)
        .from('calls')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      setCall(data);
      
      // Fetch user name if this call was manually adjusted
      if (data?.manually_adjusted_by) {
        fetchAdjustedByUserName(data.manually_adjusted_by);
      }
      
      // Fetch user name if this call was flagged
      if (data?.flagged_by) {
        fetchFlaggedByUserName(data.flagged_by);
      }
    } catch (err) {
      console.error('Error fetching call:', err);
      setError('Failed to load call details.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAdjustedByUserName = async (userId: string) => {
    try {
      // Try to get user name from auth.users first
      let { data: userData, error: userError } = await (supabase as any)
        .from('auth.users')
        .select('raw_user_meta_data')
        .eq('id', userId)
        .single();

      if (userError || !userData?.raw_user_meta_data?.full_name) {
        // Fallback to profiles table
        const { data: profileData, error: profileError } = await (supabase as any)
          .from('profiles')
          .select('full_name, email')
          .eq('id', userId)
          .single();

        if (!profileError && profileData) {
          setAdjustedByUserName(profileData.full_name || profileData.email || 'Unknown User');
          return;
        }

        // Last fallback - try to get email from memberships/users view
        const { data: membershipData, error: membershipError } = await (supabase as any)
          .from('membership_with_profiles')
          .select('email, full_name')
          .eq('user_id', userId)
          .limit(1)
          .single();

        if (!membershipError && membershipData) {
          setAdjustedByUserName(membershipData.full_name || membershipData.email || 'Unknown User');
          return;
        }

        setAdjustedByUserName('Unknown User');
      } else {
        setAdjustedByUserName(userData.raw_user_meta_data.full_name);
      }
    } catch (err) {
      console.error('Error fetching user name:', err);
      setAdjustedByUserName('Unknown User');
    }
  };

  const fetchFlaggedByUserName = async (userId: string) => {
    try {
      // Try to get user name from auth.users first
      let { data: userData, error: userError } = await (supabase as any)
        .from('auth.users')
        .select('raw_user_meta_data')
        .eq('id', userId)
        .single();

      if (userError || !userData?.raw_user_meta_data?.full_name) {
        // Fallback to profiles table
        const { data: profileData, error: profileError } = await (supabase as any)
          .from('profiles')
          .select('full_name, email')
          .eq('id', userId)
          .single();

        if (!profileError && profileData) {
          setFlaggedByUserName(profileData.full_name || profileData.email || 'Unknown User');
          return;
        }

        // Last fallback - try to get email from memberships/users view
        const { data: membershipData, error: membershipError } = await (supabase as any)
          .from('membership_with_profiles')
          .select('email, full_name')
          .eq('user_id', userId)
          .limit(1)
          .single();

        if (!membershipError && membershipData) {
          setFlaggedByUserName(membershipData.full_name || membershipData.email || 'Unknown User');
          return;
        }

        setFlaggedByUserName('Unknown User');
      } else {
        setFlaggedByUserName(userData.raw_user_meta_data.full_name);
      }
    } catch (err) {
      console.error('Error fetching flagged by user name:', err);
      setFlaggedByUserName('Unknown User');
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

  const handleDeleteCall = async () => {
    if (!call || !isSuperAdmin) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to delete this call?\n\nTitle: ${call.title}\nScore: ${renderScoreBreakdown().reduce((sum, { step }) => sum + (step.credit * step.weight), 0)}/20\n\nThis action cannot be undone.`
    );
    
    if (!confirmed) return;
    
    try {
      const { error } = await supabase
        .from('calls')
        .delete()
        .eq('id', call.id);
      
      if (error) throw error;
      
      alert('Call deleted successfully');
      // Navigate back to dashboard after deletion
      window.location.href = '/dashboard';
    } catch (err) {
      console.error('Error deleting call:', err);
      alert('Failed to delete call. Please try again.');
    }
  };

  // Render score breakdown for both old and new formats
  const renderScoreBreakdown = () => {
    if (!call) return [];
    
    let scoreBreakdown: any[] = [];
    
    // New OpenAI format (array of stepScores)
    if (Array.isArray(call.score_breakdown)) {
      scoreBreakdown = call.score_breakdown.map((stepScore: any) => ({
        key: stepScore.step,
        step: stepScore,
        stepName: stepScore.stepName
      }));
    } else {
      // Old format (object with keys)
      scoreBreakdown = Object.entries(call.score_breakdown)
        .filter(([key]) => key !== 'total')
        .map(([key, step]: [string, any]) => ({
          key,
          step,
          stepName: stepLabels[key as keyof typeof stepLabels]
        }));
    }
    
    // Sort according to organization's bridge steps order if available
    if (currentOrg && currentOrg.bridge_steps) {
      const orgSteps = [...(currentOrg.bridge_steps || [])].sort((a, b) => a.order - b.order);
      const stepOrderMap = new Map();
      orgSteps.forEach((step, index) => {
        stepOrderMap.set(step.key, index);
      });
      
      scoreBreakdown.sort((a, b) => {
        const orderA = stepOrderMap.get(a.key) ?? 999;
        const orderB = stepOrderMap.get(b.key) ?? 999;
        return orderA - orderB;
      });
    }
    
    return scoreBreakdown;
  };

  const { strengths, improvements } = getCoachingAnalysis();


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
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to rescore call: ${errorMessage}`);
    } finally {
      setRescoring(false);
    }
  };

  const handleRescore = async (assistantVersionId: string) => {
    if (!call || !currentOrg || !user || (memberRole !== 'manager' && memberRole !== 'superadmin')) return;

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

  const startEditingScores = () => {
    const currentScores = renderScoreBreakdown();
    setAdjustedScores(currentScores.map(item => ({
      ...item.step,
      originalCredit: item.step.credit,
      originalNotes: item.step.notes
    })));
    setEditingScores(true);
  };

  const cancelEditingScores = () => {
    setEditingScores(false);
    setAdjustedScores([]);
  };

  const updateStepScore = (stepIndex: number, field: string, value: any) => {
    setAdjustedScores(prev => prev.map((step, index) => 
      index === stepIndex ? { ...step, [field]: value } : step
    ));
  };

  const saveScoreAdjustments = async () => {
    if (!call || !user) return;
    
    setSavingAdjustments(true);
    try {
      // Calculate new total (preserve decimals)
      const newTotal = adjustedScores.reduce((sum, step) => sum + (step.weight * step.credit), 0);

      // Update the call with adjusted scores
      const { error } = await supabase
        .from('calls')
        .update({
          score_total: newTotal,
          score_breakdown: adjustedScores,
          manually_adjusted: true,
          manually_adjusted_by: user.id,
          manually_adjusted_at: new Date().toISOString()
        })
        .eq('id', call.id);

      if (error) throw error;

      // Refresh the call data
      await fetchCall();
      setEditingScores(false);
      setAdjustedScores([]);
      alert('Score adjustments saved successfully!');
    } catch (err) {
      console.error('Error saving score adjustments:', err);
      alert('Failed to save score adjustments. Please try again.');
    } finally {
      setSavingAdjustments(false);
    }
  };

  const flagForReview = async () => {
    if (!call || !user || !flagReason.trim()) return;
    
    try {
      // Update the call flags
      const { error } = await supabase
        .from('calls')
        .update({
          flagged_for_review: true,
          flagged_by: user.id,
          flagged_at: new Date().toISOString(),
          flag_reason: flagReason.trim()
        })
        .eq('id', call.id);

      if (error) throw error;

      // Also create a note in the call_notes table for visibility in the notes system
      const { error: noteError } = await (supabase as any)
        .from('call_notes')
        .insert({
          call_id: call.id,
          created_by: user.id,
          note_type: 'flag',
          title: 'Call Flagged for Review',
          content: flagReason.trim(),
          is_private: false,
          visible_to_user: true
        });

      if (noteError) {
        console.error('Error creating flag note:', noteError);
        // Don't fail the flag operation if note creation fails
      }

      await fetchCall();
      setShowFlagModal(false);
      setFlagReason('');
      alert('Call flagged for review successfully!');
    } catch (err) {
      console.error('Error flagging call:', err);
      alert('Failed to flag call for review. Please try again.');
    }
  };

  const unflagCall = async () => {
    if (!call) return;
    
    try {
      const { error } = await supabase
        .from('calls')
        .update({
          flagged_for_review: false,
          flagged_by: null,
          flagged_at: null,
          flag_reason: null
        })
        .eq('id', call.id);

      if (error) throw error;

      await fetchCall();
      alert('Call unflagged successfully!');
    } catch (err) {
      console.error('Error unflagging call:', err);
      alert('Failed to unflag call. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-6 lg:py-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  if (error || !call) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-6 lg:py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error || 'Call not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-6 lg:py-6">
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

      {/* Organization Banner */}
      <OrganizationBanner className="mb-6" />

      {/* Score Summary */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-semibold text-gray-900">Overall Score</h2>
            {call.manually_adjusted && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                Manually Adjusted
              </span>
            )}
            {call.flagged_for_review && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                🚩 Flagged for Review
              </span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            {/* Bridge Step Indicator Boxes */}
            <BridgeStepIndicators call={call} currentOrg={currentOrg} scoreBreakdown={renderScoreBreakdown()} />
            <div className="text-3xl font-bold text-blue-600">
              {renderScoreBreakdown().reduce((sum, { step }) => sum + (step.credit * step.weight), 0)}/20
            </div>
            {/* Admin Actions */}
            {(memberRole === 'manager' || memberRole === 'superadmin') && (
              <div className="flex space-x-2">
                {(FLAGS.RESCORE_WITH_VERSION || true) && (
                  <button
                    onClick={handleDirectRescore}
                    className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700"
                    disabled={rescoring}
                  >
                    {rescoring ? 'Rescoring...' : 'Re-score'}
                  </button>
                )}
                
                {/* Manual Score Edit Button */}
                {!editingScores ? (
                  <button
                    onClick={startEditingScores}
                    className="bg-orange-600 text-white px-3 py-1 rounded text-sm hover:bg-orange-700"
                    disabled={rescoring}
                  >
                    Edit Scores
                  </button>
                ) : (
                  <div className="flex space-x-2">
                    <button
                      onClick={saveScoreAdjustments}
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                      disabled={savingAdjustments}
                    >
                      {savingAdjustments ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={cancelEditingScores}
                      className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700"
                      disabled={savingAdjustments}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                
                {/* Flag for Review Button */}
                {!call.flagged_for_review ? (
                  <button
                    onClick={() => setShowFlagModal(true)}
                    className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                    disabled={editingScores}
                  >
                    Flag for Review
                  </button>
                ) : (
                  <button
                    onClick={unflagCall}
                    className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700"
                    disabled={editingScores}
                  >
                    Unflag
                  </button>
                )}
                
                {/* Notes Button */}
                <button
                  onClick={() => setShowNotesModal(true)}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 flex items-center"
                  disabled={editingScores}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Notes
                </button>
                
                {/* Delete Call Button - SuperAdmin Only */}
                {isSuperAdmin && (
                  <button
                    onClick={handleDeleteCall}
                    className="bg-red-700 text-white px-3 py-1 rounded text-sm hover:bg-red-800"
                    disabled={editingScores || rescoring}
                  >
                    Delete Call
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
                Reasoning
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
              
              {!editingScores ? (
                // Read-only view
                renderScoreBreakdown().map((stepData, index) => {
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
                          <span className="text-lg font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded">
                            {step.credit * step.weight}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">{step.notes}</p>
                      {step.reasoning && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Reasoning</h5>
                          <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">{step.reasoning}</p>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                // Editing view
                adjustedScores.map((step, index) => {
                  const stepName = step.stepName || `Step ${index + 1}`;
                  
                  return (
                    <div key={index} className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-medium text-gray-900">{stepName}</h4>
                        <div className="flex items-center space-x-4">
                          <div className="flex flex-col items-end">
                            <label className="text-xs text-gray-500 mb-1">Score</label>
                            <select
                              value={step.credit}
                              onChange={(e) => {
                                const credit = parseFloat(e.target.value);
                                const color = credit === 1 ? 'green' : credit === 0.5 ? 'yellow' : 'red';
                                updateStepScore(index, 'credit', credit);
                                updateStepScore(index, 'color', color);
                              }}
                              className="border border-gray-300 rounded px-2 py-1 text-sm"
                            >
                              <option value={0}>0 (None)</option>
                              <option value={0.5}>0.5 (Partial)</option>
                              <option value={1}>1 (Full)</option>
                            </select>
                          </div>
                          <span className="text-lg font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded">
                            {step.credit * step.weight}
                          </span>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Notes</label>
                          <textarea
                            value={step.notes || ''}
                            onChange={(e) => updateStepScore(index, 'notes', e.target.value)}
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                            rows={2}
                            placeholder="Add notes about this step..."
                          />
                        </div>
                        
                        {step.originalCredit !== step.credit && (
                          <div className="text-xs text-orange-600 bg-orange-100 p-2 rounded">
                            Original: {step.originalCredit} → Adjusted: {step.credit}
                          </div>
                        )}
                        
                        {step.reasoning && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Original Reasoning</h5>
                            <p className="text-sm text-gray-700 bg-gray-100 p-3 rounded">{step.reasoning}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              
              {/* Manual Adjustment Audit Trail */}
              {call.manually_adjusted && call.manually_adjusted_at && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Adjustment History</h4>
                  <p className="text-sm text-gray-600">
                    Scores were manually adjusted on {formatDate(call.manually_adjusted_at)}
                    {call.manually_adjusted_by && ` by ${adjustedByUserName || 'Unknown User'}`}
                  </p>
                </div>
              )}
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
          
          {activeTab === 'debug' && isSuperAdmin && (
            <DebugTab rawResponse={call.openai_raw_response} call={call} currentOrg={currentOrg} />
          )}
        </div>
      </div>
      
      {/* Flag for Review Modal */}
      {showFlagModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Flag Call for Review
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Why should this call be reviewed by an admin?
              </p>
              <textarea
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                rows={4}
                placeholder="Enter reason for flagging (e.g., 'AI score seems inaccurate', 'Complex situation needs human review', etc.)"
              />
              <div className="flex justify-end space-x-3 mt-4">
                <button
                  onClick={() => {
                    setShowFlagModal(false);
                    setFlagReason('');
                  }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={flagForReview}
                  disabled={!flagReason.trim()}
                  className="px-4 py-2 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Flag for Review
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Flag Reason Display */}
      {call.flagged_for_review && call.flag_reason && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-6">
          <h4 className="text-sm font-medium text-red-900 mb-2">Flagged for Review</h4>
          <p className="text-sm text-red-800 mb-2">
            <strong>Reason:</strong> {call.flag_reason}
          </p>
          {call.flagged_at && (
            <p className="text-sm text-red-600">
              Flagged on {formatDate(call.flagged_at)}
              {call.flagged_by && ` by ${flaggedByUserName || 'Unknown User'}`}
            </p>
          )}
        </div>
      )}

      {/* Notes Modal */}
      {showNotesModal && call && (
        <CallNotesModal
          callId={call.id}
          callTitle={call.title}
          onClose={() => setShowNotesModal(false)}
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
          Reasoning
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
        Reasoning
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
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Feedback</h3>
      
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

// Bridge Step Indicators Component
interface BridgeStepIndicatorsProps {
  call: CallData;
  currentOrg: any;
  scoreBreakdown: any[];
}

function BridgeStepIndicators({ call, currentOrg, scoreBreakdown }: BridgeStepIndicatorsProps) {
  if (!call || !currentOrg || !currentOrg.bridge_steps) {
    return null;
  }

  // Get organization's bridge steps in the configured order
  const orgSteps = [...(currentOrg.bridge_steps || [])].sort((a, b) => a.order - b.order);
  
  // Create a map of step scores for easy lookup
  const stepScoreMap = new Map();
  scoreBreakdown.forEach(({ key, step }) => {
    stepScoreMap.set(key, step);
  });

  const getStepColor = (credit: number) => {
    if (credit >= 1) return 'bg-green-500';
    if (credit >= 0.5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStepTextColor = (credit: number) => {
    if (credit >= 1) return 'text-white';
    if (credit >= 0.5) return 'text-white';
    return 'text-white';
  };

  return (
    <div className="flex items-center space-x-1">
      {orgSteps.slice(0, 6).map((orgStep, index) => {
        const stepScore = stepScoreMap.get(orgStep.key);
        const credit = stepScore?.credit ?? 0;
        const points = stepScore ? (stepScore.credit * stepScore.weight) : 0;
        
        return (
          <div
            key={orgStep.key || index}
            className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold ${getStepColor(credit)} ${getStepTextColor(credit)}`}
            title={`${orgStep.name}: ${points} points (${credit === 1 ? 'Full' : credit === 0.5 ? 'Partial' : 'None'})`}
          >
            {points}
          </div>
        );
      })}
    </div>
  );
}

// Debug Tab Component (SuperAdmin only)
interface DebugTabProps {
  rawResponse: any;
  call: CallData;
  currentOrg: any;
}

function DebugTab({ rawResponse, call, currentOrg }: DebugTabProps) {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard\!`);
  };

  // Debug what we actually have
  console.log('Debug Tab - rawResponse:', rawResponse);
  console.log('Debug Tab - call.openai_raw_response:', call.openai_raw_response);
  console.log('Debug Tab - call.score_breakdown:', call.score_breakdown);
  console.log('Debug Tab - call.coaching:', call.coaching);

  // Try different sources for the data
  const debugData = rawResponse || call.openai_raw_response || {};
  const stepScores = debugData.stepScores || call.score_breakdown || [];
  const coaching = debugData.coaching || call.coaching || {};

  return (
    <div>
      <h3 className="text-lg font-semibold text-purple-900 mb-6 flex items-center">
        🔧 SuperAdmin Debug Information
        <span className="ml-2 text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded-full">
          Private
        </span>
      </h3>

      <div className="space-y-6">
        {/* Debug Data Source */}
        <div>
          <h4 className="text-md font-semibold text-purple-800 mb-4">Data Source Debug</h4>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <strong>rawResponse:</strong> {rawResponse ? 'Present' : 'Missing'}
              </div>
              <div>
                <strong>call.openai_raw_response:</strong> {call.openai_raw_response ? 'Present' : 'Missing'}
              </div>
              <div>
                <strong>Using:</strong> {debugData === rawResponse ? 'rawResponse' : debugData === call.openai_raw_response ? 'call.openai_raw_response' : 'fallback'}
              </div>
            </div>
          </div>
        </div>
        {/* Step Scores Debug */}
        {stepScores && Array.isArray(stepScores) && stepScores.length > 0 && (
          <div>
            <h4 className="text-md font-semibold text-purple-800 mb-4">Step Scoring Threads</h4>
            <div className="space-y-3">
              {stepScores.map((step: any, index: number) => (
                <div key={index} className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-medium text-purple-900">{step.stepName}</h5>
                    <span className={`px-3 py-1 rounded text-lg font-bold ${
                      step.color === "green" ? "bg-green-100 text-green-800" :
                      step.color === "yellow" ? "bg-yellow-100 text-yellow-800" :
                      "bg-red-100 text-red-800"
                    }`}>
                      {step.credit * step.weight}
                    </span>
                  </div>
                  
                  {(step.openaiThreadId || step.threadId) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="block text-xs font-medium text-purple-700 mb-1">
                          OpenAI Thread ID:
                        </label>
                        <div className="flex items-center space-x-2">
                          <code className="flex-1 bg-white px-2 py-1 rounded border text-xs font-mono">
                            {step.openaiThreadId || step.threadId}
                          </code>
                          <button
                            onClick={() => copyToClipboard(step.openaiThreadId || step.threadId, "Thread ID")}
                            className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                      
                      {(step.openaiRunId || step.runId) && (
                        <div>
                          <label className="block text-xs font-medium text-purple-700 mb-1">
                            OpenAI Run ID:
                          </label>
                          <div className="flex items-center space-x-2">
                            <code className="flex-1 bg-white px-2 py-1 rounded border text-xs font-mono">
                              {step.openaiRunId || step.runId}
                            </code>
                            <button
                              onClick={() => copyToClipboard(step.openaiRunId || step.runId, "Run ID")}
                              className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
                            >
                              Copy
                            </button>
                            <a
                              href={`https://platform.openai.com/playground/assistants?assistant=${debugData.assistantId || currentOrg?.openai_assistant_id}&thread=${step.openaiThreadId || step.threadId}&run=${step.openaiRunId || step.runId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                            >
                              Open Run
                            </a>
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
        {coaching && (coaching.coachingThreadId || coaching.coachingRunId) && (
          <div>
            <h4 className="text-md font-semibold text-purple-800 mb-4">Coaching Generation Thread</h4>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {coaching.coachingThreadId && (
                  <div>
                    <label className="block text-xs font-medium text-purple-700 mb-1">
                      Coaching Thread ID:
                    </label>
                    <div className="flex items-center space-x-2">
                      <code className="flex-1 bg-white px-2 py-1 rounded border text-xs font-mono">
                        {coaching.coachingThreadId}
                      </code>
                      <button
                        onClick={() => copyToClipboard(coaching.coachingThreadId, "Coaching Thread ID")}
                        className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
                
                {coaching.coachingRunId && (
                  <div>
                    <label className="block text-xs font-medium text-purple-700 mb-1">
                      Coaching Run ID:
                    </label>
                    <div className="flex items-center space-x-2">
                      <code className="flex-1 bg-white px-2 py-1 rounded border text-xs font-mono">
                        {coaching.coachingRunId}
                      </code>
                      <button
                        onClick={() => copyToClipboard(coaching.coachingRunId, "Coaching Run ID")}
                        className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
                      >
                        Copy
                      </button>
                      <a
                        href={`https://platform.openai.com/playground/assistants?assistant=${debugData.assistantId || currentOrg?.openai_assistant_id}&thread=${coaching.coachingThreadId}&run=${coaching.coachingRunId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                      >
                        Open Run
                      </a>
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
                  {debugData.assistantId || "Not available"}
                </code>
              </div>
              <div>
                <label className="block font-medium text-purple-700 mb-1">Scored At:</label>
                <code className="bg-white px-2 py-1 rounded border block">
                  {debugData.scoredAt ? new Date(debugData.scoredAt).toLocaleString() : call.created_at ? new Date(call.created_at).toLocaleString() : "Not available"}
                </code>
              </div>
              <div>
                <label className="block font-medium text-purple-700 mb-1">Total Score:</label>
                <code className="bg-white px-2 py-1 rounded border block">
                  {debugData.total || call.score_total || "Not available"}
                </code>
              </div>
            </div>
          </div>
        </div>

        {/* Raw Data Dump for Debugging */}
        <div>
          <h4 className="text-md font-semibold text-purple-800 mb-4">Raw Data Structure</h4>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <details className="text-xs">
              <summary className="cursor-pointer font-medium text-gray-700 mb-2">
                Expand to see raw OpenAI response structure
              </summary>
              <pre className="bg-white p-3 rounded border overflow-auto text-xs font-mono max-h-96">
                {JSON.stringify(debugData, null, 2)}
              </pre>
            </details>
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
                <p>Use the <strong>Open Run</strong> buttons above to directly access specific runs in the OpenAI Dashboard, or <strong>Copy</strong> IDs to paste elsewhere. This lets you see the exact conversation and prompts sent to the AI assistant for debugging and prompt tuning.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
