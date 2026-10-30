import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cache the session promise to deduplicate concurrent calls
let currentSessionPromise: Promise<{ data: { session: any }, error: any }> | null = null

/**
 * A deduped version of supabase.auth.getSession()
 */
export const getSafeSession = async () => {
  if (currentSessionPromise) {
    return currentSessionPromise
  }

  currentSessionPromise = (async () => {
    try {
      return await supabase.auth.getSession()
    } finally {
      // Keep the promise for a short duration even after resolving
      // to dedupe very close subsequent calls.
      setTimeout(() => {
        currentSessionPromise = null
      }, 5000)
    }
  })()
  
  return currentSessionPromise
}

// Cache the user promise to deduplicate concurrent calls
let currentUserPromise: Promise<{ data: { user: any }, error: any }> | null = null

/**
 * A deduped version of supabase.auth.getUser() to prevent lock contention
 * and redundant network requests when multiple components or stores
 * need the user session simultaneously.
 */
export const getSafeUser = async () => {
  if (currentUserPromise) {
    return currentUserPromise
  }

  currentUserPromise = supabase.auth.getUser()
  
  try {
    const result = await currentUserPromise
    return result
  } finally {
    // Clear the promise after a short delay so subsequent calls (e.g. after a few seconds)
    // will still trigger a fresh check if needed, but rapid-fire calls are deduped.
    setTimeout(() => {
      currentUserPromise = null
    }, 2000)
  }
}
