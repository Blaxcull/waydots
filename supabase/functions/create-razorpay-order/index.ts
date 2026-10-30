import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUBSCRIPTION_TOTAL_COUNT = 120

interface CreateSubscriptionRequestBody {
  couponCode?: string
  contact?: string
  currency?: string
  locale?: string
  timeZone?: string
  timeZoneOffsetMinutes?: number
}

interface CouponRow {
  id: string
  code: string
  offer_id: string
  amount: number
  max_uses: number
  used_count: number
  is_active: boolean
}

interface ProfileRow {
  email: string | null
}

const INR_PLAN_AMOUNT = 500
const USD_PLAN_AMOUNT = 5
const DEFAULT_CURRENCY = 'INR'

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function getSupabaseUrl() {
  return Deno.env.get('SUPABASE_URL') ?? Deno.env.get('URL') ?? Deno.env.get('APP_URL')
}

function getSupabaseServiceRoleKey() {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('APP_SERVICE_ROLE_KEY')
}

function formatDisplayAmount(amount: number, currency: string) {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

async function getAuthenticatedUser(request: Request) {
  const supabaseUrl = getSupabaseUrl()
  const serviceRoleKey = getSupabaseServiceRoleKey()
  const authHeader = request.headers.get('Authorization')

  if (!authHeader) {
    return { user: null, error: 'Missing authorization header.' }
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return { user: null, error: 'Supabase configuration missing.' }
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
    const body = (await request.json().catch(() => ({}))) as CreateSubscriptionRequestBody
    const couponCode = body.couponCode?.trim().toUpperCase()
    const contact = body.contact?.trim()
    const currency = body.currency?.toUpperCase() || DEFAULT_CURRENCY
    const locale = body.locale
    const timeZone = body.timeZone
    const timeZoneOffsetMinutes = body.timeZoneOffsetMinutes
    
    const keyId = Deno.env.get('RAZORPAY_KEY_ID')
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')
    
    let planId: string | null = null
    let planBaseAmount = INR_PLAN_AMOUNT

    if (currency === 'USD') {
      planId = Deno.env.get('RAZORPAY_PRO_MONTHLY_PLAN_USD') || Deno.env.get('RAZORPAY_PRO_MONTHLY_PLAN_ID') || null
      planBaseAmount = USD_PLAN_AMOUNT
    } else {
      planId = Deno.env.get('RAZORPAY_PRO_MONTHLY_PLAN_INR') || Deno.env.get('RAZORPAY_PRO_MONTHLY_PLAN_ID') || null
      planBaseAmount = INR_PLAN_AMOUNT
    }

    if (!keyId || !keySecret) {
      throw new Error('Razorpay keys (RAZORPAY_KEY_ID/SECRET) are not configured in Supabase.')
    }

    const { user, error: userError } = await getAuthenticatedUser(request)
    if (userError || !user) {
      return Response.json(
        { message: userError ?? 'Unauthorized' },
        { status: 401, headers: corsHeaders },
      )
    }

    const supabaseUrl = getSupabaseUrl()
    const serviceKey = getSupabaseServiceRoleKey()
    
    if (!supabaseUrl || !serviceKey) {
       throw new Error('Internal config error: SUPABASE_URL or SERVICE_ROLE_KEY missing.')
    }

    const admin = createClient(supabaseUrl, serviceKey)
    
    // Fetch profile
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('email')
      .eq('user_id', user.id)
      .maybeSingle<ProfileRow>()

    if (profileError) {
      console.error('[create-razorpay-order] Profile fetch error:', profileError)
    }

    // Fetch and validate coupon from database
    let coupon: CouponRow | null = null
    if (couponCode) {
      const { data, error: couponError } = await admin
        .from('coupons')
        .select('*')
        .eq('code', couponCode)
        .eq('is_active', true)
        .maybeSingle<CouponRow>()

      if (couponError) {
        console.error('[create-razorpay-order] Coupon query error:', couponError)
        throw new Error(`Database error checking coupon: ${couponError.message}`)
      }
      
      coupon = data

      if (!coupon) {
        return Response.json({ message: 'Invalid coupon code.' }, { status: 400, headers: corsHeaders })
      }

      if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
        return Response.json({ message: 'Coupon usage limit reached.' }, { status: 400, headers: corsHeaders })
      }
    }

    if (!planId) {
      return Response.json(
        { message: `${currency} subscription Plan ID is not configured.` },
        { status: 400, headers: corsHeaders },
      )
    }

    const authToken = btoa(`${keyId}:${keySecret}`)
    const requestBody = {
      plan_id: planId,
      total_count: SUBSCRIPTION_TOTAL_COUNT,
      quantity: 1,
      customer_notify: true,
      ...(coupon?.offer_id ? { offer_id: coupon.offer_id.trim() } : {}),
      notes: {
        user_id: user.id,
        plan: 'pro',
        coupon_code: couponCode ?? '',
        locale: locale ?? '',
        time_zone: timeZone ?? '',
        time_zone_offset_minutes: String(timeZoneOffsetMinutes ?? ''),
      },
    }

    console.log('[create-razorpay-order] Sending to Razorpay:', JSON.stringify(requestBody))

    const razorpayResponse = await fetch('https://api.razorpay.com/v1/subscriptions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    const subscription = await razorpayResponse.json()

    if (!razorpayResponse.ok) {
      console.error('[create-razorpay-order] Razorpay API error:', subscription)
      const description = subscription?.error?.description ?? 'Failed to create Razorpay subscription.'
      throw new Error(description)
    }

    const discountAmountRaw = coupon?.amount ?? 0
    // If currency is USD, treat the database amount as cents (e.g. 490 = 4.90 USD)
    const discountAmount = currency === 'USD' ? discountAmountRaw / 100 : discountAmountRaw
    
    const displayAmountValue = Math.max(0, planBaseAmount - discountAmount)

    return Response.json(
      {
        keyId,
        subscriptionId: subscription.id,
        shortUrl: subscription.short_url ?? undefined,
        displayAmount: formatDisplayAmount(displayAmountValue, currency),
        name: 'Waydots',
        description: couponCode
          ? `Waydots Pro monthly auto-pay. Discount applied.`
          : 'Waydots Pro monthly auto-pay.',
        prefill: {
          contact: contact || undefined,
          email: user.email ?? profile?.email ?? undefined,
        },
        coupon: couponCode
          ? {
              code: couponCode,
              appliesTo: 'first_cycle' as const,
            }
          : null,
      },
      { headers: corsHeaders },
    )
  } catch (error) {
    console.error(`[create-razorpay-order] Final catch error: ${error.message}`)
    const message = error instanceof Error ? error.message : 'Unexpected error.'
    return Response.json({ message }, { status: 500, headers: corsHeaders })
  }
})
