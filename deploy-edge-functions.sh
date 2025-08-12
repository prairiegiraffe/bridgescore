#!/bin/bash

# Deploy Supabase Edge Functions
# This script deploys the invite-user function to your Supabase project

echo "Deploying Supabase Edge Functions..."

# Make sure you're logged in to Supabase CLI
echo "Checking Supabase CLI login status..."
supabase projects list > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Please login to Supabase CLI first:"
    echo "supabase login"
    exit 1
fi

# Link to your project (you may need to update the project ID)
echo "Linking to Supabase project..."
supabase link --project-ref gldjvaeijvtplnnfrgox

# Deploy the invite-user function
echo "Deploying invite-user function..."
supabase functions deploy invite-user

echo "✅ Edge function deployed successfully!"
echo ""
echo "The invitation system is now ready to use."
echo "Users will receive email invitations to join the platform."