// scripts/supabaseClient.js

// Supabase v1 library is loaded in submit.html
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@1.35.7"></script>

const SUPABASE_URL = 'https://qjlejocklymxzbfaaizq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Zc4svfTNZ7VW3bfbNbAPOQ_HUGLEEiq';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Please set SUPABASE_URL and SUPABASE_ANON_KEY in supabaseClient.js');
}

// IMPORTANT: use a different name: supabaseClient
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// (optional, but nice for debugging)
console.log('Supabase client created:', supabaseClient);
