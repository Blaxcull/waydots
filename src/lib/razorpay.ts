import { supabase } from '@/lib/supabase'

const RAZORPAY_CHECKOUT_URL = 'https://checkout.razorpay.com/v1/checkout.js'

export interface RazorpayOrderResponse {
  keyId: string
  subscriptionId: string
  shortUrl?: string
  displayAmount: string
  name: string
  description: string
  prefill: {
    name?: string
    contact?: string
    email?: string
  }
  coupon?: {
    code: string
    appliesTo: 'first_cycle'
  } | null
}

interface RazorpayVerifyPayload {
  razorpay_subscription_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

interface RazorpayOptions {
  key: string
  subscription_id: string
  name: string
  description?: string
  method?: 'upi' | 'card' | 'netbanking' | 'wallet' | 'emi'
  prefill?: {
    name?: string
    contact?: string
    email?: string
  }
  theme?: {
    color?: string
  }
  handler: (response: RazorpayVerifyPayload) => void | Promise<void>
  modal?: {
    ondismiss?: () => void
  }
}

interface RazorpayInstance {
  open: () => void
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance
  }
}

let checkoutLoader: Promise<void> | null = null

async function waitForRazorpayReady() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (window.Razorpay) return
    await new Promise((resolve) => window.setTimeout(resolve, 50))
  }

  throw new Error('Razorpay checkout is not available.')
}

export async function loadRazorpayCheckout(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Razorpay checkout is only available in the browser.')
  }

  if (window.Razorpay) return
  if (checkoutLoader) return checkoutLoader

  checkoutLoader = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_CHECKOUT_URL}"]`)
    if (existingScript) {
      if (window.Razorpay) {
        resolve()
        return
      }

      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Razorpay checkout.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = RAZORPAY_CHECKOUT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout.'))
    document.body.appendChild(script)
  })

  await checkoutLoader
  await waitForRazorpayReady()
}

export async function createProOrder(couponCode?: string, contact?: string, currency: string = 'INR') {
  const { data, error } = await supabase.functions.invoke<RazorpayOrderResponse>('create-razorpay-order', {
    body: {
      plan: 'pro',
      couponCode,
      contact,
      currency,
      locale: typeof navigator === 'undefined' ? 'en-US' : (navigator.language || 'en-US'),
      timeZone:
        typeof Intl === 'undefined'
          ? 'UTC'
          : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      timeZoneOffsetMinutes:
        typeof Date === 'undefined'
          ? 0
          : new Date().getTimezoneOffset(),
    },
  })

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Unable to create a Razorpay order.')

  return data
}

export async function verifyProPayment(payload: RazorpayVerifyPayload) {
  const { data, error } = await supabase.functions.invoke<{ success: boolean; message: string }>('verify-razorpay-payment', {
    body: payload,
  })

  if (error) throw new Error(error.message)
  if (!data?.success) throw new Error(data?.message ?? 'Payment verification failed.')

  return data
}

export function openRazorpayCheckout(
  order: RazorpayOrderResponse,
  onSuccess: (payload: RazorpayVerifyPayload) => void | Promise<void>,
  onDismiss: () => void,
) {
  if (!window.Razorpay) {
    throw new Error('Razorpay checkout is not available.')
  }

  const checkout = new window.Razorpay({
    key: order.keyId,
    subscription_id: order.subscriptionId,
    name: order.name,
    description: order.description,
    prefill: order.prefill,
    handler: onSuccess,
    modal: {
      ondismiss: onDismiss,
    },
    theme: {
      color: '#111111',
    },
  })

  checkout.open()
}
