/**
 * Supabase client singleton for client-side use
 * Used for Realtime subscriptions and storage operations
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

/**
 * Get the Supabase client singleton for client-side operations
 * Lazily initializes the client on first call
 */
export function getSupabaseClient(): SupabaseClient {
    if (supabaseClient) {
        return supabaseClient;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
            'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required'
        );
    }

    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        realtime: {
            params: {
                eventsPerSecond: 10,
            },
        },
    });

    return supabaseClient;
}

/**
 * Set the auth token for the Supabase realtime connection
 * Should be called after user logs in or token refreshes
 */
export async function setRealtimeAuth(accessToken: string): Promise<void> {
    const client = getSupabaseClient();
    await client.realtime.setAuth(accessToken);
}
