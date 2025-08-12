import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Get user client for auth check
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    
    if (!token) {
      throw new Error('No authorization token')
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    // Verify the user is a SuperAdmin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) throw new Error('Unauthorized')

    const { data: membership } = await supabaseClient
      .from('memberships')
      .select('is_superadmin')
      .eq('user_id', user.id)
      .eq('is_superadmin', true)
      .single()

    if (!membership) {
      throw new Error('Only SuperAdmins can invite users')
    }

    // Parse request body
    const body = await req.json()
    const { email, full_name, org_id, role, is_superadmin } = body

    if (!email) {
      throw new Error('Email is required')
    }

    // Generate a secure random password for initial setup
    const tempPassword = crypto.randomUUID()

    // Create the user with admin client
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: false, // Require email confirmation
      user_metadata: {
        full_name: full_name || ''
      }
    })

    if (createError) throw createError
    if (!newUser.user) throw new Error('Failed to create user')

    // Create membership if organization is specified
    if (org_id) {
      const { error: membershipError } = await supabaseAdmin
        .from('memberships')
        .insert({
          user_id: newUser.user.id,
          org_id,
          role: role || 'member',
          is_superadmin: is_superadmin || false
        })

      if (membershipError) {
        console.error('Failed to create membership:', membershipError)
        // Don't fail the whole operation if membership creation fails
      }
    }

    // Send invitation email with magic link
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: full_name || '',
        invited_by: user.email,
        org_id: org_id || null
      }
    })

    if (inviteError) {
      console.error('Failed to send invitation email:', inviteError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invitation sent to ${email}`,
        user_id: newUser.user.id
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('Error in invite-user function:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})