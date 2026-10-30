import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code } = await req.json()
    if (!code) {
      return new Response(JSON.stringify({ valid: false, error: 'Missing code' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const normalizedCode = code.trim().toUpperCase()

    // Fetch coupon from database
    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', normalizedCode)
      .eq('is_active', true)
      .maybeSingle<CouponRow>()

    if (error) throw error

    if (!coupon) {
      return new Response(JSON.stringify({ valid: false, message: 'Invalid coupon code.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check usage limits
    if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
      return new Response(JSON.stringify({ valid: false, message: 'Coupon usage limit reached.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        valid: true,
        code: coupon.code,
        amount: coupon.amount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error(`[validate-coupon] Error: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
