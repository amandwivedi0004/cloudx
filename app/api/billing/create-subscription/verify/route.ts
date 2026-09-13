import { NextResponse } from "next/server";
import crypto from "crypto";
import { createSupabaseServerClient } from "../../../../../lib/supabase-server";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import Razorpay from "razorpay";

export async function POST(request: Request) {
  try {
    // -----------------------------
    // 1. Check logged-in user
    // -----------------------------

    const supabase =
      await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error: "Not authenticated",
        },
        {
          status: 401,
        }
      );
    }

    // -----------------------------
    // 2. Read request body
    // -----------------------------

    const body = await request.json();

    const {
      planId,
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
    } = body;

    if (
      !planId ||
      !razorpay_payment_id ||
      !razorpay_subscription_id ||
      !razorpay_signature
    ) {
      return NextResponse.json(
        {
          error:
            "Missing payment verification details.",
        },
        {
          status: 400,
        }
      );
    }

    // -----------------------------
    // 3. Check Razorpay environment
    // -----------------------------

    if (
      !process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET
    ) {
      return NextResponse.json(
        {
          error:
            "Razorpay environment variables are missing.",
        },
        {
          status: 500,
        }
      );
    }

    // -----------------------------
    // 4. Verify Razorpay signature
    // -----------------------------

    const generatedSignature =
      crypto
        .createHmac(
          "sha256",
          process.env.RAZORPAY_KEY_SECRET
        )
        .update(
          `${razorpay_payment_id}|${razorpay_subscription_id}`
        )
        .digest("hex");

    if (
      generatedSignature !==
      razorpay_signature
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid Razorpay payment signature.",
        },
        {
          status: 400,
        }
      );
    }

    // -----------------------------
    // 5. Get selected plan
    // -----------------------------

    const { data: plan, error: planError } =
      await supabaseAdmin
        .from("plans")
        .select(
          "id, name, storage_bytes, price_inr, billing_interval, razorpay_plan_id"
        )
        .eq("id", planId)
        .eq("active", true)
        .single();

    if (planError || !plan) {
      return NextResponse.json(
        {
          error: "Plan not found.",
        },
        {
          status: 404,
        }
      );
    }

    // -----------------------------
    // 6. Verify subscription with
    //    Razorpay server-to-server
    // -----------------------------

    const razorpay =
      new Razorpay({
        key_id:
          process.env.RAZORPAY_KEY_ID,
        key_secret:
          process.env.RAZORPAY_KEY_SECRET,
      });

    const subscription =
      await razorpay.subscriptions.fetch(
        razorpay_subscription_id
      );

    // -----------------------------
    // 7. Make sure subscription
    //    belongs to selected plan
    // -----------------------------

    if (
      subscription.plan_id !==
      plan.razorpay_plan_id
    ) {
      return NextResponse.json(
        {
          error:
            "Subscription plan does not match the selected CloudX plan.",
        },
        {
          status: 400,
        }
      );
    }

    // -----------------------------
    // 8. Get subscription status
    // -----------------------------

    const subscriptionStatus =
      subscription.status || "active";

    let periodEnd: string | null =
      null;

    if (subscription.current_end) {
      periodEnd = new Date(
        subscription.current_end *
          1000
      ).toISOString();
    }

    // -----------------------------
    // 9. Update user's profile
    // -----------------------------

    const { error: updateError } =
      await supabaseAdmin
        .from("profiles")
        .update({
          plan_id: plan.id,
          razorpay_plan_id:
            plan.razorpay_plan_id,
          subscription_id:
            razorpay_subscription_id,
          subscription_status:
            subscriptionStatus,
          subscription_current_period_end:
            periodEnd,
          storage_limit_bytes:
            plan.storage_bytes,
        })
        .eq("id", user.id);

    if (updateError) {
      console.error(
        "Profile update error:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "Payment verified, but CloudX could not update your plan.",
        },
        {
          status: 500,
        }
      );
    }

    // -----------------------------
    // 10. Success
    // -----------------------------

    return NextResponse.json({
      success: true,
      message:
        "Payment verified and CloudX plan upgraded.",
      planId: plan.id,
      planName: plan.name,
      storageBytes:
        plan.storage_bytes,
      subscriptionId:
        razorpay_subscription_id,
      subscriptionStatus:
        subscriptionStatus,
      subscriptionCurrentPeriodEnd:
        periodEnd,
    });
  } catch (error) {
    console.error(
      "Payment verification error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Payment verification failed.",
      },
      {
        status: 500,
      }
    );
  }
}