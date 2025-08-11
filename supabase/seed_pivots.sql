-- Seed data for pivots table with example prompts for each Bridge Selling step

INSERT INTO pivots (step_key, prompt) VALUES
  -- Pinpoint Pain prompts
  ('pinpoint_pain', 'Did the salesperson ask about current problems or challenges the prospect is facing?'),
  ('pinpoint_pain', 'Was the prospect encouraged to describe specific pain points in detail?'),
  ('pinpoint_pain', 'Did the salesperson probe into the impact or consequences of the problems?'),
  ('pinpoint_pain', 'Were follow-up questions asked to quantify the pain (cost, time, frustration)?'),
  ('pinpoint_pain', 'Did the salesperson validate and acknowledge the prospect''s pain points?'),
  ('pinpoint_pain', 'Was there discussion about how long these problems have existed?'),
  ('pinpoint_pain', 'Did the salesperson ask about previous attempts to solve these issues?'),
  
  -- Qualify prompts
  ('qualify', 'Was budget or investment capacity discussed during the call?'),
  ('qualify', 'Did the salesperson identify decision-makers and approval process?'),
  ('qualify', 'Was timeline or urgency for solving the problem established?'),
  ('qualify', 'Were competing priorities or alternatives explored?'),
  ('qualify', 'Did the salesperson ask about evaluation criteria or success metrics?'),
  ('qualify', 'Was the prospect''s current solution or vendor situation discussed?'),
  ('qualify', 'Did the conversation cover implementation requirements or constraints?'),
  
  -- Solution Success prompts
  ('solution_success', 'Did the salesperson present relevant features or capabilities?'),
  ('solution_success', 'Were specific benefits tied to the prospect''s stated pain points?'),
  ('solution_success', 'Did the salesperson provide case studies or examples from similar clients?'),
  ('solution_success', 'Was ROI or value proposition clearly articulated?'),
  ('solution_success', 'Did the presentation focus on outcomes rather than just features?'),
  ('solution_success', 'Were success metrics or measurable results discussed?'),
  ('solution_success', 'Did the salesperson demonstrate understanding of the prospect''s industry or use case?'),
  
  -- Q&A prompts
  ('qa', 'Did the salesperson encourage questions throughout the presentation?'),
  ('qa', 'Were objections or concerns addressed thoroughly and professionally?'),
  ('qa', 'Did the salesperson ask clarifying questions to better understand concerns?'),
  ('qa', 'Was there adequate time allocated for prospect questions?'),
  ('qa', 'Did the salesperson provide specific, relevant answers rather than generic responses?'),
  ('qa', 'Were technical or implementation questions handled appropriately?'),
  ('qa', 'Did the salesperson confirm understanding after answering questions?'),
  
  -- Next Steps prompts
  ('next_steps', 'Were clear next steps outlined at the end of the call?'),
  ('next_steps', 'Did the salesperson propose a specific follow-up timeline?'),
  ('next_steps', 'Were action items assigned to both parties?'),
  ('next_steps', 'Was there discussion of what information or resources would be provided?'),
  ('next_steps', 'Did the salesperson confirm the prospect''s commitment to next steps?'),
  ('next_steps', 'Were potential obstacles or requirements for moving forward addressed?'),
  ('next_steps', 'Was mutual interest and fit confirmed before proposing next steps?'),
  
  -- Close or Schedule prompts
  ('close_or_schedule', 'Did the salesperson attempt to advance the sales process?'),
  ('close_or_schedule', 'Was a specific follow-up meeting or call scheduled?'),
  ('close_or_schedule', 'Did the salesperson ask for commitment or agreement to move forward?'),
  ('close_or_schedule', 'Were calendar invites or concrete dates proposed?'),
  ('close_or_schedule', 'Did the salesperson summarize key points and confirm mutual interest?'),
  ('close_or_schedule', 'Was urgency or timeline reinforced during the close?'),
  ('close_or_schedule', 'Did the salesperson handle any final objections before closing?');