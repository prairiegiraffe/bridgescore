// Minimal test function with no dependencies
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  console.log('=== SIMPLE TEST FUNCTION CALLED ===');
  console.log(`Method: ${req.method}`);
  console.log(`Content-Type: ${req.headers.get('content-type')}`);
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Test multipart detection
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      console.log('Multipart form data detected');
      
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Simple test function working',
          contentType: contentType
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Simple test function working - not multipart',
        contentType: contentType
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Simple test error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})