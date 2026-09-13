import { createHmac } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.text();

    const signature = request.headers.get("x-razorpay-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing webhook signature" },
        { status: 400 }
      );
    }

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
      console.error("RAZORPAY_WEBHOOK_SECRET is missing");
      return NextResponse.json(
        { error: "Webhook secret is not configured" },
        { status: 500 }
      );
    }

    // Verify Razorpay webhook signature
    const expectedSignature = createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== signature) {
      console.error("Invalid Razorpay webhook signature");

      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 400 }
      );
    }

    const payload = JSON.parse(body);

    const eventType = payload.event;
    const eventId = payload.id ?? null;

    const subscription =
      payload?.payload?.subscription?.entity ?? null;

    const subscriptionId = subscription?.id ?? null;

    const payment =
      payload?.payload?.payment?.entity ?? null;

    const paymentId = payment?.id ?? null;

    // Find the CloudX user belonging to this subscription
    let userId: string | null = null;

    if (subscriptionId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("subscription_id", subscriptionId)
        .maybeSingle();

      userId = profile?.id ?? null;
    }

    // Save the webhook event.
    // If Razorpay sends the same event again, event_id prevents duplicates.
    if (eventId) {
      const { data: existingEvent, error: existingError } =
        await supabaseAdmin
          .from("billing_events")
          .select("id")
          .eq("event_id", eventId)
          .maybeSingle();

      if (existingError) {
        console.error(
          "Failed to check existing billing event:",
          existingError
        );

        return NextResponse.json(
          { error: "Failed to check billing event" },
          { status: 500 }
        );
      }

      if (existingEvent) {
        console.log(`Duplicate Razorpay webhook ignored: ${eventId}`);

        return NextResponse.json({
          success: true,
          duplicate: true,
        });
      }
    }

    const { error: logError } = await supabaseAdmin
      .from("billing_events")
      .insert({
        event_id: eventId,
        event_type: eventType,
        subscription_id: subscriptionId,
        payment_id: paymentId,
        user_id: userId,
        payload,
      });

    if (logError) {
      console.error("Failed to save billing event:", logError);

      return NextResponse.json(
        { error: "Failed to save billing event" },
        { status: 500 }
      );
    }

    // Process subscription events
    if (subscriptionId) {
      let subscriptionStatus = subscription.status ?? null;

      switch (eventType) {
        case "subscription.authenticated":
          subscriptionStatus = "authenticated";
          break;

        case "subscription.activated":
          subscriptionStatus = "active";
          break;

        case "subscription.charged":
          subscriptionStatus = "active";
          break;

        case "subscription.pending":
          subscriptionStatus = "pending";
          break;

        case "subscription.halted":
          subscriptionStatus = "halted";
          break;

        case "subscription.cancelled":
          subscriptionStatus = "cancelled";
          break;

        case "subscription.completed":
          subscriptionStatus = "completed";
          break;

        case "subscription.updated":
          subscriptionStatus = subscription.status ?? "active";
          break;
      }

      const currentEnd = subscription.current_end
        ? new Date(subscription.current_end * 1000).toISOString()
        : null;

      const updateData: Record<string, unknown> = {
        subscription_status: subscriptionStatus,
      };

      if (currentEnd) {
        updateData.subscription_current_period_end = currentEnd;
      }

      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update(updateData)
        .eq("subscription_id", subscriptionId);

      if (updateError) {
        console.error(
          "Failed to update subscription:",
          updateError
        );

        return NextResponse.json(
          { error: "Failed to update subscription" },
          { status: 500 }
        );
      }
    }

    console.log(
      `Razorpay webhook processed: ${eventType} - ${subscriptionId ?? "no subscription"}`
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