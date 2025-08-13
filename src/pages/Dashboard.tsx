import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { supabase } from '../lib/supabase';
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
  flagged_for_review?: boolean;
  flag_reason?: string;
  manually_adjusted?: boolean;
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
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploadMode, setUploadMode] = useState<'text' | 'audio'>('text');
  const [transcribing, setTranscribing] = useState(false);
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
  
  // Modal state
  const [showScoreModal, setShowScoreModal] = useState(false);
  
  // Stats state
  const [userStats, setUserStats] = useState({
    averageScore: 0,
    totalCalls: 0,
    closeRate: 0,
    improvement: 0,
    flaggedCalls: 0,
    last30DaysAvg: 0
  });
  
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
    fetchUserStats();
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
        .select(`
          id, 
          title, 
          score_total, 
          created_at, 
          flagged_for_review, 
          flag_reason, 
          manually_adjusted,
          user_id,
          framework_version,
          assistant_version_id
        `)
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

  const fetchUserStats = async () => {
    if (!user) return;
    
    try {
      // Get date 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Fetch all user's calls for stats
      let statsQuery = (supabase as any)
        .from('calls')
        .select('score_total, created_at, flagged_for_review');
      
      // Filter by org or user
      if (FLAGS.ORGS && currentOrg) {
        statsQuery = statsQuery.eq('org_id', currentOrg.id).eq('user_id', user.id);
      } else {
        statsQuery = statsQuery.eq('user_id', user.id);
      }
      
      const { data: allCalls, error } = await statsQuery;
      
      if (error) {
        console.error('Error fetching user stats:', error);
        return;
      }
      
      if (!allCalls || allCalls.length === 0) {
        setUserStats({
          averageScore: 0,
          totalCalls: 0,
          closeRate: 0,
          improvement: 0,
          flaggedCalls: 0,
          last30DaysAvg: 0
        });
        return;
      }
      
      // Calculate stats
      const totalCalls = allCalls.length;
      const totalScore = allCalls.reduce((sum: number, call: any) => sum + call.score_total, 0);
      const averageScore = totalScore / totalCalls;
      
      // Calls with score >= 16 (80%)
      const highScoringCalls = allCalls.filter((call: any) => call.score_total >= 16).length;
      const closeRate = (highScoringCalls / totalCalls) * 100;
      
      // Flagged calls
      const flaggedCalls = allCalls.filter((call: any) => call.flagged_for_review).length;
      
      // Last 30 days average
      const recentCalls = allCalls.filter((call: any) => 
        new Date(call.created_at) >= thirtyDaysAgo
      );
      const recentAvg = recentCalls.length > 0 
        ? recentCalls.reduce((sum: number, call: any) => sum + call.score_total, 0) / recentCalls.length
        : 0;
      
      // Calculate improvement (compare first half to second half of calls)
      let improvement = 0;
      if (totalCalls >= 10) {
        const midpoint = Math.floor(totalCalls / 2);
        const sortedCalls = [...allCalls].sort((a: any, b: any) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const firstHalf = sortedCalls.slice(0, midpoint);
        const secondHalf = sortedCalls.slice(midpoint);
        
        const firstHalfAvg = firstHalf.reduce((sum: number, call: any) => sum + call.score_total, 0) / firstHalf.length;
        const secondHalfAvg = secondHalf.reduce((sum: number, call: any) => sum + call.score_total, 0) / secondHalf.length;
        
        improvement = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
      }
      
      setUserStats({
        averageScore: Math.round(averageScore * 10) / 10,
        totalCalls,
        closeRate: Math.round(closeRate),
        improvement: Math.round(improvement * 10) / 10,
        flaggedCalls,
        last30DaysAvg: Math.round(recentAvg * 10) / 10
      });
      
    } catch (err) {
      console.error('Error calculating user stats:', err);
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
          .select('user_id')
          .eq('org_id', currentOrg.id);

        if (memberData) {
          setOrgMembers(memberData.map((m: any) => ({
            id: m.user_id,
            email: 'user@example.com' // Simplified for now
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
          .select('*')
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

  const transcribeAudioWithOpenAI = async (audioFile: File) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      console.log('Starting audio transcription...', audioFile.name);

      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('action', 'transcribe_audio');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-operations`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formData
        }
      );

      console.log('Transcription response status:', response.status);
      console.log('Transcription response headers:', Object.fromEntries(response.headers.entries()));

      // Get raw response text first for debugging
      const rawResponse = await response.text();
      console.log('Raw transcription response:', rawResponse);

      if (!response.ok) {
        console.error('Transcription failed with status:', response.status);
        throw new Error(`Server error (${response.status}): ${rawResponse}`);
      }

      // Try to parse as JSON
      let result;
      try {
        result = JSON.parse(rawResponse);
      } catch (jsonError) {
        console.error('JSON parsing failed:', jsonError);
        console.error('Raw response was:', rawResponse);
        throw new Error('Invalid response format from transcription service. Please try again.');
      }
      
      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.transcription) {
        throw new Error('No transcription received from service');
      }

      console.log('Transcription successful, length:', result.transcription.length);
      return result.transcription;

    } catch (err) {
      console.error('Error transcribing audio:', err);
      
      // Re-throw with better error context
      if (err instanceof Error) {
        throw err; // Preserve the specific error message
      } else {
        throw new Error('Unknown error during audio transcription');
      }
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

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file type
      const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/webm'];
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|mp4|m4a|webm)$/i)) {
        setError('Please select a valid audio file (MP3, WAV, MP4, M4A, or WebM)');
        return;
      }
      
      // Check file size (max 25MB for Whisper API)
      if (file.size > 25 * 1024 * 1024) {
        setError('Audio file must be less than 25MB');
        return;
      }
      
      setAudioFile(file);
      setError(null);
    }
  };

  const handleTranscribeAudio = async () => {
    if (!audioFile) return;
    
    setTranscribing(true);
    setError(null);
    
    try {
      const transcription = await transcribeAudioWithOpenAI(audioFile);
      setTranscript(transcription);
      
      // Switch to text mode to show the transcription
      setUploadMode('text');
    } catch (err) {
      console.error('Error transcribing audio:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to transcribe audio';
      
      // Provide helpful error messages
      if (errorMessage.includes('API key')) {
        setError('Audio transcription is not configured. Please contact support.');
      } else if (errorMessage.includes('too large')) {
        setError('Audio file is too large. Please use a file smaller than 25MB.');
      } else if (errorMessage.includes('format') || errorMessage.includes('415')) {
        setError('Audio format not supported. Please use MP3, WAV, MP4, M4A, or WebM files.');
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setTranscribing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If in audio mode and no transcript, transcribe first
    if (uploadMode === 'audio' && !transcript.trim() && audioFile) {
      await handleTranscribeAudio();
      return;
    }
    
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

      // Upload audio file to storage if we have one
      let audioFileUrl = null;
      if (audioFile) {
        try {
          const fileExt = audioFile.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
          const filePath = `calls/${fileName}`;
          
          const { error: uploadError } = await supabase.storage
            .from('call-audio')
            .upload(filePath, audioFile, {
              cacheControl: '3600',
              upsert: false
            });
            
          if (uploadError) {
            console.warn('Audio upload failed:', uploadError.message);
          } else {
            const { data: urlData } = supabase.storage
              .from('call-audio')
              .getPublicUrl(filePath);
            audioFileUrl = urlData.publicUrl;
          }
        } catch (audioError) {
          console.warn('Audio upload failed:', audioError);
          // Continue without audio file - don't fail the call creation
        }
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
        audio_file_url: audioFileUrl,
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

      // Close modal and reset form
      setShowScoreModal(false);
      setTitle('');
      setTranscript('');
      setUploadMode('text');
      setAudioFile(null);
      
      // Navigate to call detail page
      navigate(`/calls/${data.id}`);
      
      // Refresh the recent calls list and stats
      fetchRecentCalls();
      fetchUserStats();
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header with Welcome and Score Button */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}!
          </h1>
          <p className="text-gray-600 mt-1">Here's your sales performance overview</p>
        </div>
        <button
          onClick={() => setShowScoreModal(true)}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
        >
          Score New Call
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* Average Score (Last 30 Days) */}
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">Average Score (Last 30 Days)</p>
              <div className="flex items-baseline">
                <p className="text-2xl font-semibold text-gray-900">
                  {userStats.last30DaysAvg || 0}
                </p>
                <p className="ml-2 text-sm text-gray-500">/20</p>
              </div>
            </div>
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Total Calls */}
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">Calls Analyzed</p>
              <div className="flex items-baseline">
                <p className="text-2xl font-semibold text-gray-900">
                  {userStats.totalCalls}
                </p>
              </div>
            </div>
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Close Rate (16+ Scores) */}
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">Close Rate (16+ Scores)</p>
              <div className="flex items-baseline">
                <p className="text-2xl font-semibold text-gray-900">
                  {userStats.closeRate}%
                </p>
              </div>
            </div>
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
        </div>

        {/* Performance Improvement */}
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">Performance Improvement</p>
              <div className="flex items-baseline">
                <p className={`text-2xl font-semibold ${userStats.improvement >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {userStats.improvement > 0 ? '+' : ''}{userStats.improvement}%
                </p>
              </div>
            </div>
            <div className="flex-shrink-0">
              <svg className={`h-8 w-8 ${userStats.improvement >= 0 ? 'text-purple-400' : 'text-red-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={userStats.improvement >= 0 ? "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" : "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"} />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Stats Row */}
      {userStats.flaggedCalls > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">
                <span className="font-medium">{userStats.flaggedCalls}</span> call{userStats.flaggedCalls !== 1 ? 's' : ''} flagged for review
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Score New Call Modal */}
      {showScoreModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-0 border w-full max-w-md shadow-lg rounded-md bg-white">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Score a New Call</h2>
                <button
                  onClick={() => setShowScoreModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
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

          {/* Upload Mode Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              How would you like to provide the call content? *
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="uploadMode"
                  value="text"
                  checked={uploadMode === 'text'}
                  onChange={(e) => setUploadMode(e.target.value as 'text' | 'audio')}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Paste Transcript</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="uploadMode"
                  value="audio"
                  checked={uploadMode === 'audio'}
                  onChange={(e) => setUploadMode(e.target.value as 'text' | 'audio')}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Upload Audio File</span>
              </label>
            </div>
          </div>

          {/* Text Input Mode */}
          {uploadMode === 'text' && (
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
          )}

          {/* Audio Upload Mode */}
          {uploadMode === 'audio' && (
            <div>
              <label htmlFor="audioFile" className="block text-sm font-medium text-gray-700 mb-2">
                Upload Audio File *
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  id="audioFile"
                  accept=".mp3,.wav,.mp4,.m4a,.webm,audio/*"
                  onChange={handleAudioFileChange}
                  className="hidden"
                  required={uploadMode === 'audio' && !audioFile}
                />
                <label htmlFor="audioFile" className="cursor-pointer">
                  {audioFile ? (
                    <div className="flex items-center justify-center space-x-2">
                      <span className="text-2xl">🎵</span>
                      <div>
                        <p className="text-sm font-medium text-green-600">{audioFile.name}</p>
                        <p className="text-xs text-gray-500">
                          {audioFile.size > 1024 * 1024 
                            ? `${(audioFile.size / (1024 * 1024)).toFixed(1)} MB`
                            : `${(audioFile.size / 1024).toFixed(0)} KB`
                          }
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="text-2xl text-gray-400">🎤</span>
                      <p className="text-sm text-gray-600 mt-1">Click to select audio file</p>
                      <p className="text-xs text-gray-400">MP3, WAV, MP4, M4A, WebM (Max 25MB)</p>
                    </div>
                  )}
                </label>
                {audioFile && (
                  <div className="mt-3 flex justify-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAudioFile(null);
                        setTranscript('');
                      }}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Remove file
                    </button>
                    {!transcript && (
                      <button
                        type="button"
                        onClick={handleTranscribeAudio}
                        disabled={transcribing}
                        className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-1"
                      >
                        {transcribing && (
                          <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        )}
                        <span>{transcribing ? 'Transcribing...' : 'Transcribe Audio'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              
              {/* Show transcript after transcription */}
              {transcript && uploadMode === 'audio' && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Generated Transcript
                  </label>
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Transcript will appear here after processing..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    You can edit the transcript before scoring if needed.
                  </p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || transcribing || (uploadMode === 'text' ? !transcript.trim() : !audioFile)}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading 
              ? 'Scoring Call...' 
              : transcribing 
              ? 'Transcribing...' 
              : uploadMode === 'audio' && !transcript 
              ? 'Transcribe & Score Call'
              : 'Score Call'
            }
          </button>
        </form>
            </div>
          </div>
        </div>
      )}

      {/* Recent Calls Section */}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {recentCalls.map((call) => (
              <Link
                key={call.id}
                to={`/calls/${call.id}`}
                className="block border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-lg transition-all relative group"
              >
                {/* Flag/Status Indicators */}
                <div className="absolute top-2 right-2 flex space-x-1">
                  {call.flagged_for_review && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800" title={call.flag_reason || 'Flagged for review'}>
                      🚩
                    </span>
                  )}
                  {call.manually_adjusted && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800" title="Manually adjusted">
                      ✏️
                    </span>
                  )}
                </div>
                
                {/* Score Badge */}
                <div className="mb-3">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(call.score_total)}`}>
                    {call.score_total}/20
                  </span>
                </div>
                
                {/* Call Title */}
                <h3 className="text-sm font-medium text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-600">
                  {call.title}
                </h3>
                
                {/* Metadata */}
                <div className="space-y-1 text-xs text-gray-500">
                  <p>{formatDate(call.created_at)}</p>
                  {FLAGS.ORGS && call.user?.email && (
                    <p>by {call.user.email}</p>
                  )}
                  {call.assistant_version && (
                    <p className="text-gray-400">
                      {call.assistant_version.name} v{call.assistant_version.version}
                    </p>
                  )}
                </div>
                
                {/* Flag Reason Tooltip on Hover */}
                {call.flagged_for_review && call.flag_reason && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-xs text-red-600 line-clamp-2" title={call.flag_reason}>
                      ⚠️ {call.flag_reason}
                    </p>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Save Filter Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
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