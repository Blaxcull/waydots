import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface VerifyRequestBody {
  razorpay_subscription_id?: string
  razorpay_payment_id?: string
  razorpay_signature?: string
}

type AppSubscriptionStatus = 'inactive' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function getSupabaseUrl() {
  return Deno.env.get('URL') ?? Deno.env.get('APP_URL') ?? getRequiredEnv('SUPABASE_URL')
}

function getSupabaseServiceRoleKey() {
  return Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('APP_SERVICE_ROLE_KEY') ?? getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function toIsoDate(value: number | null | undefined) {
  if (!value) return null
  return new Date(value * 1000).toISOString()
}

function mapRazorpayStatus(status?: string): AppSubscriptionStatus {
  switch (status) {
    case 'authenticated':
      return 'trialing'
    case 'active':
    case 'completed':
      return 'active'
    case 'pending':
      return 'past_due'
    case 'halted':
      return 'unpaid'
    case 'cancelled':
    case 'expired':
      return 'canceled'
    default:
      return 'inactive'
  }
}

async function sign(content: string, secret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(content))
  return toHex(signature)
}

async function getAuthenticatedUser(request: Request) {
  const supabaseUrl = getSupabaseUrl()
  const serviceRoleKey = getSupabaseServiceRoleKey()
  const authHeader = request.headers.get('Authorization')

  if (!authHeader) {
    return { user: null, error: 'Missing authorization header.' }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  return {
    user,
    error: error?.message ?? null,
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = getSupabaseUrl()
    const serviceRoleKey = getSupabaseServiceRoleKey()
    const razorpaySecret = getRequiredEnv('RAZORPAY_KEY_SECRET')
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID') ?? Deno.env.get('RAZORPAY_LIVE_API')

    if (!razorpayKeyId) {
      throw new Error('Razorpay key ID is not configured.')
    }

    const { user, error: userError } = await getAuthenticatedUser(request)
    if (userError || !user) {
      return Response.json(
        { success: false, message: userError ?? 'Unauthorized' },
        { status: 401, headers: corsHeaders },
      )
    }

    const body = (await request.json()) as VerifyRequestBody
    const subscriptionId = body.razorpay_subscription_id
    const paymentId = body.razorpay_payment_id
    const signature = body.razorpay_signature

    if (!subscriptionId || !paymentId || !signature) {
      return Response.json(
        { success: false, message: 'Missing required Razorpay verification fields.' },
        { status: 400, headers: corsHeaders },
      )
    }

    const expectedSignature = await sign(`${paymentId}|${subscriptionId}`, razorpaySecret)
    if (expectedSignature !== signature) {
      return Response.json(
        { success: false, message: 'Invalid Razorpay payment signature.' },
        { status: 400, headers: corsHeaders },
      )
    }

    const authToken = btoa(`${razorpayKeyId}:${razorpaySecret}`)
    const [paymentResponse, subscriptionResponse] = await Promise.all([
      fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Basic ${authToken}`,
        },
      }),
      fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}`, {
        headers: {
          Authorization: `Basic ${authToken}`,
        },
      }),
    ])

    const payment = await paymentResponse.json()
    const subscription = await subscriptionResponse.json()

    if (!paymentResponse.ok) {
      throw new Error(payment?.error?.description ?? 'Unable to fetch Razorpay payment details.')
    }

    if (!subscriptionResponse.ok) {
      throw new Error(subscription?.error?.description ?? 'Unable to fetch Razorpay subscription details.')
    }

    if (payment.status !== 'authorized' && payment.status !== 'captured') {
      throw new Error(`Razorpay payment is not successful yet. Current status: ${payment.status ?? 'unknown'}.`)
    }

    if (subscription.id !== subscriptionId) {
      throw new Error('Razorpay returned a mismatched subscription.')
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const mappedStatus = mapRazorpayStatus(subscription.status)

    const subscriptionPayload = {
      plan: 'pro',
      status: mappedStatus,
      payment_provider: 'razorpay',
      provider_subscription_id: subscriptionId,
      provider_plan_id: subscription.plan_id ?? null,
      provider_offer_id: subscription.offer_id ?? null,
      provider_order_id: payment.order_id ?? null,
      provider_payment_id: paymentId,
      provider_signature: signature,
      receipt: subscription.id,
      amount: payment.amount ?? null,
      currency: payment.currency ?? null,
      current_period_start: toIsoDate(subscription.current_start),
      current_period_end: toIsoDate(subscription.current_end),
      cancel_at_period_end: false,
      canceled_at: null,
    }

    // Activate Pro
    const [profileUpdate, subscriptionUpdate] = await Promise.all([
      admin
        .from('profiles')
        .update({
          plan: 'pro',
          subscription_status: mappedStatus === 'inactive' ? 'active' : mappedStatus,
        })
        .eq('user_id', user.id),
      admin
        .from('subscriptions')
        .update(subscriptionPayload)
        .eq('user_id', user.id),
    ])

    if (profileUpdate.error || subscriptionUpdate.error) {
      throw new Error(profileUpdate.error?.message ?? subscriptionUpdate.error?.message ?? 'Failed to activate Pro plan.')
    }

    // Increment coupon usage if an offer was used
    if (subscription.offer_id) {
       // SQL to increment safely: update coupons set used_count = used_count + 1 where offer_id = '...'
       await admin.rpc('increment_coupon_usage', { p_offer_id: subscription.offer_id })
    }

    return Response.json(
      { success: true, message: 'Subscription verified and Pro activated.' },
      { headers: corsHeaders },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error verifying Razorpay subscription.'

    return Response.json(
      { success: false, message },
      { status: 500, headers: corsHeaders },
    )
  }
})
