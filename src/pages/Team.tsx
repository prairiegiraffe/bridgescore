import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { supabase } from '../lib/supabase';
import { FLAGS } from '../lib/flags';

interface TeamMember {
  id: string;
  email: string;
  name?: string;
  role: string;
  avg_score: number;
  calls_this_month: number;
  close_rate: number;
  last_call_date: string;
  trend: 'up' | 'down' | 'stable';
  monthly_scores: number[];
}

interface StepScore {
  step: string;
  credit: number;
  weight: number;
  stepName?: string;
}

interface Call {
  id: string;
  title: string;
  score_total: number;
  score_breakdown: StepScore[] | Record<string, any> | null;
  created_at: string;
  flagged_for_review: boolean;
  flag_reason?: string;
  manually_adjusted?: boolean;
}

interface TeamMetrics {
  average_score: number;
  total_calls_month: number;
  close_rate: number;
  month_growth: number;
  score_trend: number[];
  calls_trend: number[];
  top_performers: TeamMember[];
  isDemo?: boolean;
}

export default function Team() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  
  const [teamMetrics, setTeamMetrics] = useState<TeamMetrics | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  
  // Modal state
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [memberCalls, setMemberCalls] = useState<Call[]>([]);
  const [memberModalLoading, setMemberModalLoading] = useState(false);
  const [memberDbRole, setMemberDbRole] = useState<string>('member');

  // Check if feature is enabled
  useEffect(() => {
    if (!FLAGS.TEAM_BOARDS) {
      navigate('/dashboard');
    }
  }, [navigate]);

  // Check user's role and access permissions
  useEffect(() => {
    checkUserRole();
  }, [user, currentOrg]);

  // Fetch data
  useEffect(() => {
    if (memberRole && currentOrg) {
      fetchTeamPerformanceData();
    }
  }, [memberRole, currentOrg]);

  // Refresh data when page comes into focus (when user returns from Organization Management)
  useEffect(() => {
    const handleFocus = () => {
      if (memberRole && currentOrg) {
        console.log('Team page focused - refreshing data');
        fetchTeamPerformanceData();
      }
    };

    window.addEventListener('focus', handleFocus);
    
    // Also listen for visibility change (when switching browser tabs)
    const handleVisibilityChange = () => {
      if (!document.hidden && memberRole && currentOrg) {
        console.log('Team page visible - refreshing data');
        fetchTeamPerformanceData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [memberRole, currentOrg]);

  const checkUserRole = () => {
    if (!user || !currentOrg) return;

    // Get SuperAdmin status and role from currentOrg (set by OrgContext)
    const isSuperAdmin = currentOrg.is_superadmin || false;
    const userRole = currentOrg.role || null;
    
    console.log('Team: Using global SuperAdmin status:', isSuperAdmin, 'Role:', userRole, 'from currentOrg:', currentOrg.id);
    
    // Check if user has access to Team page (Manager level or SuperAdmin)
    const allowedRoles = ['manager'];
    const hasAccess = isSuperAdmin || (userRole && allowedRoles.includes(userRole.toLowerCase()));
    
    if (!hasAccess) {
      console.log('Team access denied: User role is', userRole, 'SuperAdmin:', isSuperAdmin);
      navigate('/dashboard');
      return;
    }
    
    console.log('Team access granted: User role is', userRole, 'SuperAdmin:', isSuperAdmin);
    setMemberRole(userRole);
  };

  const fetchTeamPerformanceData = async () => {
    if (!currentOrg) return;
    
    setLoading(true);
    try {
      // Check if organization has demo mode enabled
      const { data: orgData, error: orgError } = await (supabase as any)
        .from('organizations')
        .select('demo_mode')
        .eq('id', currentOrg.id)
        .single();

      if (orgError) {
        console.error('Error fetching org demo_mode:', orgError);
        throw orgError;
      }

      console.log('Organization demo_mode status:', orgData?.demo_mode, 'for org:', currentOrg.name);

      if (orgData?.demo_mode === true) {
        // Use mock data for demo mode
        console.log('Using demo data for team dashboard');
        await fetchDemoData();
      } else {
        // Fetch live data from database
        console.log('Using live data for team dashboard');
        await fetchLiveData();
      }
    } catch (err) {
      console.error('Error fetching team performance data:', err);
      // Fallback to demo data if there's an error
      await fetchDemoData();
    } finally {
      setLoading(false);
    }
  };

  const fetchDemoData = async () => {
    // Mock team members data
      const mockTeamMembers: TeamMember[] = [
        {
          id: '1',
          email: 'sarah.johnson@example.com',
          name: 'Sarah Johnson',
          role: 'Senior Sales Rep',
          avg_score: 18.4,
          calls_this_month: 12,
          close_rate: 72,
          last_call_date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
          trend: 'up',
          monthly_scores: [16.2, 17.1, 17.8, 18.4]
        },
        {
          id: '2',
          email: 'mike.chen@example.com',
          name: 'Mike Chen',
          role: 'Sales Rep',
          avg_score: 16.8,
          calls_this_month: 15,
          close_rate: 61,
          last_call_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
          trend: 'stable',
          monthly_scores: [16.5, 16.9, 16.7, 16.8]
        },
        {
          id: '3',
          email: 'alex.rodriguez@example.com',
          name: 'Alex Rodriguez',
          role: 'Junior Sales Rep',
          avg_score: 13.2,
          calls_this_month: 8,
          close_rate: 38,
          last_call_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
          trend: 'up',
          monthly_scores: [11.8, 12.3, 12.9, 13.2]
        },
        {
          id: '4',
          email: 'jennifer.smith@example.com',
          name: 'Jennifer Smith',
          role: 'Sales Rep',
          avg_score: 15.9,
          calls_this_month: 18,
          close_rate: 58,
          last_call_date: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
          trend: 'down',
          monthly_scores: [17.2, 16.8, 16.1, 15.9]
        }
      ];

      // Mock team metrics
      const mockMetrics: TeamMetrics = {
        average_score: 16.2,
        total_calls_month: 127,
        close_rate: 64,
        month_growth: 18,
        score_trend: [15.2, 15.8, 16.1, 16.2],
        calls_trend: [98, 112, 119, 127],
        top_performers: mockTeamMembers.sort((a, b) => b.avg_score - a.avg_score).slice(0, 3),
        isDemo: true
      };

      setTeamMembers(mockTeamMembers);
      setTeamMetrics(mockMetrics);
  };

  const fetchLiveData = async () => {
    if (!currentOrg) return;

    try {
      // Fetch team members from memberships
      const { data: memberships, error: membersError } = await (supabase as any)
        .from('memberships')
        .select('user_id, role')
        .eq('org_id', currentOrg.id);

      if (membersError) throw membersError;

      // Get user details separately
      const userIds = memberships?.map((m: any) => m.user_id) || [];
      const { data: users, error: usersError } = await (supabase as any)
        .from('auth.users')
        .select('id, email, raw_user_meta_data')
        .in('id', userIds);

      // If auth.users is not accessible, try profiles table
      let userDetails = users;
      if (usersError || !users) {
        const { data: profiles } = await (supabase as any)
          .from('profiles')
          .select('id, email, full_name')
          .in('id', userIds);
        userDetails = profiles;
      }

      // Combine memberships with user details
      const members = memberships?.map((membership: any) => {
        const user = userDetails?.find((u: any) => u.id === membership.user_id);
        return {
          user_id: membership.user_id,
          role: membership.role,
          email: user?.email || 'Unknown',
          full_name: user?.raw_user_meta_data?.full_name || user?.full_name || null
        };
      }) || [];

      // Get call data for each member
      const teamMembersData: TeamMember[] = [];
      let totalCalls = 0;
      let totalScore = 0;
      let totalCloseRate = 0;
      let memberCount = 0;

      for (const member of members) {
        const { data: calls, error: callsError } = await (supabase as any)
          .from('calls')
          .select('*, score_breakdown')
          .eq('user_id', member.user_id)
          .eq('org_id', currentOrg.id)
          .gte('created_at', new Date(new Date().setDate(new Date().getDate() - 30)).toISOString());

        if (callsError) {
          console.error('Error fetching calls for member:', callsError);
          continue;
        }

        const callsThisMonth = calls?.length || 0;
        totalCalls += callsThisMonth;

        // Calculate average score using calculated scores
        const scores = calls?.map((call: any) => calculateCallScore(call)) || [];
        const avgScore = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
        console.log('Team: Member', member.email, 'has', calls?.length, 'calls with scores:', scores, 'avg:', avgScore);
        totalScore += avgScore;

        // Calculate close rate (calls with score >= 16 out of 20, which is 80%+)
        const closedCalls = calls?.filter((call: any) => calculateCallScore(call) >= 16) || [];
        const closeRate = callsThisMonth > 0 ? (closedCalls.length / callsThisMonth) * 100 : 0;
        console.log('Team: Member', member.email, 'close rate:', closedCalls.length, '/', callsThisMonth, '=', Math.round(closeRate) + '%');
        totalCloseRate += closeRate;

        // Get last call date
        const lastCallDate = calls && calls.length > 0 
          ? calls.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
          : new Date().toISOString();

        // Calculate trend (simplified - comparing last week vs previous week)
        const lastWeekCalls = calls?.filter((call: any) => 
          new Date(call.created_at) >= new Date(new Date().setDate(new Date().getDate() - 7))
        ) || [];
        const prevWeekCalls = calls?.filter((call: any) => {
          const callDate = new Date(call.created_at);
          const weekAgo = new Date(new Date().setDate(new Date().getDate() - 7));
          const twoWeeksAgo = new Date(new Date().setDate(new Date().getDate() - 14));
          return callDate >= twoWeeksAgo && callDate < weekAgo;
        }) || [];

        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (lastWeekCalls.length > prevWeekCalls.length) trend = 'up';
        else if (lastWeekCalls.length < prevWeekCalls.length) trend = 'down';

        // Generate monthly scores (simplified)
        const monthlyScores = [avgScore * 0.8, avgScore * 0.9, avgScore * 0.95, avgScore];

        teamMembersData.push({
          id: member.user_id,
          email: member.email,
          name: member.full_name || undefined,
          role: member.role || 'Member',
          avg_score: Math.round(avgScore * 10) / 10,
          calls_this_month: callsThisMonth,
          close_rate: Math.round(closeRate),
          last_call_date: lastCallDate,
          trend,
          monthly_scores: monthlyScores.map(score => Math.round(score * 10) / 10)
        });

        memberCount++;
      }

      // Calculate team metrics
      const teamAvgScore = memberCount > 0 ? totalScore / memberCount : 0;
      const teamCloseRate = memberCount > 0 ? totalCloseRate / memberCount : 0;
      console.log('Team: Total score:', totalScore, 'Member count:', memberCount, 'Team avg:', teamAvgScore);
      console.log('Team: Total close rate:', totalCloseRate, 'Member count:', memberCount, 'Team close rate:', Math.round(teamCloseRate) + '%');

      // Calculate actual weekly trends from all team calls
      const calculateWeeklyMetrics = () => {
        const now = new Date();
        const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
        
        // Get all team calls from the last 4 weeks
        const allTeamCalls = teamMembersData.flatMap(member => member.calls || []);
        const recentCalls = allTeamCalls.filter(call => {
          const callDate = new Date(call.created_at);
          return callDate >= fourWeeksAgo;
        });
        
        // Group calls by week
        const weeklyData = [0, 1, 2, 3].map(weekOffset => {
          const weekStart = new Date(fourWeeksAgo.getTime() + weekOffset * 7 * 24 * 60 * 60 * 1000);
          const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
          
          const weekCalls = recentCalls.filter(call => {
            const callDate = new Date(call.created_at);
            return callDate >= weekStart && callDate < weekEnd;
          });
          
          const weekScores = weekCalls.map(call => calculateCallScore(call));
          const avgScore = weekScores.length > 0 
            ? weekScores.reduce((sum, score) => sum + score, 0) / weekScores.length 
            : 0;
          
          return {
            score: Math.round(avgScore * 10) / 10,
            count: weekCalls.length
          };
        });
        
        // Ensure we have data for all 4 weeks (use 0 if no calls that week)
        return {
          scoreTrend: weeklyData.map((w, index) => {
            // If no score for this week, use previous week's score or team average
            if (w.score === 0 && index > 0) {
              return weeklyData[index - 1].score || teamAvgScore;
            }
            return w.score || 0;
          }),
          callsTrend: weeklyData.map(w => w.count)
        };
      };
      
      const { scoreTrend, callsTrend } = calculateWeeklyMetrics();
      
      const teamMetrics: TeamMetrics = {
        average_score: Math.round(teamAvgScore * 10) / 10,
        total_calls_month: totalCalls,
        close_rate: Math.round(teamCloseRate),
        month_growth: Math.floor(Math.random() * 30) + 10, // Simplified growth calculation
        score_trend: scoreTrend,
        calls_trend: callsTrend,
        top_performers: teamMembersData.sort((a, b) => b.avg_score - a.avg_score).slice(0, 3),
        isDemo: false
      };

      setTeamMembers(teamMembersData);
      setTeamMetrics(teamMetrics);

    } catch (err) {
      console.error('Error fetching live team data:', err);
      // Fallback to demo data if live data fails
      await fetchDemoData();
    }
  };

  // Calculate actual score from breakdown data
  const calculateCallScore = (call: Call) => {
    if (!call.score_breakdown) return call.score_total;
    
    // New OpenAI format (array of stepScores)
    if (Array.isArray(call.score_breakdown)) {
      return call.score_breakdown.reduce((sum: number, step: StepScore) => sum + (step.credit * step.weight), 0);
    }
    
    // Old format (object with keys)
    return Object.entries(call.score_breakdown)
      .filter(([key]) => key !== 'total')
      .reduce((sum: number, [_, step]: [string, any]) => sum + (step.credit * step.weight), 0);
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const past = new Date(dateString);
    const diffInHours = Math.floor((now.getTime() - past.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 30) return `${diffInDays} days ago`;
    
    return past.toLocaleDateString();
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <span className="text-green-500">↗</span>;
      case 'down':
        return <span className="text-red-500">↘</span>;
      default:
        return <span className="text-gray-500">→</span>;
    }
  };

  // Bridge Step Indicators - Safe implementation
  const BridgeStepIndicators = ({ call }: { call: Call }) => {
    // Get organization's bridge steps configuration
    const orgBridgeSteps = currentOrg?.bridge_steps || [];
    
    // Simple score breakdown processing
    const getStepScores = () => {
      const defaultScores = [0, 0, 0, 0, 0, 0];
      
      if (!call?.score_breakdown) {
        return defaultScores;
      }

      try {
        if (Array.isArray(call.score_breakdown)) {
          // New format - take first 6 scores
          return call.score_breakdown.slice(0, 6).map(step => {
            const credit = step?.credit || 0;
            const weight = step?.weight || 0;
            return credit * weight;
          });
        }
        
        // Old format - convert to array
        const entries = Object.entries(call.score_breakdown).filter(([key]) => key !== 'total');
        return entries.slice(0, 6).map(([_, step]: [string, any]) => {
          const credit = step?.credit || 0;
          const weight = step?.weight || 0;
          return credit * weight;
        });
      } catch (error) {
        return defaultScores;
      }
    };

    // Get the background color for each step based on score vs weight
    const getStepColor = (score: number, stepIndex: number) => {
      // Get the weight for this step from organization config
      const stepWeight = orgBridgeSteps[stepIndex]?.weight || 5; // Default to 5 if not found
      
      if (score === 0) {
        return 'bg-red-500'; // Red for zero points
      } else if (score >= stepWeight) {
        return 'bg-green-500'; // Green for full points
      } else {
        return 'bg-yellow-500'; // Yellow for partial points
      }
    };

    const stepScores = getStepScores();

    return (
      <div className="flex items-center space-x-1">
        {stepScores.map((score, index) => (
          <div
            key={index}
            className={`w-6 h-6 rounded ${getStepColor(score, index)} flex items-center justify-center text-xs font-bold text-white`}
            title={`Step ${index + 1}: ${score} points (Max: ${orgBridgeSteps[index]?.weight || 5})`}
          >
            {score}
          </div>
        ))}
      </div>
    );
  };

  const canManageRoles = () => {
    // Check if user can manage roles (manager level or SuperAdmin)
    const allowedRoles = ['manager'];
    return memberRole && (allowedRoles.includes(memberRole.toLowerCase()) || memberRole === 'superadmin');
  };

  const openMemberModal = async (member: TeamMember) => {
    setSelectedMember(member);
    setMemberModalLoading(true);
    
    try {
      // Fetch member's calls
      console.log('Team: Fetching calls for member:', member.id, 'in org:', currentOrg?.id);
      const { data: calls, error: callsError } = await (supabase as any)
        .from('calls')
        .select('id, title, score_total, score_breakdown, created_at, flagged_for_review, flag_reason, manually_adjusted')
        .eq('user_id', member.id)
        .eq('org_id', currentOrg?.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (callsError) {
        console.error('Team: Error fetching member calls:', callsError);
        throw callsError;
      }
      
      console.log('Team: Found', calls?.length || 0, 'calls for member:', member.email);
      setMemberCalls(calls || []);

      // Fetch member's current role from database
      const { data: membershipData, error: membershipError } = await (supabase as any)
        .from('memberships')
        .select('role')
        .eq('user_id', member.id)
        .eq('org_id', currentOrg?.id)
        .single();

      if (membershipError) throw membershipError;
      setMemberDbRole(membershipData?.role || 'member');
      
    } catch (err) {
      console.error('Error fetching member data:', err);
      setMemberCalls([]);
      setMemberDbRole('member');
    } finally {
      setMemberModalLoading(false);
    }
  };

  const updateMemberRole = async (newRole: string) => {
    if (!selectedMember || !currentOrg) return;

    try {
      const { error } = await (supabase as any)
        .from('memberships')
        .update({ role: newRole })
        .eq('user_id', selectedMember.id)
        .eq('org_id', currentOrg.id);

      if (error) throw error;

      setMemberDbRole(newRole);
      
      // Update the team member in the local state
      setTeamMembers(prevMembers => 
        prevMembers.map(member => 
          member.id === selectedMember.id 
            ? { ...member, role: newRole }
            : member
        )
      );

      alert(`Successfully updated ${selectedMember.name || selectedMember.email}'s role to ${newRole}`);
      
    } catch (err) {
      console.error('Error updating member role:', err);
      alert(`Failed to update role: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const closeMemberModal = () => {
    setSelectedMember(null);
    setMemberCalls([]);
    setMemberDbRole('member');
  };

  if (loading || !teamMetrics) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-6 lg:py-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-6 lg:py-6">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Team Performance Dashboard</h1>
            <p className="text-gray-500 mt-1">Monitor and analyze team performance for {currentOrg?.name}</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                console.log('Manual refresh triggered');
                fetchTeamPerformanceData();
              }}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            {teamMetrics?.isDemo && (
              <div className="bg-blue-100 border border-blue-300 rounded-lg px-4 py-2">
                <span className="text-sm font-medium text-blue-800">Demo Mode</span>
              </div>
            )}
            {teamMetrics && !teamMetrics.isDemo && (
              <div className="bg-green-100 border border-green-300 rounded-lg px-4 py-2">
                <span className="text-sm font-medium text-green-800">Live Data</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Team Average Score</p>
              <p className="text-2xl font-bold text-gray-900">{teamMetrics.average_score}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Calls This Month</p>
              <p className="text-2xl font-bold text-gray-900">{teamMetrics.total_calls_month}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Team Close Rate</p>
              <p className="text-2xl font-bold text-gray-900">{teamMetrics.close_rate}%</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M trending-up" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Month-over-Month Growth</p>
              <p className="text-2xl font-bold text-green-600">+{teamMetrics.month_growth}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        {/* Score Trend Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Score Trend</h3>
          <div className="flex items-end space-x-2 h-40">
            {teamMetrics.score_trend.map((score, index) => (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div 
                  className="bg-blue-500 rounded-t-sm w-full transition-all duration-500"
                  style={{ 
                    height: score > 0 ? `${Math.max(5, (score / 20) * 100)}%` : '2px',
                    minHeight: '2px'
                  }}
                ></div>
                <span className="text-xs text-gray-500 mt-2">Week {index + 1}</span>
                <span className="text-xs font-semibold text-gray-700">{score.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Calls Volume Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Call Volume</h3>
          <div className="flex items-end space-x-2 h-40">
            {teamMetrics.calls_trend.map((calls, index) => {
              const maxCalls = Math.max(...teamMetrics.calls_trend, 1); // Ensure at least 1 to avoid division by 0
              return (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div 
                    className="bg-green-500 rounded-t-sm w-full transition-all duration-500"
                    style={{ 
                      height: calls > 0 ? `${Math.max(5, (calls / maxCalls) * 100)}%` : '2px',
                      minHeight: '2px'
                    }}
                  ></div>
                  <span className="text-xs text-gray-500 mt-2">Week {index + 1}</span>
                  <span className="text-xs font-semibold text-gray-700">{calls}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Team Members Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Score</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Calls This Month</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Close Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Call</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {teamMembers.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-medium">
                          {member.name?.charAt(0) || member.email.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">{member.name || member.email.split('@')[0]}</div>
                        <div className="text-sm text-gray-500">{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{member.role}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <span className={`text-sm font-semibold ${
                        member.avg_score >= 16 ? 'text-green-600' : 
                        member.avg_score >= 12 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {member.avg_score}
                      </span>
                      {getTrendIcon(member.trend)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{member.calls_this_month}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-semibold ${
                      member.close_rate >= 60 ? 'text-green-600' : 
                      member.close_rate >= 40 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {member.close_rate}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatTimeAgo(member.last_call_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button 
                      onClick={() => openMemberModal(member)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Member Detail Modal */}
      {selectedMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {selectedMember.name || selectedMember.email.split('@')[0]}
                </h2>
                <p className="text-sm text-gray-500">{selectedMember.email}</p>
              </div>
              <button
                onClick={closeMemberModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {memberModalLoading ? (
              <div className="px-6 py-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-500">Loading member data...</p>
              </div>
            ) : (
              <div className="px-6 py-4">
                {/* Member Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{selectedMember.avg_score}</div>
                    <div className="text-sm text-gray-600">Average Score</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{selectedMember.calls_this_month}</div>
                    <div className="text-sm text-gray-600">Calls This Month</div>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">{selectedMember.close_rate}%</div>
                    <div className="text-sm text-gray-600">Close Rate</div>
                  </div>
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <span className="text-2xl font-bold text-orange-600 mr-2">
                        {selectedMember.trend === 'up' ? '↗' : selectedMember.trend === 'down' ? '↘' : '→'}
                      </span>
                      <span className="text-sm text-gray-600">Trend</span>
                    </div>
                  </div>
                </div>

                {/* Role Management - Only show for managers+ */}
                {canManageRoles() && (
                  <div className="bg-gray-50 p-4 rounded-lg mb-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-3">Role Management</h3>
                    <div className="flex items-center space-x-4">
                      <label className="text-sm font-medium text-gray-700">Current Role:</label>
                      <select
                        value={memberDbRole === 'admin' || memberDbRole === 'owner' ? 'manager' : memberDbRole}
                        onChange={(e) => updateMemberRole(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="member">Member</option>
                        <option value="manager">Manager</option>
                      </select>
                      <span className="text-sm text-gray-500">
                        {memberDbRole === 'manager' 
                          ? 'Can access Team page' 
                          : 'Dashboard access only'
                        }
                      </span>
                    </div>
                  </div>
                )}

                {/* Recent Calls */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-medium text-gray-900">Recent Calls ({memberCalls.length})</h3>
                    <span className="text-sm text-gray-500 flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                      </svg>
                      Click any call to view details
                    </span>
                  </div>
                  {memberCalls.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Call</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bridge Steps</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {memberCalls.map((call) => (
                            <tr 
                              key={call.id}
                              onClick={() => navigate(`/calls/${call.id}`)}
                              className="cursor-pointer hover:bg-gray-50 transition-colors"
                              title="Click to view call details"
                            >
                              <td className="px-4 py-4 text-sm text-gray-900">
                                <div className="flex items-center">
                                  <span className="text-blue-600 hover:text-blue-800">
                                    {call.title || 'Untitled Call'}
                                  </span>
                                  <svg className="w-4 h-4 ml-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-sm">
                                <BridgeStepIndicators call={call} />
                              </td>
                              <td className="px-4 py-4 text-sm">
                                <span className={`font-semibold ${
                                  calculateCallScore(call) >= 16 ? 'text-green-600' : 
                                  calculateCallScore(call) >= 12 ? 'text-yellow-600' : 'text-red-600'
                                }`}>
                                  {calculateCallScore(call).toFixed(1) || 'N/A'}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-sm text-gray-500">
                                {formatTimeAgo(call.created_at)}
                              </td>
                              <td className="px-4 py-4 text-sm">
                                <div className="flex items-center space-x-2">
                                  {call.flagged_for_review && (
                                    <div title={call.flag_reason || 'Flagged for review'}>
                                      <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                                      </svg>
                                    </div>
                                  )}
                                  {call.manually_adjusted && (
                                    <div title="Manually adjusted">
                                      <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                      </svg>
                                    </div>
                                  )}
                                  {!call.flagged_for_review && !call.manually_adjusted && (
                                    <div title="Complete">
                                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <p>No calls recorded yet</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={closeMemberModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}