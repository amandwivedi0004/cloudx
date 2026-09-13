import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../../lib/supabase-server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        isAdmin: false,
        reason: "NO_LOGGED_IN_USER",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    console.log("ADMIN CHECK:", {
      loggedInUser: user.email,
      userId: user.id,
      adminRecord: data,
      databaseError: error,
    });

    if (error) {
      return NextResponse.json({
        isAdmin: false,
        reason: "DATABASE_ERROR",
        error: error.message,
        loggedInEmail: user.email,
        loggedInUserId: user.id,
      });
    }

    if (!data) {
      return NextResponse.json({
        isAdmin: false,
        reason: "USER_NOT_IN_ADMIN_TABLE",
        loggedInEmail: user.email,
        loggedInUserId: user.id,
      });
    }

    return NextResponse.json({
      isAdmin: true,
      email: user.email,
      userId: user.id,
    });
  } catch (error) {
    console.error("ADMIN CHECK ERROR:", error);

    return NextResponse.json({
      isAdmin: false,
      reason: "SERVER_ERROR",
      error:
        error instanceof Error
          ? error.message
          : "Unknown error",
    });
  }
}