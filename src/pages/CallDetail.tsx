import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { BridgeSellingScore } from '../lib/scoring';

interface CallData {
  id: string;
  title: string;
  transcript: string;
  score_total: number;
  score_breakdown: BridgeSellingScore;
  created_at: string;
}

export default function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const [call, setCall] = useState<CallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'scorecard' | 'transcript'>('scorecard');

  useEffect(() => {
    fetchCall();
  }, [id]);

  const fetchCall = async () => {
    if (!id) return;

    try {
      const { data, error: fetchError } = await (supabase as any)
        .from('calls')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
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
        <p className="text-gray-500">{formatDate(call.created_at)}</p>
      </div>

      {/* Score Summary */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Overall Score</h2>
          <div className="text-3xl font-bold text-blue-600">
            {call.score_total}/20
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
    </div>
  );
}