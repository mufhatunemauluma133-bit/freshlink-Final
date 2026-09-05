import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Unified Supabase client (used across modules)
const supabaseUrl = "https://vyxdmryekrlrmimsscyg.supabase.co";
const supabaseKey = "sb_publishable_igNpzYOazmufhwSzWX8fHQ_49OidlGS";

export const supabase = createClient(supabaseUrl, supabaseKey);
