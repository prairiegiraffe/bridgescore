import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    
    // Handle transcription requests
    if (contentType.includes('multipart/form-data')) {
      console.log('Processing audio transcription request');
      
      const formData = await req.formData();
      const action = formData.get('action') as string;
      
      if (action === 'transcribe_audio') {
        const audioFile = formData.get('audio') as File;
        if (!audioFile) {
          throw new Error('No audio file provided');
        }
        
        console.log(`Transcribing file: ${audioFile.name}, size: ${audioFile.size} bytes`);
        
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
        if (!openaiApiKey) {
          throw new Error('OpenAI API key not configured');
        }
        
        // Call OpenAI Whisper API
        const whisperFormData = new FormData();
        whisperFormData.append('file', audioFile);
        whisperFormData.append('model', 'whisper-1');
        whisperFormData.append('response_format', 'text');
        whisperFormData.append('language', 'en');
        
        const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
          },
          body: whisperFormData
        });
        
        console.log(`Whisper API status: ${whisperResponse.status}`);
        
        if (!whisperResponse.ok) {
          const errorText = await whisperResponse.text();
          console.error(`Whisper API error: ${errorText}`);
          throw new Error(`Whisper API failed (${whisperResponse.status}): ${errorText}`);
        }
        
        const transcription = await whisperResponse.text();
        console.log(`Transcription successful: ${transcription.length} characters`);
        
        return new Response(
          JSON.stringify({
            transcription: transcription.trim(),
            fileName: audioFile.name,
            fileSize: audioFile.size,
            success: true
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          },
        );
      }
    }
    
    // Handle other requests (existing scoring logic would go here)
    throw new Error('Unsupported request type');
    
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})