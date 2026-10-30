import { create } from 'zustand'
import { supabase, getSafeSession } from '@/lib/supabase'
import type { Session, User } from '@supabase/supabase-js'

interface AuthState {
  session: Session | null
  user: User | null
  isAuthenticated: boolean
  isAuthLoading: boolean
  error: string | null
  initialize: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => {
  let subscription: { unsubscribe: () => void } | null = null

  return {
    session: null,
    user: null,
    isAuthenticated: false,
    isAuthLoading: true,
    error: null,

    initialize: async () => {
      // Clean up existing subscription if initialize is called again
      if (subscription) {
        subscription.unsubscribe()
      }

      // Initial session check
      try {
        const { data: { session }, error } = await getSafeSession()
        if (error) throw error

        set({
          session,
          user: session?.user ?? null,
          isAuthenticated: !!session,
          isAuthLoading: false
        })
      } catch (err) {
        set({ 
          error: err instanceof Error ? err.message : 'Failed to get session',
          isAuthLoading: false 
        })
      }

      // Set up the single global listener
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        set({
          session,
          user: session?.user ?? null,
          isAuthenticated: !!session,
          isAuthLoading: false
        })
      })
      
      subscription = data.subscription
    },

    signOut: async () => {
      await supabase.auth.signOut()
      set({
        session: null,
        user: null,
        isAuthenticated: false
      })
    }
  }
})
