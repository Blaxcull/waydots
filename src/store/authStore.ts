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

        if (session?.provider_token && typeof window !== 'undefined') {
          localStorage.setItem('google_provider_token', session.provider_token)
        }
        if (session?.user?.email && typeof window !== 'undefined') {
          localStorage.setItem('user_email', session.user.email)
        }

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
        if (session?.provider_token && typeof window !== 'undefined') {
          localStorage.setItem('google_provider_token', session.provider_token)
        }
        if (session?.user?.email && typeof window !== 'undefined') {
          localStorage.setItem('user_email', session.user.email)
        }
        if (event === 'SIGNED_OUT' && typeof window !== 'undefined') {
          localStorage.removeItem('google_provider_token')
          localStorage.removeItem('user_email')
        }

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
      if (typeof window !== 'undefined') {
        localStorage.removeItem('google_provider_token')
        localStorage.removeItem('user_email')
      }
      await supabase.auth.signOut()
      set({
        session: null,
        user: null,
        isAuthenticated: false
      })
    }
  }
})
