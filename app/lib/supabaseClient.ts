import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://kkkswdnelmuwxzshowgy.supabase.co";
const supabaseAnonKey = "sb_publishable_MUaHd8aC0bBQ3YKAmhTM3Q_Ld6S6bUA";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);