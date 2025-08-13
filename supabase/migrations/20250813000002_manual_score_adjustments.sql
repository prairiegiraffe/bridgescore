-- Add manual score adjustment tracking fields to calls table
DO $$
BEGIN
  -- Add manually_adjusted boolean column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calls' AND column_name = 'manually_adjusted'
  ) THEN
    ALTER TABLE calls ADD COLUMN manually_adjusted BOOLEAN DEFAULT FALSE;
  END IF;

  -- Add manually_adjusted_by column  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calls' AND column_name = 'manually_adjusted_by'
  ) THEN
    ALTER TABLE calls ADD COLUMN manually_adjusted_by UUID REFERENCES auth.users(id);
  END IF;

  -- Add manually_adjusted_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calls' AND column_name = 'manually_adjusted_at'
  ) THEN
    ALTER TABLE calls ADD COLUMN manually_adjusted_at TIMESTAMPTZ;
  END IF;

  -- Add flagged_for_review boolean column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calls' AND column_name = 'flagged_for_review'
  ) THEN
    ALTER TABLE calls ADD COLUMN flagged_for_review BOOLEAN DEFAULT FALSE;
  END IF;

  -- Add flagged_by column  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calls' AND column_name = 'flagged_by'
  ) THEN
    ALTER TABLE calls ADD COLUMN flagged_by UUID REFERENCES auth.users(id);
  END IF;

  -- Add flagged_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calls' AND column_name = 'flagged_at'
  ) THEN
    ALTER TABLE calls ADD COLUMN flagged_at TIMESTAMPTZ;
  END IF;

  -- Add flag_reason column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calls' AND column_name = 'flag_reason'
  ) THEN
    ALTER TABLE calls ADD COLUMN flag_reason TEXT;
  END IF;
END $$;

-- Create index for finding manually adjusted calls
CREATE INDEX IF NOT EXISTS idx_calls_manually_adjusted ON calls(manually_adjusted) WHERE manually_adjusted = true;

-- Create index for finding calls adjusted by specific user
CREATE INDEX IF NOT EXISTS idx_calls_manually_adjusted_by ON calls(manually_adjusted_by) WHERE manually_adjusted_by IS NOT NULL;

-- Create index for finding flagged calls
CREATE INDEX IF NOT EXISTS idx_calls_flagged_for_review ON calls(flagged_for_review) WHERE flagged_for_review = true;

-- Create index for finding calls flagged by specific user
CREATE INDEX IF NOT EXISTS idx_calls_flagged_by ON calls(flagged_by) WHERE flagged_by IS NOT NULL;