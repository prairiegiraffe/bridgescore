-- Backfill script: Create personal orgs for existing users and link their calls

DO $$
DECLARE
    user_record RECORD;
    org_id UUID;
BEGIN
    -- For each user who has calls but no org membership
    FOR user_record IN 
        SELECT DISTINCT user_id 
        FROM calls 
        WHERE user_id IS NOT NULL 
        AND user_id NOT IN (SELECT user_id FROM memberships)
    LOOP
        -- Create a personal org for this user
        INSERT INTO organizations (name, is_demo) 
        VALUES (
            'Personal Workspace', 
            false
        ) 
        RETURNING id INTO org_id;
        
        -- Add user as owner of their personal org
        INSERT INTO memberships (org_id, user_id, role)
        VALUES (org_id, user_record.user_id, 'owner');
        
        -- Update all their existing calls to belong to this org
        UPDATE calls 
        SET org_id = org_id 
        WHERE user_id = user_record.user_id 
        AND org_id IS NULL;
        
        RAISE NOTICE 'Created personal org % for user %', org_id, user_record.user_id;
    END LOOP;
END $$;