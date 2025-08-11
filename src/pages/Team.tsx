import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { supabase } from '../lib/supabase';
import { FLAGS } from '../lib/flags';

interface ReviewQueueItem {
  id: string;
  org_id: string;
  call_id: string;
  reviewer_id: string | null;
  status: 'new' | 'in_review' | 'coached' | 'done';
  notes: string | null;
  created_at: string;
  updated_at: string;
  call?: {
    title: string;
    score_total: number;
    user_id: string;
  };
  reviewer?: {
    email: string;
  };
}

interface CoachingTask {
  id: string;
  org_id: string;
  rep_user_id: string;
  call_id: string | null;
  step_key: string;
  status: 'todo' | 'doing' | 'done';
  due_date: string | null;
  created_at: string;
  rep?: {
    email: string;
  };
}

type TabType = 'overview' | 'boards' | 'reports';

export default function Team() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  
  const [activeTab, setActiveTab] = useState<TabType>('boards');
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [coachingTasks, setCoachingTasks] = useState<CoachingTask[]>([]);
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
      fetchTeamData();
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

  const fetchTeamData = async () => {
    if (!currentOrg) return;
    
    setLoading(true);
    try {
      // Fetch review queue with call details
      const { data: queueData, error: queueError } = await (supabase as any)
        .from('review_queue')
        .select(`
          *,
          call:calls(title, score_total, user_id),
          reviewer:reviewer_id(email)
        `)
        .eq('org_id', currentOrg.id)
        .order('created_at', { ascending: true });
      
      if (queueError) {
        console.error('Queue fetch error:', queueError);
      }
      setReviewQueue(queueData || []);

      // Fetch coaching tasks with rep details
      const { data: tasksData, error: tasksError } = await (supabase as any)
        .from('coaching_tasks')
        .select(`
          *,
          rep:rep_user_id(email)
        `)
        .eq('org_id', currentOrg.id)
        .order('due_date', { ascending: true });
      
      if (tasksError) {
        console.error('Tasks fetch error:', tasksError);
      }
      setCoachingTasks(tasksData || []);
    } catch (err) {
      console.error('Error fetching team data:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateReviewStatus = async (itemId: string, newStatus: ReviewQueueItem['status']) => {
    if (!currentOrg || memberRole !== 'owner' && memberRole !== 'admin') return;

    try {
      const { error } = await (supabase as any)
        .from('review_queue')
        .update({ 
          status: newStatus,
          reviewer_id: newStatus === 'in_review' ? user?.id : undefined
        })
        .eq('id', itemId);
      
      if (error) throw error;
      await fetchTeamData();
    } catch (err) {
      console.error('Error updating review status:', err);
    }
  };

  const updateTaskStatus = async (taskId: string, newStatus: CoachingTask['status']) => {
    if (!currentOrg || memberRole !== 'owner' && memberRole !== 'admin') return;

    try {
      const { error } = await (supabase as any)
        .from('coaching_tasks')
        .update({ status: newStatus })
        .eq('id', taskId);
      
      if (error) throw error;
      await fetchTeamData();
    } catch (err) {
      console.error('Error updating task status:', err);
    }
  };

  const stepLabels: Record<string, string> = {
    pinpoint_pain: 'Pinpoint Pain',
    qualify: 'Qualify',
    solution_success: 'Solution Success',
    qa: 'Q&A',
    next_steps: 'Next Steps',
    close_or_schedule: 'Close or Schedule',
  };

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Team Management</h1>
        <p className="text-gray-500 mt-1">Review calls and manage coaching for {currentOrg?.name}</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('boards')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'boards'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Boards
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'reports'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Reports
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900">Calls in Review</h3>
            <p className="text-3xl font-bold text-blue-600 mt-2">
              {reviewQueue.filter(item => item.status !== 'done').length}
            </p>
          </div>
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900">Active Coaching Tasks</h3>
            <p className="text-3xl font-bold text-green-600 mt-2">
              {coachingTasks.filter(task => task.status !== 'done').length}
            </p>
          </div>
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900">Completed This Week</h3>
            <p className="text-3xl font-bold text-gray-600 mt-2">
              {reviewQueue.filter(item => item.status === 'done').length}
            </p>
          </div>
        </div>
      )}

      {activeTab === 'boards' && (
        <div className="space-y-8">
          {/* Call Review Queue Kanban */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Call Review Queue</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {(['new', 'in_review', 'coached', 'done'] as const).map(status => (
                <div key={status} className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-700 mb-3 capitalize">
                    {status.replace('_', ' ')}
                    <span className="ml-2 text-sm text-gray-500">
                      ({reviewQueue.filter(item => item.status === status).length})
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {reviewQueue
                      .filter(item => item.status === status)
                      .map(item => (
                        <ReviewQueueCard
                          key={item.id}
                          item={item}
                          onStatusChange={(newStatus) => updateReviewStatus(item.id, newStatus)}
                          canEdit={memberRole === 'owner' || memberRole === 'admin'}
                        />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Coaching Plans Kanban */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Coaching Plans</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['todo', 'doing', 'done'] as const).map(status => (
                <div key={status} className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-700 mb-3 capitalize">
                    {status === 'todo' ? 'To Do' : status === 'doing' ? 'In Progress' : 'Done'}
                    <span className="ml-2 text-sm text-gray-500">
                      ({coachingTasks.filter(task => task.status === status).length})
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {coachingTasks
                      .filter(task => task.status === status)
                      .map(task => (
                        <CoachingTaskCard
                          key={task.id}
                          task={task}
                          stepLabels={stepLabels}
                          onStatusChange={(newStatus) => updateTaskStatus(task.id, newStatus)}
                          canEdit={memberRole === 'owner' || memberRole === 'admin'}
                        />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="bg-white shadow rounded-lg p-6">
          <p className="text-gray-500">Reports coming soon...</p>
        </div>
      )}
    </div>
  );
}

// Review Queue Card Component
function ReviewQueueCard({ 
  item, 
  onStatusChange, 
  canEdit 
}: { 
  item: ReviewQueueItem; 
  onStatusChange: (status: ReviewQueueItem['status']) => void;
  canEdit: boolean;
}) {
  const getScoreColor = (score: number) => {
    if (score >= 16) return 'text-green-600';
    if (score >= 10) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getTimeAgo = (date: string) => {
    const now = new Date();
    const past = new Date(date);
    const diffInDays = Math.floor((now.getTime() - past.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return '1 day ago';
    return `${diffInDays} days ago`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-sm">
      <div className="mb-2">
        <h4 className="font-medium text-gray-900 text-sm truncate">
          {item.call?.title || 'Untitled Call'}
        </h4>
        <div className="flex items-center justify-between mt-1">
          <span className={`text-lg font-bold ${getScoreColor(item.call?.score_total || 0)}`}>
            {item.call?.score_total || 0}/20
          </span>
          <span className="text-xs text-gray-500">
            {getTimeAgo(item.created_at)}
          </span>
        </div>
      </div>
      
      {item.reviewer && (
        <p className="text-xs text-gray-600 mb-2">
          Reviewer: {item.reviewer.email}
        </p>
      )}

      {canEdit && (
        <select
          value={item.status}
          onChange={(e) => onStatusChange(e.target.value as ReviewQueueItem['status'])}
          className="w-full text-xs px-2 py-1 border border-gray-300 rounded"
        >
          <option value="new">New</option>
          <option value="in_review">In Review</option>
          <option value="coached">Coached</option>
          <option value="done">Done</option>
        </select>
      )}
    </div>
  );
}

// Coaching Task Card Component
function CoachingTaskCard({ 
  task, 
  stepLabels,
  onStatusChange, 
  canEdit 
}: { 
  task: CoachingTask;
  stepLabels: Record<string, string>;
  onStatusChange: (status: CoachingTask['status']) => void;
  canEdit: boolean;
}) {
  const getDueDateColor = (dueDate: string | null) => {
    if (!dueDate) return '';
    const due = new Date(dueDate);
    const today = new Date();
    const diffInDays = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays < 0) return 'text-red-600';
    if (diffInDays <= 3) return 'text-yellow-600';
    return 'text-gray-600';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-sm">
      <div className="mb-2">
        <h4 className="font-medium text-gray-900 text-sm">
          {task.rep?.email || 'Unknown Rep'}
        </h4>
        <p className="text-xs text-gray-600 mt-1">
          {stepLabels[task.step_key] || task.step_key}
        </p>
        {task.due_date && (
          <p className={`text-xs mt-1 ${getDueDateColor(task.due_date)}`}>
            Due: {new Date(task.due_date).toLocaleDateString()}
          </p>
        )}
      </div>

      {canEdit && (
        <select
          value={task.status}
          onChange={(e) => onStatusChange(e.target.value as CoachingTask['status'])}
          className="w-full text-xs px-2 py-1 border border-gray-300 rounded"
        >
          <option value="todo">To Do</option>
          <option value="doing">In Progress</option>
          <option value="done">Done</option>
        </select>
      )}
    </div>
  );
}