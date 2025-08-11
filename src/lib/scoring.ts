export type ScoreCredit = 1 | 0.5 | 0;
export type ScoreColor = 'green' | 'yellow' | 'red';

export interface ScoreStep {
  weight: number;
  credit: ScoreCredit;
  color: ScoreColor;
  notes: string;
}

export interface BridgeSellingScore {
  total: number;
  pinpoint_pain: ScoreStep;
  qualify: ScoreStep;
  solution_success: ScoreStep;
  qa: ScoreStep;
  next_steps: ScoreStep;
  close_or_schedule: ScoreStep;
}

export function scoreBridgeSelling(transcript: string): BridgeSellingScore {
  const text = transcript.toLowerCase();
  
  // Helper function to get color from credit
  const getColor = (credit: ScoreCredit): ScoreColor => {
    if (credit === 1) return 'green';
    if (credit === 0.5) return 'yellow';
    return 'red';
  };

  // Step 1: Pinpoint Pain (weight: 5)
  const pinpointPain = scorePinpointPain(text);
  
  // Step 2: Qualify (weight: 3)
  const qualify = scoreQualify(text);
  
  // Step 3: Solution Success (weight: 3)
  const solutionSuccess = scoreSolutionSuccess(text);
  
  // Step 4: Q&A (weight: 3)
  const qa = scoreQA(text);
  
  // Step 5: Next Steps (weight: 3)
  const nextSteps = scoreNextSteps(text);
  
  // Step 6: Close or Schedule (weight: 3)
  const closeOrSchedule = scoreCloseOrSchedule(text);

  // Calculate total score (0-20)
  const total = Math.round(
    pinpointPain.weight * pinpointPain.credit +
    qualify.weight * qualify.credit +
    solutionSuccess.weight * solutionSuccess.credit +
    qa.weight * qa.credit +
    nextSteps.weight * nextSteps.credit +
    closeOrSchedule.weight * closeOrSchedule.credit
  );

  return {
    total,
    pinpoint_pain: pinpointPain,
    qualify,
    solution_success: solutionSuccess,
    qa,
    next_steps: nextSteps,
    close_or_schedule: closeOrSchedule,
  };
}

function scorePinpointPain(text: string): ScoreStep {
  const weight = 5;
  let credit: ScoreCredit = 0;
  let notes = '';

  // Pain keywords
  const painKeywords = [
    'problem', 'issue', 'challenge', 'struggle', 'difficulty', 'pain',
    'frustrating', 'annoying', 'costing', 'losing', 'waste', 'inefficient'
  ];
  
  const painCount = painKeywords.filter(keyword => text.includes(keyword)).length;
  
  // Questions about pain
  const painQuestions = [
    'what.*problem', 'what.*challenge', 'what.*issue', 'what.*pain',
    'how.*affecting', 'how.*impact', 'tell me about.*problem'
  ];
  
  const painQuestionCount = painQuestions.filter(pattern => 
    new RegExp(pattern).test(text)
  ).length;

  if (painCount >= 3 && painQuestionCount >= 2) {
    credit = 1;
    notes = `Excellent pain discovery: ${painCount} pain indicators, ${painQuestionCount} pain questions`;
  } else if (painCount >= 2 || painQuestionCount >= 1) {
    credit = 0.5;
    notes = `Some pain discovery: ${painCount} pain indicators, ${painQuestionCount} pain questions`;
  } else {
    credit = 0;
    notes = `Minimal pain discovery: ${painCount} pain indicators, ${painQuestionCount} pain questions`;
  }

  return {
    weight,
    credit,
    color: getColor(credit),
    notes,
  };
}

function scoreQualify(text: string): ScoreStep {
  const weight = 3;
  let credit: ScoreCredit = 0;
  let notes = '';

  // Budget/authority keywords
  const budgetKeywords = ['budget', 'cost', 'price', 'investment', 'spend', 'afford'];
  const authorityKeywords = ['decision', 'approve', 'authority', 'manager', 'boss', 'team'];
  const timelineKeywords = ['when', 'timeline', 'deadline', 'urgent', 'priority'];
  
  const budgetMentioned = budgetKeywords.some(keyword => text.includes(keyword));
  const authorityMentioned = authorityKeywords.some(keyword => text.includes(keyword));
  const timelineMentioned = timelineKeywords.some(keyword => text.includes(keyword));
  
  const qualifyCount = [budgetMentioned, authorityMentioned, timelineMentioned].filter(Boolean).length;

  if (qualifyCount === 3) {
    credit = 1;
    notes = 'Fully qualified: budget, authority, and timeline discussed';
  } else if (qualifyCount === 2) {
    credit = 0.5;
    notes = `Partially qualified: ${qualifyCount}/3 areas covered`;
  } else {
    credit = 0;
    notes = `Poor qualification: ${qualifyCount}/3 areas covered`;
  }

  return {
    weight,
    credit,
    color: getColor(credit),
    notes,
  };
}

function scoreSolutionSuccess(text: string): ScoreStep {
  const weight = 3;
  let credit: ScoreCredit = 0;
  let notes = '';

  // Solution presentation keywords
  const solutionKeywords = [
    'solution', 'solve', 'fix', 'address', 'help', 'benefit', 'advantage',
    'feature', 'capability', 'outcome', 'result'
  ];
  
  const solutionCount = solutionKeywords.filter(keyword => text.includes(keyword)).length;
  
  // Success stories/examples
  const exampleKeywords = ['example', 'case study', 'client', 'customer', 'similar', 'like you'];
  const examplesGiven = exampleKeywords.some(keyword => text.includes(keyword));

  if (solutionCount >= 4 && examplesGiven) {
    credit = 1;
    notes = `Strong solution presentation: ${solutionCount} solution terms, examples provided`;
  } else if (solutionCount >= 2) {
    credit = 0.5;
    notes = `Basic solution presentation: ${solutionCount} solution terms, examples: ${examplesGiven}`;
  } else {
    credit = 0;
    notes = `Weak solution presentation: ${solutionCount} solution terms, examples: ${examplesGiven}`;
  }

  return {
    weight,
    credit,
    color: getColor(credit),
    notes,
  };
}

function scoreQA(text: string): ScoreStep {
  const weight = 3;
  let credit: ScoreCredit = 0;
  let notes = '';

  // Question patterns
  const questionMarkers = text.match(/\?/g) || [];
  const questionCount = questionMarkers.length;
  
  // Objection handling keywords
  const objectionKeywords = ['concern', 'worry', 'hesitant', 'question', 'doubt', 'understand'];
  const objectionHandling = objectionKeywords.filter(keyword => text.includes(keyword)).length;

  if (questionCount >= 5 && objectionHandling >= 2) {
    credit = 1;
    notes = `Excellent Q&A: ${questionCount} questions, ${objectionHandling} objection indicators`;
  } else if (questionCount >= 3 || objectionHandling >= 1) {
    credit = 0.5;
    notes = `Moderate Q&A: ${questionCount} questions, ${objectionHandling} objection indicators`;
  } else {
    credit = 0;
    notes = `Poor Q&A: ${questionCount} questions, ${objectionHandling} objection indicators`;
  }

  return {
    weight,
    credit,
    color: getColor(credit),
    notes,
  };
}

function scoreNextSteps(text: string): ScoreStep {
  const weight = 3;
  let credit: ScoreCredit = 0;
  let notes = '';

  // Next steps keywords
  const nextStepsKeywords = [
    'next step', 'follow up', 'move forward', 'proceed', 'action',
    'proposal', 'contract', 'agreement', 'trial', 'pilot'
  ];
  
  const nextStepsCount = nextStepsKeywords.filter(phrase => text.includes(phrase)).length;
  
  // Clear action items
  const actionKeywords = ['will', 'going to', 'plan to', 'should', 'need to'];
  const actionItems = actionKeywords.filter(phrase => text.includes(phrase)).length;

  if (nextStepsCount >= 2 && actionItems >= 2) {
    credit = 1;
    notes = `Clear next steps: ${nextStepsCount} next step indicators, ${actionItems} action items`;
  } else if (nextStepsCount >= 1 || actionItems >= 1) {
    credit = 0.5;
    notes = `Some next steps: ${nextStepsCount} next step indicators, ${actionItems} action items`;
  } else {
    credit = 0;
    notes = `No clear next steps: ${nextStepsCount} next step indicators, ${actionItems} action items`;
  }

  return {
    weight,
    credit,
    color: getColor(credit),
    notes,
  };
}

function scoreCloseOrSchedule(text: string): ScoreStep {
  const weight = 3;
  let credit: ScoreCredit = 0;
  let notes = '';

  // Closing keywords
  const closeKeywords = ['close', 'sign', 'agreement', 'deal', 'yes', 'approve'];
  const closeAttempts = closeKeywords.filter(keyword => text.includes(keyword)).length;
  
  // Scheduling keywords and patterns
  const scheduleKeywords = ['schedule', 'meeting', 'call', 'appointment'];
  const scheduleCount = scheduleKeywords.filter(keyword => text.includes(keyword)).length;
  
  // Date/time patterns
  const dateTimePatterns = [
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    /\b\d{1,2}:\d{2}\b/, // time format
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/,
    /\b\d{1,2}\/\d{1,2}\b/, // date format
    /\btomorrow\b/, /\bnext week\b/
  ];
  
  const dateTimeFound = dateTimePatterns.some(pattern => pattern.test(text));

  if ((closeAttempts >= 1) || (scheduleCount >= 1 && dateTimeFound)) {
    credit = 1;
    notes = `Strong close: ${closeAttempts} close attempts, scheduled: ${dateTimeFound}`;
  } else if (scheduleCount >= 1) {
    credit = 0.5;
    notes = `Partial close: ${closeAttempts} close attempts, ${scheduleCount} schedule mentions`;
  } else {
    credit = 0;
    notes = `No close: ${closeAttempts} close attempts, ${scheduleCount} schedule mentions`;
  }

  return {
    weight,
    credit,
    color: getColor(credit),
    notes,
  };
}

// Helper function to get color from credit (used in individual scoring functions)
function getColor(credit: ScoreCredit): ScoreColor {
  if (credit === 1) return 'green';
  if (credit === 0.5) return 'yellow';
  return 'red';
}