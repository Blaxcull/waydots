import { useCallback, useEffect, useState } from 'react'
import { supabase, getSafeSession } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

export type SubscriptionPlan = 'free' | 'pro'
export type SubscriptionStatus = 'inactive' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'

interface ProfileRow {
  plan: SubscriptionPlan
  subscription_status: SubscriptionStatus
}

interface SubscriptionRow {
  plan: SubscriptionPlan
  status: SubscriptionStatus
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  canceled_at: string | null
}

export interface SubscriptionState {
  plan: SubscriptionPlan
  status: SubscriptionStatus
  isPro: boolean
  isLoading: boolean
  error: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  stripePriceId: string | null
  refresh: () => Promise<void>
}

type BaseSubscriptionState = Pick<
  SubscriptionState,
  | 'plan'
  | 'status'
  | 'currentPeriodStart'
  | 'currentPeriodEnd'
  | 'cancelAtPeriodEnd'
  | 'stripeCustomerId'
  | 'stripeSubscriptionId'
  | 'stripePriceId'
>

const defaultState: BaseSubscriptionState = {
  plan: 'free',
  status: 'inactive',
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  stripePriceId: null,
}

const SUBSCRIPTION_CACHE_KEY = 'subscription-state-cache'

const readCachedState = () => {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(SUBSCRIPTION_CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as BaseSubscriptionState
  } catch {
    return null
  }
}

const writeCachedState = (state: BaseSubscriptionState) => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(state))
  } catch {
    // Ignore cache write failures.
  }
}

const clearCachedState = () => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(SUBSCRIPTION_CACHE_KEY)
  } catch {
    // Ignore cache clear failures.
  }
}

export function useSubscription(isAuthenticated: boolean): SubscriptionState {
  const { user } = useAuthStore()
  const cachedState = isAuthenticated ? readCachedState() : null
  
  const [state, setState] = useState<Omit<SubscriptionState, 'isPro' | 'refresh'>>({
    ...(cachedState ?? defaultState),
    isLoading: isAuthenticated,
    error: null,
  })

  const refresh = useCallback(async () => {
    const { data: { session } } = await getSafeSession()
    const user = session?.user

    if (!isAuthenticated || !user) {
      clearCachedState()
      setState({
        ...defaultState,
        isLoading: false,
        error: null,
      })
      return
    }

    setState((current) => ({
      ...current,
      isLoading: true,
      error: null,
    }))

    const [profileResult, subscriptionResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('plan, subscription_status')
        .eq('user_id', user.id)
        .maybeSingle<ProfileRow>(),
      supabase
        .from('subscriptions')
        .select('plan, status, stripe_customer_id, stripe_subscription_id, stripe_price_id, current_period_start, current_period_end, cancel_at_period_end, canceled_at')
        .eq('user_id', user.id)
        .maybeSingle<SubscriptionRow>(),
    ])

    const error = profileResult.error?.message ?? subscriptionResult.error?.message ?? null
    const profile = profileResult.data
    const subscription = subscriptionResult.data

    const nextState = {
      plan: profile?.plan ?? subscription?.plan ?? 'free',
      status: profile?.subscription_status ?? subscription?.status ?? 'inactive',
      currentPeriodStart: subscription?.current_period_start ?? null,
      currentPeriodEnd: subscription?.current_period_end ?? null,
      cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
      stripeCustomerId: subscription?.stripe_customer_id ?? null,
      stripeSubscriptionId: subscription?.stripe_subscription_id ?? null,
      stripePriceId: subscription?.stripe_price_id ?? null,
      isLoading: false,
      error,
    }

    writeCachedState(nextState)
    setState(nextState)
  }, [isAuthenticated, user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    ...state,
    isPro: state.plan === 'pro' && (state.status === 'active' || state.status === 'trialing'),
    refresh,
  }
}
