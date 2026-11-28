import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey, { global: { fetch: async (input, init = {}) => {
  const controller = new AbortController();
  const original = init.signal;
  const abort = () => controller.abort();
  if (original?.aborted) abort();
  else original?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 60000);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); original?.removeEventListener('abort', abort); }
} } });