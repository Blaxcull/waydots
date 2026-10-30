import { Link } from "react-router-dom";
import { useState, useMemo } from "react";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { createProOrder, loadRazorpayCheckout, openRazorpayCheckout, verifyProPayment, type RazorpayOrderResponse } from "@/lib/razorpay";
import { supabase } from "@/lib/supabase";

const SUBSCRIPTION_CACHE_KEY = "subscription-state-cache";

function getCheckoutCurrencyHint() {
  if (typeof navigator === "undefined") return "USD";

  const locale = (navigator.language || "en-US").toUpperCase();
  const timeZone =
    typeof Intl === "undefined" ? "UTC" : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const timeZoneOffsetMinutes = new Date().getTimezoneOffset();

  if (
    locale.endsWith("-IN") ||
    locale.endsWith("_IN") ||
    timeZone === "Asia/Kolkata" ||
    timeZone === "Asia/Calcutta" ||
    timeZoneOffsetMinutes === -330
  ) {
    return "INR";
  }

  return "USD";
}

export function CheckoutPage() {
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [couponError, setCouponError] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [isValidating, setIsValidating] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<RazorpayOrderResponse | null>(null);
  const [currencyHint] = useState(getCheckoutCurrencyHint());
  const isIndiaCheckout = currencyHint === "INR";
  
  const isDiscounted = discountAmount > 0;

  const normalizedDiscount = useMemo(() => {
    if (isIndiaCheckout) return discountAmount;
    return discountAmount / 100;
  }, [isIndiaCheckout, discountAmount]);

  const headlinePrice = useMemo(() => {
    if (isIndiaCheckout) {
      const price = Math.max(0, 500 - normalizedDiscount);
      return `₹${price} / month`;
    }
    const price = Math.max(0, 5 - normalizedDiscount);
    return `$${price.toFixed(2)} / month`;
  }, [isIndiaCheckout, normalizedDiscount]);

  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;

    setIsValidating(true);
    setCouponError("");
    try {
      const { data, error } = await supabase.functions.invoke("validate-coupon", {
        body: { code },
      });

      if (error) throw error;

      if (data.valid) {
        setAppliedCoupon(data.code);
        setDiscountAmount(data.amount || 0);
        setCouponError("");
      } else {
        setAppliedCoupon("");
        setDiscountAmount(0);
        setCouponError(data.message || "Invalid coupon code.");
      }
    } catch (err) {
      console.error("Coupon validation error:", err);
      setAppliedCoupon("");
      setDiscountAmount(0);
      setCouponError("Failed to validate coupon. Please try again.");
    } finally {
      setIsValidating(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon("");
    setCouponCode("");
    setDiscountAmount(0);
    setCouponError("");
  };

  const handlePayment = async () => {
    setIsPaying(true);

    try {
      const order = await createProOrder(appliedCoupon || undefined, undefined, currencyHint);
      setCheckoutOrder(order);

      await loadRazorpayCheckout();

      openRazorpayCheckout(
        order,
        async (paymentResult) => {
          try {
            // 1. Send verification to backend (non-blocking for UI update)
            void verifyProPayment(paymentResult);

            // 2. IMMEDIATELY update local cache to Pro
            const proState = {
              plan: "pro",
              status: "active",
              currentPeriodStart: new Date().toISOString(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              cancelAtPeriodEnd: false,
              stripeCustomerId: null,
              stripeSubscriptionId: order.subscriptionId,
              stripePriceId: null,
            };
            
            window.localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(proState));

            // 3. Redirect immediately
            window.location.assign("/");
          } catch (error) {
            console.error("[Checkout] Verification error:", error);
            window.alert(error instanceof Error ? error.message : "Payment verification failed.");
            setIsPaying(false);
          }
        },
        () => {
          setIsPaying(false);
        },
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to start checkout.");
      setIsPaying(false);
    }
  };

  const copyPaymentLink = async () => {
    if (checkoutOrder?.shortUrl) {
      try {
        await navigator.clipboard.writeText(checkoutOrder.shortUrl);
        window.alert("Link copied!");
      } catch (_err) {
        window.alert("Failed to copy link.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-900 selection:bg-slate-200">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="mt-12 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02),0_20px_48px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col md:flex-row">
            {/* Main Content */}
            <div className="flex-[1.4] p-8 sm:p-12">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Upgrade to Waydots Pro</h1>
              </div>

              <div className="mt-12 space-y-8">
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    "Unlimited Goals & Projects",
                    "Advanced Visual Analytics",
                    "Real-time Cloud Sync",
                    "Priority Customer Support"
                  ].map((feature) => (
                    <div key={feature} className="flex items-center gap-3">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
                        <Check className="h-3 w-3" />
                      </div>
                      <span className="text-sm font-medium text-slate-600">{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-4">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Coupon Code</label>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(event) => {
                        setCouponCode(event.target.value.toUpperCase());
                        if (couponError) setCouponError("");
                      }}
                      placeholder="Enter discount code"
                      disabled={!!appliedCoupon}
                      className="h-14 w-full rounded-xl border border-slate-200 bg-slate-50 px-5 text-lg font-medium transition-all focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-slate-900/5 disabled:opacity-50"
                    />
                    {appliedCoupon ? (
                      <button
                        type="button"
                        onClick={removeCoupon}
                        className="flex h-14 items-center justify-center rounded-xl bg-rose-50 px-6 font-bold text-rose-600 transition-colors hover:bg-rose-100 hover:text-rose-700 active:scale-[0.98]"
                      >
                        Remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={applyCoupon}
                        disabled={isValidating || !couponCode.trim()}
                        className="flex h-14 items-center justify-center rounded-xl bg-slate-100 px-6 font-bold text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 active:scale-[0.98] disabled:opacity-50"
                      >
                        {isValidating ? "..." : "Apply"}
                      </button>
                    )}
                  </div>
                  {(appliedCoupon || couponError) && (
                    <p className={`mt-3 text-sm font-medium ${isDiscounted ? "text-emerald-500" : "text-rose-500"}`}>
                      {isDiscounted ? `Coupon "${appliedCoupon}" applied!` : couponError}
                    </p>
                  )}
                </div>

                <div className="pt-4">
                  <button
                    type="button"
                    onClick={() => { void handlePayment(); }}
                    disabled={isPaying || (currencyHint !== "INR" && currencyHint !== "USD")}
                    className="flex h-16 w-full items-center justify-center rounded-xl bg-slate-950 text-lg font-bold text-white transition-all hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isPaying ? "Initialising..." : `Subscribe for ${headlinePrice}`}
                  </button>
                  <p className="mt-4 text-center text-xs font-medium text-slate-400">
                    Billed monthly. Cancel anytime with one click.
                  </p>
                </div>
              </div>
            </div>

            {/* Summary Sidebar */}
            <div className="flex-1 border-l border-slate-100 bg-slate-50/50 p-8 sm:p-12">
              <div className="space-y-6">
                <div className="pb-6 border-b border-slate-200/60">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Summary</h2>
                  <div className="mt-6 flex items-center justify-between font-bold">
                    <span className="text-lg">Pro Membership</span>
                    <span className="text-lg">{isIndiaCheckout ? "₹500.00" : "$5.00"}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm font-medium text-slate-500">
                    <span>Tax</span>
                    <span>Included</span>
                  </div>
                  {isDiscounted && (
                    <div className="flex items-center justify-between text-sm font-medium text-emerald-600">
                      <span>Discount ({appliedCoupon})</span>
                      <span>
                        {isIndiaCheckout ? `-₹${normalizedDiscount.toFixed(2)}` : `-$${normalizedDiscount.toFixed(2)}`}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xl font-black pt-2">
                    <span>Total</span>
                    <span>{headlinePrice.split(' / ')[0]}</span>
                  </div>
                </div>

                {isIndiaCheckout && checkoutOrder?.shortUrl && (
                  <div className="mt-12 pt-12 border-t border-slate-200/60 flex flex-col items-center">
                    <div className="group relative rounded-2xl border border-slate-200 bg-white p-3 transition-all hover:shadow-xl">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(checkoutOrder.shortUrl)}`}
                        alt="Checkout QR"
                        className="h-40 w-40 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={copyPaymentLink}
                        className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-950 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg transition-transform hover:scale-105"
                      >
                        Copy Link
                      </button>
                    </div>
                    <p className="mt-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Scan to Pay on Mobile
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
