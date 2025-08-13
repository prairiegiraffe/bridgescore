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

interface TeamMetrics {
  average_score: number;
  total_calls_month: number;
  close_rate: number;
  month_growth: number;
  score_trend: number[];
  calls_trend: number[];
  top_performers: TeamMember[];
}

export default function Team() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  
  const [teamMetrics, setTeamMetrics] = useState<TeamMetrics | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberRole, setMemberRole] = useState<string | null>(null);

  // Check if feature is enabled
  useEffect(() => {
    if (!FLAGS.TEAM_BOARDS) {
      navigate('/dashboard');
    }
  }, [navigate]);

  // Check user's role
  useEffect(() => {
    checkUserRole();
  }, [user, currentOrg]);

  // Fetch data
  useEffect(() => {
    if (memberRole && currentOrg) {
      fetchTeamPerformanceData();
    }
  }, [memberRole, currentOrg]);

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

  const fetchTeamPerformanceData = async () => {
    if (!currentOrg) return;
    
    setLoading(true);
    try {
      // For now, we'll use mock data for the team performance dashboard
      // In production, this would aggregate real data from calls and memberships tables
      
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
        top_performers: mockTeamMembers.sort((a, b) => b.avg_score - a.avg_score).slice(0, 3)
      };

      setTeamMembers(mockTeamMembers);
      setTeamMetrics(mockMetrics);
      
    } catch (err) {
      console.error('Error fetching team performance data:', err);
    } finally {
      setLoading(false);
    }
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
        <h1 className="text-3xl font-bold text-gray-900">Team Performance Dashboard</h1>
        <p className="text-gray-500 mt-1">Monitor and analyze team performance for {currentOrg?.name}</p>
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
                  style={{ height: `${(score / 20) * 100}%` }}
                ></div>
                <span className="text-xs text-gray-500 mt-2">Week {index + 1}</span>
                <span className="text-xs font-semibold text-gray-700">{score}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Calls Volume Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Call Volume</h3>
          <div className="flex items-end space-x-2 h-40">
            {teamMetrics.calls_trend.map((calls, index) => (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div 
                  className="bg-green-500 rounded-t-sm w-full transition-all duration-500"
                  style={{ height: `${(calls / Math.max(...teamMetrics.calls_trend)) * 100}%` }}
                ></div>
                <span className="text-xs text-gray-500 mt-2">Week {index + 1}</span>
                <span className="text-xs font-semibold text-gray-700">{calls}</span>
              </div>
            ))}
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
                    <button className="text-blue-600 hover:text-blue-800">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}