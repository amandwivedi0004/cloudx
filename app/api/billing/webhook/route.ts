import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    const signature = request.headers.get("x-razorpay-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing webhook signature" },
        { status: 400 }
      );
    }

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("RAZORPAY_WEBHOOK_SECRET is missing");

      return NextResponse.json(
        { error: "Webhook secret is not configured" },
        { status: 500 }
      );
    }

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signature)
      )
    ) {
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 400 }
      );
    }

    const payload = JSON.parse(rawBody);

    const event = payload.event;

    const subscription =
      payload?.payload?.subscription?.entity;

    if (!subscription?.id) {
      return NextResponse.json({
        success: true,
        message: "Webhook received",
      });
    }

    const subscriptionId = subscription.id;

    const updateData: Record<string, unknown> = {
      subscription_status: subscription.status ?? null,
    };

    if (subscription.current_end) {
      updateData.subscription_current_period_end =
        new Date(
          subscription.current_end * 1000
        ).toISOString();
    }

    if (event === "subscription.activated") {
      updateData.subscription_status = "active";
    }

    if (event === "subscription.charged") {
      updateData.subscription_status = "active";
    }

    if (event === "subscription.halted") {
      updateData.subscription_status = "halted";
    }

    if (event === "subscription.cancelled") {
      updateData.subscription_status = "cancelled";
    }

    if (event === "subscription.completed") {
      updateData.subscription_status = "completed";
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(updateData)
      .eq("subscription_id", subscriptionId);

    if (error) {
      console.error("Webhook profile update error:", error);

      return NextResponse.json(
        { error: "Failed to update subscription" },
        { status: 500 }
      );
    }

    console.log(
      `Razorpay webhook processed: ${event} - ${subscriptionId}`
    );

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Razorpay webhook error:", error);

    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}