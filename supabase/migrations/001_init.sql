-- BridgeScore Initial Schema
-- Creates users_meta and calls tables with RLS policies

-- Create users_meta table
CREATE TABLE users_meta (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create calls table
CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    transcript TEXT,
    status TEXT DEFAULT 'scored',
    score_total INTEGER,
    score_breakdown JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE users_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users_meta
-- Users can only see and manage their own metadata
CREATE POLICY "Users can view their own metadata" ON users_meta
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own metadata" ON users_meta
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own metadata" ON users_meta
    FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for calls
-- Users can only see and manage their own calls
CREATE POLICY "Users can view their own calls" ON calls
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own calls" ON calls
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own calls" ON calls
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own calls" ON calls
    FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_users_meta_user_id ON users_meta(user_id);
CREATE INDEX idx_calls_user_id ON calls(user_id);
CREATE INDEX idx_calls_created_at ON calls(created_at DESC);
CREATE INDEX idx_calls_status ON calls(status);