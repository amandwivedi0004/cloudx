import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const planId = body.planId;

    const allowedPlans = [
      "cloudx_30",
      "cloudx_100",
      "cloudx_200",
      "cloudx_1tb",
    ];

    if (!allowedPlans.includes(planId)) {
      return NextResponse.json(
        { error: "Invalid plan" },
        { status: 400 }
      );
    }

    const { data: plan, error: planError } = await supabaseAdmin
      .from("plans")
      .select(
        "id, name, storage_bytes, price_inr, billing_interval, razorpay_plan_id, active"
      )
      .eq("id", planId)
      .eq("active", true)
      .single();

    if (planError || !plan || !plan.razorpay_plan_id) {
      return NextResponse.json(
        { error: "Plan not available" },
        { status: 400 }
      );
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id: plan.razorpay_plan_id,
      total_count: 100,
      customer_notify: 1,
      notes: {
        cloudx_user_id: user.id,
        cloudx_plan_id: plan.id,
      },
    });

    return NextResponse.json({
      success: true,
      subscriptionId: subscription.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      plan: {
        id: plan.id,
        name: plan.name,
        storageBytes: plan.storage_bytes,
        priceInr: plan.price_inr,
      },
    });
  } catch (error) {
    console.error("Create subscription error:", error);

    return NextResponse.json(
      { error: "Failed to create subscription" },
      { status: 500 }
    );
  }
}