"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { createClient } from "../../lib/supabase-browser";

declare global {
  interface Window {
    Razorpay: any;
  }
}

const supabase = createClient();

type Plan = {
  id: string;
  name: string;
  storage: string;
  price: number;
  description: string;
};

const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    storage: "10 GB",
    price: 0,
    description: "For getting started",
  },
  {
    id: "cloudx_30",
    name: "CloudX 30",
    storage: "30 GB",
    price: 50,
    description: "For everyday storage",
  },
  {
    id: "cloudx_100",
    name: "CloudX 100",
    storage: "100 GB",
    price: 599,
    description: "For growing storage needs",
  },
  {
    id: "cloudx_200",
    name: "CloudX 200",
    storage: "200 GB",
    price: 1099,
    description: "For heavy personal storage",
  },
  {
    id: "cloudx_1tb",
    name: "CloudX 1TB",
    storage: "1 TB",
    price: 4999,
    description: "For serious storage needs",
  },
];

export default function PricingPage() {
  const [currentPlan, setCurrentPlan] = useState("free");
  const [currentStorage, setCurrentStorage] = useState("10 GB");
  const [subscriptionStatus, setSubscriptionStatus] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState("");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return;
      }

      setUserEmail(user.email || "");

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "plan_id, storage_limit_bytes, subscription_status, subscription_current_period_end"
        )
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Profile error:", error);
        return;
      }

      if (data?.plan_id) {
        setCurrentPlan(data.plan_id);

        const matchedPlan = plans.find(
          (plan) => plan.id === data.plan_id
        );

        if (matchedPlan) {
          setCurrentStorage(matchedPlan.storage);
        }
      }

      if (data?.storage_limit_bytes) {
        const bytes = Number(data.storage_limit_bytes);

        if (bytes >= 1099511627776) {
          setCurrentStorage("1 TB");
        } else if (bytes >= 214748364800) {
          setCurrentStorage("200 GB");
        } else if (bytes >= 107374182400) {
          setCurrentStorage("100 GB");
        } else if (bytes >= 32212254720) {
          setCurrentStorage("30 GB");
        } else {
          setCurrentStorage("10 GB");
        }
      }

      if (data?.subscription_status) {
        setSubscriptionStatus(data.subscription_status);
      }

      if (data?.subscription_current_period_end) {
        setRenewalDate(
          new Date(
            data.subscription_current_period_end
          ).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        );
      }
    } catch (error) {
      console.error("Load user error:", error);
    }
  }

  async function subscribe(planId: string) {
    try {
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage(
          "Your CloudX session has expired. Please log in again."
        );
        return;
      }

      if (planId === "free") {
        setMessage("You are already using the Free plan.");
        return;
      }

      if (planId === currentPlan) {
        setMessage("This is already your current plan.");
        return;
      }

      setLoadingPlan(planId);

      const response = await fetch(
        "/api/billing/create-subscription",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to create subscription."
        );
      }

      if (!window.Razorpay) {
        throw new Error(
          "Razorpay Checkout has not loaded yet. Please try again."
        );
      }

      const selectedPlan = plans.find(
        (plan) => plan.id === planId
      );

      const razorpayOptions = {
        key: data.razorpayKeyId,

        subscription_id: data.subscriptionId,

        name: "CloudX",

        description:
          `${selectedPlan?.name || "CloudX"} - ` +
          `${selectedPlan?.storage || ""}`,

        prefill: {
          name: user.user_metadata?.full_name || "",
          email: user.email || userEmail,
        },

        theme: {
          color: "#4f46e5",
        },

        handler: async function (paymentResponse: any) {
          try {
            setMessage("Verifying your payment...");

            const verifyResponse = await fetch(
              "/api/billing/verify",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  planId,

                  razorpay_payment_id:
                    paymentResponse.razorpay_payment_id,

                  razorpay_subscription_id:
                    paymentResponse.razorpay_subscription_id,

                  razorpay_signature:
                    paymentResponse.razorpay_signature,
                }),
              }
            );

            const verifyData =
              await verifyResponse.json();

            if (!verifyResponse.ok) {
              throw new Error(
                verifyData.error ||
                  "Payment verification failed."
              );
            }

            setCurrentPlan(planId);

            if (selectedPlan) {
              setCurrentStorage(selectedPlan.storage);
            }

            setSubscriptionStatus("active");

            setMessage(
              "Payment successful! Your CloudX storage has been upgraded."
            );

            await loadUser();
          } catch (error) {
            console.error(
              "Verification error:",
              error
            );

            setMessage(
              error instanceof Error
                ? error.message
                : "Payment verification failed."
            );
          } finally {
            setLoadingPlan(null);
          }
        },

        modal: {
          ondismiss: function () {
            setLoadingPlan(null);
            setMessage("Payment window closed.");
          },
        },
      };

      const razorpay = new window.Razorpay(
        razorpayOptions
      );

      razorpay.on(
        "payment.failed",
        function (response: any) {
          console.error(
            "Razorpay payment failed:",
            response
          );

          setMessage(
            response?.error?.description ||
              "Payment failed. Please try again."
          );

          setLoadingPlan(null);
        }
      );

      razorpay.open();
    } catch (error) {
      console.error(
        "Subscription error:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong."
      );

      setLoadingPlan(null);
    }
  }

  async function cancelSubscription() {
    const confirmed = window.confirm(
      "Are you sure you want to cancel your subscription? Your current plan will remain active until the end of the current billing period."
    );

    if (!confirmed) {
      return;
    }

    try {
      setCancelling(true);
      setMessage("");

      const response = await fetch(
        "/api/billing/cancel-subscription",
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to cancel subscription."
        );
      }

      setMessage(
        "Your subscription has been cancelled. Your current plan will remain active until the end of the billing period."
      );

      await loadUser();
    } catch (error) {
      console.error(
        "Cancel subscription error:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to cancel subscription."
      );
    } finally {
      setCancelling(false);
    }
  }

  const currentPlanDetails =
    plans.find((plan) => plan.id === currentPlan) ||
    plans[0];

  const hasPaidSubscription =
    currentPlan !== "free" &&
    Boolean(renewalDate);

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
      />

      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 px-5 py-10 md:px-8">
        <div className="mx-auto max-w-7xl">

          {/* HEADER */}

          <div className="mb-8 text-center">
            <button
              onClick={() =>
                (window.location.href = "/dashboard")
              }
              className="mb-6 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              ← Back to CloudX
            </button>

            <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
              Plans & Billing
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-slate-500">
              Manage your CloudX storage plan and
              subscription.
            </p>
          </div>

          {/* CURRENT PLAN */}

          <div className="mx-auto mb-10 max-w-4xl rounded-3xl border border-indigo-100 bg-white p-6 shadow-lg">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">

              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
                  Current Plan
                </p>

                <h2 className="mt-1 text-2xl font-bold text-slate-900">
                  {currentPlanDetails.name}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {currentPlanDetails.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">

                <div className="rounded-2xl bg-slate-50 px-5 py-4">
                  <p className="text-xs text-slate-500">
                    Storage
                  </p>

                  <p className="mt-1 font-bold text-slate-900">
                    {currentStorage}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 px-5 py-4">
                  <p className="text-xs text-slate-500">
                    Status
                  </p>

                  <p className="mt-1 font-bold capitalize text-slate-900">
                    {subscriptionStatus || "Active"}
                  </p>
                </div>

                <div className="col-span-2 rounded-2xl bg-slate-50 px-5 py-4 md:col-span-1">
                  <p className="text-xs text-slate-500">
                    {renewalDate
                      ? "Renewal"
                      : "Billing"}
                  </p>

                  <p className="mt-1 font-bold text-slate-900">
                    {renewalDate ||
                      (currentPlan === "free"
                        ? "Free"
                        : "Yearly")}
                  </p>
                </div>

              </div>
            </div>

            {/* CANCEL SUBSCRIPTION */}

            {hasPaidSubscription &&
              subscriptionStatus !== "cancelled" &&
              subscriptionStatus !== "completed" && (
                <div className="mt-6 border-t border-slate-100 pt-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        Manage subscription
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Canceling keeps your current
                        storage active until the renewal
                        date.
                      </p>
                    </div>

                    <button
                      onClick={cancelSubscription}
                      disabled={cancelling}
                      className="rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {cancelling
                        ? "Cancelling..."
                        : "Cancel Subscription"}
                    </button>

                  </div>
                </div>
              )}
          </div>

          {/* MESSAGE */}

          {message && (
            <div className="mx-auto mb-8 max-w-2xl rounded-2xl border border-indigo-100 bg-white p-4 text-center text-sm font-medium text-slate-700 shadow-sm">
              {message}
            </div>
          )}

          {/* PLANS */}

          <div className="mb-4 text-center">
            <h2 className="text-2xl font-bold text-slate-900">
              Choose your CloudX plan
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Upgrade whenever you need more storage.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">

            {plans.map((plan) => {
              const isCurrent =
                currentPlan === plan.id;

              const isLoading =
                loadingPlan === plan.id;

              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-3xl border bg-white p-6 shadow-lg transition hover:-translate-y-1 hover:shadow-xl ${
                    plan.id === "cloudx_100"
                      ? "border-indigo-300 ring-2 ring-indigo-100"
                      : "border-slate-200"
                  }`}
                >

                  {plan.id === "cloudx_100" && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-xs font-bold text-white">
                      POPULAR
                    </div>
                  )}

                  {/* PLAN NAME */}

                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      {plan.name}
                    </h2>

                    <p className="mt-2 min-h-[40px] text-sm text-slate-500">
                      {plan.description}
                    </p>
                  </div>

                  {/* PRICE */}

                  <div className="mt-6">
                    <span className="text-4xl font-bold text-slate-900">
                      ₹{plan.price.toLocaleString("en-IN")}
                    </span>

                    <span className="ml-1 text-sm text-slate-500">
                      /year
                    </span>
                  </div>

                  {/* STORAGE */}

                  <div className="mt-6 rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">
                        Storage
                      </span>

                      <span className="font-bold text-slate-900">
                        {plan.storage}
                      </span>
                    </div>
                  </div>

                  {/* BUTTON */}

                  <button
                    onClick={() =>
                      subscribe(plan.id)
                    }
                    disabled={
                      isCurrent || isLoading
                    }
                    className={`mt-6 w-full rounded-2xl px-4 py-3 font-bold transition ${
                      isCurrent
                        ? "cursor-default bg-slate-100 text-slate-500"
                        : "bg-indigo-600 text-white shadow-lg hover:bg-indigo-700"
                    }`}
                  >
                    {isLoading
                      ? "Opening payment..."
                      : isCurrent
                        ? "Current Plan"
                        : plan.id === "free"
                          ? "Free Plan"
                          : "Upgrade"}
                  </button>

                  {/* YEARLY */}

                  {plan.price > 0 && (
                    <p className="mt-3 text-center text-xs text-slate-400">
                      Billed yearly
                    </p>
                  )}
                </div>
              );
            })}

          </div>

          {/* SECURITY */}

          <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-white bg-white/70 p-6 text-center shadow-sm backdrop-blur">

            <p className="text-sm font-semibold text-slate-800">
              🔒 Secure payments with Razorpay
            </p>

            <p className="mt-2 text-xs leading-5 text-slate-500">
              Your payment is processed securely by
              Razorpay. CloudX does not store your
              card or UPI credentials.
            </p>

          </div>

        </div>
      </main>
    </>
  );
}