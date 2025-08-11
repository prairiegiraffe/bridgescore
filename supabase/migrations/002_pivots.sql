-- Create pivots table for storing scoring prompts/criteria
CREATE TABLE pivots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_key TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Create index for efficient lookups by step_key
CREATE INDEX idx_pivots_step_key ON pivots (step_key);

-- Enable RLS
ALTER TABLE pivots ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Make pivots globally readable for now
-- (will be updated for org-based access later)
CREATE POLICY "Pivots are globally readable" ON pivots
  FOR SELECT USING (true);

-- RLS Policy: Only authenticated users can insert/update pivots
-- (for future admin functionality)
CREATE POLICY "Authenticated users can manage pivots" ON pivots
  FOR ALL USING (auth.role() = 'authenticated');