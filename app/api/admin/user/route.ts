import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../../lib/supabase-server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user: adminUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !adminUser) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    // Verify Super Admin
    const { data: adminRecord, error: adminError } =
      await supabaseAdmin
        .from("admin_users")
        .select("user_id")
        .eq("user_id", adminUser.id)
        .maybeSingle();

    if (adminError) {
      return NextResponse.json(
        { error: adminError.message },
        { status: 500 }
      );
    }

    if (!adminRecord) {
      return NextResponse.json(
        { error: "Access denied." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required." },
        { status: 400 }
      );
    }

    // Get selected user's Auth information
    const { data: authData, error: authDataError } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (authDataError || !authData.user) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    const selectedUser = authData.user;

    // Get selected user's profile
    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .select(
          "full_name, storage_used_bytes, storage_limit_bytes"
        )
        .eq("id", userId)
        .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    // IMPORTANT:
    // Only files belonging to the selected user are loaded.
    const { data: files, error: filesError } =
      await supabaseAdmin
        .from("files")
        .select(
          "id, name, size_bytes, mime_type, created_at, is_deleted, is_starred"
        )
        .eq("user_id", userId)
        .order("created_at", {
          ascending: false,
        });

    if (filesError) {
      return NextResponse.json(
        { error: filesError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      user: {
        id: selectedUser.id,
        email: selectedUser.email || "",
        created_at: selectedUser.created_at,
      },

      profile: profile
        ? {
            full_name: profile.full_name,
            storage_used_bytes: Number(
              profile.storage_used_bytes || 0
            ),
            storage_limit_bytes: Number(
              profile.storage_limit_bytes || 0
            ),
          }
        : null,

      files: files || [],
    });
  } catch (error) {
    console.error(
      "Admin user details error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load user details.",
      },
      { status: 500 }
    );
  }
}