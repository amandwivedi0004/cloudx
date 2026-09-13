import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

const FREE_STORAGE_BYTES = 10 * 1024 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-cloudx-cron-secret");
   

    
if (
  !process.env.CLOUDX_CRON_SECRET ||
  secret !== process.env.CLOUDX_CRON_SECRET
) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const now = new Date().toISOString();

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, subscription_id, subscription_status, subscription_current_period_end, subscription_cancel_at_period_end"
      )
      .not("subscription_current_period_end", "is", null)
      .lt("subscription_current_period_end", now)
      .neq("plan_id", "free");

    if (error) {
      console.error("Expiry lookup error:", error);

      return NextResponse.json(
        { error: "Unable to check expired subscriptions." },
        { status: 500 }
      );
    }

    let downgraded = 0;

    for (const profile of profiles ?? []) {
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({
          plan_id: "free",
          razorpay_plan_id: null,
          subscription_id: null,
          subscription_status: "expired",
          subscription_current_period_end: null,
          subscription_cancel_at_period_end: false,
          storage_limit_bytes: FREE_STORAGE_BYTES,
        })
        .eq("id", profile.id);

      if (updateError) {
        console.error(
          `Failed to downgrade user ${profile.id}:`,
          updateError
        );
        continue;
      }

      downgraded++;
    }

    return NextResponse.json({
      success: true,
      checked: profiles?.length ?? 0,
      downgraded,
    });
  } catch (error) {
    console.error("Expiry handler error:", error);

    return NextResponse.json(
      { error: "Unable to process subscription expiry." },
      { status: 500 }
    );
  }
}