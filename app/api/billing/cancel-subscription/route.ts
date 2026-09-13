import { NextResponse } from "next/server";
import Razorpay from "razorpay";

import { createSupabaseServerClient } from "../../../../lib/supabase-server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }

    if (
      !process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET
    ) {
      return NextResponse.json(
        { error: "Razorpay configuration is missing." },
        { status: 500 }
      );
    }

    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .select(
          "subscription_id, subscription_status, subscription_current_period_end"
        )
        .eq("id", user.id)
        .single();

    if (profileError) {
      console.error("Profile lookup error:", profileError);

      return NextResponse.json(
        { error: "Unable to find your subscription." },
        { status: 500 }
      );
    }

    if (!profile?.subscription_id) {
      return NextResponse.json(
        { error: "You do not have an active subscription." },
        { status: 400 }
      );
    }

    if (
      profile.subscription_status === "cancelled" ||
      profile.subscription_status === "completed"
    ) {
      return NextResponse.json(
        { error: "Your subscription is already cancelled." },
        { status: 400 }
      );
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const subscription =
      await razorpay.subscriptions.cancel(
        profile.subscription_id,
        true
      );

    const currentEnd =
      subscription.current_end
        ? new Date(
            subscription.current_end * 1000
          ).toISOString()
        : profile.subscription_current_period_end;

    const { error: updateError } =
      await supabaseAdmin
        .from("profiles")
        .update({
          subscription_status:
            subscription.status || "cancelled",
          subscription_current_period_end: currentEnd,
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
            "Subscription was cancelled, but CloudX could not update the profile.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      status:
        subscription.status || "cancelled",
      currentPeriodEnd: currentEnd,
      message:
        "Your subscription will end at the end of the current billing period.",
    });
  } catch (error: any) {
    console.error(
      "Cancel subscription error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.error?.description ||
          error?.message ||
          "Unable to cancel subscription.",
      },
      { status: 500 }
    );
  }
}