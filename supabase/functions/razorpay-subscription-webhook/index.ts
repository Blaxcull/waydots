import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type AppSubscriptionStatus = 'inactive' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'

interface RazorpayWebhookPayload {
  event?: string
  payload?: {
    subscription?: {
      entity?: {
        id?: string
        plan_id?: string
        status?: string
        current_start?: number | null
        current_end?: number | null
        ended_at?: number | null
        offer_id?: string | null
        notes?: Record<string, string>
      }
    }
    payment?: {
      entity?: {
        id?: string
        order_id?: string | null
        amount?: number | null
        currency?: string | null
      }
    }
  }
}

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const webhookSecret = getRequiredEnv('RAZORPAY_WEBHOOK_SECRET')
    const receivedSignature = request.headers.get('x-razorpay-signature')

    if (!receivedSignature) {
      return Response.json({ ok: false, message: 'Missing webhook signature.' }, { status: 400, headers: corsHeaders })
    }

    const rawBody = await request.text()
    const expectedSignature = await sign(rawBody, webhookSecret)

    if (expectedSignature !== receivedSignature) {
      return Response.json({ ok: false, message: 'Invalid webhook signature.' }, { status: 400, headers: corsHeaders })
    }

    const body = JSON.parse(rawBody) as RazorpayWebhookPayload
    const subscription = body.payload?.subscription?.entity
    const payment = body.payload?.payment?.entity
    const userId = subscription?.notes?.user_id
    const subscriptionId = subscription?.id

    if (!userId || !subscriptionId) {
      return Response.json({ ok: true, skipped: true }, { headers: corsHeaders })
    }

    const status = mapRazorpayStatus(subscription.status)
    const admin = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey())

    const subscriptionPayload = {
      plan: status === 'inactive' ? 'free' : 'pro',
      status,
      payment_provider: 'razorpay',
      provider_subscription_id: subscriptionId,
      provider_plan_id: subscription.plan_id ?? null,
      provider_offer_id: subscription.offer_id ?? null,
      provider_order_id: payment?.order_id ?? null,
      provider_payment_id: payment?.id ?? null,
      amount: payment?.amount ?? null,
      currency: payment?.currency ?? null,
      current_period_start: toIsoDate(subscription.current_start),
      current_period_end: toIsoDate(subscription.current_end),
      cancel_at_period_end: status === 'canceled',
      canceled_at: status === 'canceled' ? toIsoDate(subscription.ended_at) ?? new Date().toISOString() : null,
    }

    const [profileUpdate, subscriptionUpdate] = await Promise.all([
      admin
        .from('profiles')
        .update({
          plan: status === 'inactive' || status === 'canceled' ? 'free' : 'pro',
          subscription_status: status,
        })
        .eq('user_id', userId),
      admin
        .from('subscriptions')
        .update(subscriptionPayload)
        .eq('user_id', userId),
    ])

    if (profileUpdate.error || subscriptionUpdate.error) {
      throw new Error(profileUpdate.error?.message ?? subscriptionUpdate.error?.message ?? 'Failed to sync subscription webhook.')
    }

    return Response.json({ ok: true }, { headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected webhook error.'
    return Response.json({ ok: false, message }, { status: 500, headers: corsHeaders })
  }
})
