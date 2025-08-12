import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface BridgeStep {
  key: string;
  name: string;
  weight: number;
  order: number;
  customPrompt?: string;
}

interface Client {
  id: string;
  name: string;
  domain?: string;
  logo_url?: string;
  primary_color: string;
  secondary_color: string;
  bridge_steps: BridgeStep[];
  openai_assistant_id?: string;
  openai_vector_store_id?: string;
}

interface Props {
  client: Client;
  onClose: () => void;
  onUpdate: () => void;
}

export default function BridgeStepsEditor({ client, onClose, onUpdate }: Props) {
  const [steps, setSteps] = useState<BridgeStep[]>([]);
  const [clientName, setClientName] = useState(client.name);
  const [clientDomain, setClientDomain] = useState(client.domain || '');
  const [logoUrl, setLogoUrl] = useState(client.logo_url || '');
  const [primaryColor, setPrimaryColor] = useState(client.primary_color);
  const [secondaryColor, setSecondaryColor] = useState(client.secondary_color);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'steps' | 'branding'>('steps');
  const [editingStep, setEditingStep] = useState<string | null>(null);

  useEffect(() => {
    setSteps([...client.bridge_steps].sort((a, b) => a.order - b.order));
  }, [client]);

  const updateStep = (stepKey: string, updates: Partial<BridgeStep>) => {
    setSteps(prevSteps => 
      prevSteps.map(step => 
        step.key === stepKey ? { ...step, ...updates } : step
      )
    );
  };

  const moveStep = (stepKey: string, direction: 'up' | 'down') => {
    const stepIndex = steps.findIndex(s => s.key === stepKey);
    if (stepIndex === -1) return;

    const newSteps = [...steps];
    const swapIndex = direction === 'up' ? stepIndex - 1 : stepIndex + 1;
    
    if (swapIndex < 0 || swapIndex >= newSteps.length) return;

    // Swap the steps
    [newSteps[stepIndex], newSteps[swapIndex]] = [newSteps[swapIndex], newSteps[stepIndex]];
    
    // Update order numbers
    newSteps.forEach((step, index) => {
      step.order = index + 1;
    });
    
    setSteps(newSteps);
  };

  const resetToDefault = () => {
    const defaultSteps: BridgeStep[] = [
      { key: 'pinpoint_pain', name: 'Pinpoint Pain', weight: 5, order: 1 },
      { key: 'qualify', name: 'Qualify', weight: 3, order: 2 },
      { key: 'solution_success', name: 'Solution Success', weight: 3, order: 3 },
      { key: 'qa', name: 'Q&A', weight: 3, order: 4 },
      { key: 'next_steps', name: 'Next Steps', weight: 3, order: 5 },
      { key: 'close_or_schedule', name: 'Close or Schedule', weight: 3, order: 6 }
    ];
    setSteps(defaultSteps);
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('clients')
        .update({
          name: clientName,
          domain: clientDomain || null,
          logo_url: logoUrl || null,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          bridge_steps: steps,
          updated_at: new Date().toISOString()
        })
        .eq('id', client.id);

      if (error) throw error;
      
      alert('Client updated successfully!');
      onUpdate();
    } catch (err) {
      console.error('Error updating client:', err);
      alert('Failed to update client');
    } finally {
      setSaving(false);
    }
  };

  const getDefaultPrompt = (stepKey: string): string => {
    const prompts: Record<string, string> = {
      pinpoint_pain: `Look for evidence that the salesperson identified and explored the customer's pain points:
- Did they ask discovery questions about problems/challenges?
- Did they dig deeper into the pain to understand impact?
- Did they quantify the cost of the problem?
Score: 1 = Excellent pain discovery, 0.5 = Some pain discussion, 0 = No meaningful pain discovery`,

      qualify: `Evaluate if the salesperson qualified the prospect on Budget, Authority, and Timeline:
- Budget: Did they discuss investment/cost expectations?
- Authority: Did they identify decision makers?
- Timeline: Did they establish when a decision needs to be made?
Score: 1 = All 3 areas covered, 0.5 = 2 areas covered, 0 = 1 or no areas covered`,

      solution_success: `Assess how well the salesperson presented their solution:
- Did they connect features to the customer's specific pain?
- Did they provide relevant case studies or success stories?
- Did they focus on outcomes and benefits?
Score: 1 = Strong solution presentation with proof, 0.5 = Basic solution presentation, 0 = Weak or no solution presentation`,

      qa: `Evaluate how the salesperson handled questions and objections:
- Did they encourage questions?
- Did they address concerns thoroughly?
- Did they use questions to better understand objections?
Score: 1 = Excellent Q&A handling, 0.5 = Adequate handling, 0 = Poor or no Q&A`,

      next_steps: `Look for clear next steps and mutual commitment:
- Did they propose specific next steps?
- Did they get commitment from the prospect?
- Are the next steps actionable and time-bound?
Score: 1 = Clear, committed next steps, 0.5 = Some next steps discussed, 0 = No clear next steps`,

      close_or_schedule: `Evaluate the closing attempt or scheduling of follow-up:
- Did they attempt to close or advance the sale?
- Did they schedule a specific follow-up meeting?
- Did they create urgency or momentum?
Score: 1 = Strong close attempt or specific scheduling, 0.5 = Some closing effort, 0 = No closing attempt`
    };

    return prompts[stepKey] || 'Evaluate this step of the Bridge Selling process.';
  };

  const totalWeight = steps.reduce((sum, step) => sum + step.weight, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Edit Client: {client.name}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex space-x-8 mt-4">
            <button
              onClick={() => setActiveTab('steps')}
              className={`pb-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'steps'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Bridge Selling Steps
            </button>
            <button
              onClick={() => setActiveTab('branding')}
              className={`pb-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'branding'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Client Branding
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'steps' ? (
            <div className="space-y-6">
              {/* Steps Overview */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">Steps Overview</h3>
                  <button
                    onClick={resetToDefault}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Reset to Default
                  </button>
                </div>
                <div className="text-sm text-gray-600">
                  Total Weight: <span className="font-medium">{totalWeight}</span> • 
                  Steps: <span className="font-medium">{steps.length}</span>
                </div>
              </div>

              {/* Steps List */}
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div key={step.key} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-4">
                        <div className="flex flex-col space-y-1">
                          <button
                            onClick={() => moveStep(step.key, 'up')}
                            disabled={index === 0}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                          <button
                            onClick={() => moveStep(step.key, 'down')}
                            disabled={index === steps.length - 1}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                        
                        <div className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-medium">
                          #{step.order}
                        </div>
                        
                        <div className="flex-1">
                          <input
                            type="text"
                            value={step.name}
                            onChange={(e) => updateStep(step.key, { name: e.target.value })}
                            className="text-lg font-medium bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2"
                            placeholder="Step Name"
                          />
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <label className="text-sm text-gray-600">Weight:</label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={step.weight}
                            onChange={(e) => updateStep(step.key, { weight: parseInt(e.target.value) || 1 })}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                          />
                        </div>

                        <button
                          onClick={() => setEditingStep(editingStep === step.key ? null : step.key)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          {editingStep === step.key ? 'Hide Prompt' : 'Edit Prompt'}
                        </button>
                      </div>
                    </div>

                    {/* Custom Prompt Editor */}
                    {editingStep === step.key && (
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-gray-700">
                            Custom Scoring Prompt
                          </label>
                          <button
                            onClick={() => updateStep(step.key, { customPrompt: getDefaultPrompt(step.key) })}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Load Default
                          </button>
                        </div>
                        <textarea
                          value={step.customPrompt || getDefaultPrompt(step.key)}
                          onChange={(e) => updateStep(step.key, { customPrompt: e.target.value })}
                          rows={8}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
                          placeholder="Enter custom prompt for this step..."
                        />
                        <div className="text-xs text-gray-500">
                          This prompt will be sent to the OpenAI Assistant when scoring this step.
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Branding Tab */
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Client Info */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Client Information</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client Name
                    </label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Domain
                    </label>
                    <input
                      type="text"
                      value={clientDomain}
                      onChange={(e) => setClientDomain(e.target.value)}
                      placeholder="company.com"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Logo URL
                    </label>
                    <input
                      type="url"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="https://company.com/logo.png"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>

                {/* Colors */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Brand Colors</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Primary Color
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-12 h-10 border border-gray-300 rounded"
                      />
                      <input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Secondary Color
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-12 h-10 border border-gray-300 rounded"
                      />
                      <input
                        type="text"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="mt-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Preview
                    </label>
                    <div className="border border-gray-200 rounded-lg p-4" style={{ backgroundColor: primaryColor + '10' }}>
                      <div className="flex items-center space-x-3">
                        {logoUrl && (
                          <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded" />
                        )}
                        <div>
                          <div className="font-semibold" style={{ color: primaryColor }}>
                            {clientName}
                          </div>
                          <div className="text-sm" style={{ color: secondaryColor }}>
                            {clientDomain || 'company.com'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* OpenAI Information */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">OpenAI Integration</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">Assistant ID:</span>
                      <div className="font-mono text-gray-600 mt-1">
                        {client.openai_assistant_id || 'Not configured'}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Vector Store ID:</span>
                      <div className="font-mono text-gray-600 mt-1">
                        {client.openai_vector_store_id || 'Not configured'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {activeTab === 'steps' && `Total Weight: ${totalWeight} • ${steps.length} Steps`}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={saveChanges}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}