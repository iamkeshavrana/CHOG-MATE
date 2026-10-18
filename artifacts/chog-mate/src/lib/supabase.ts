import { createClient } from "@supabase/supabase-js";
import { appConfig } from "@/lib/config";

export const supabase =
  appConfig.supabaseUrl && appConfig.supabaseAnonKey
    ? createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;
