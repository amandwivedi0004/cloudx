import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../../lib/supabase-server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export async function GET() {
  try {
    // Check logged-in user
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
      console.error(
        "Admin verification error:",
        adminError
      );

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

    // Get Auth users.
    // Only basic account information is returned.
    const { data: authData, error: usersError } =
      await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

    if (usersError) {
      return NextResponse.json(
        { error: usersError.message },
        { status: 500 }
      );
    }

    // Get only profile statistics.
    const { data: profiles, error: profilesError } =
      await supabaseAdmin
        .from("profiles")
        .select(
          "id, storage_used_bytes, storage_limit_bytes"
        );

    if (profilesError) {
      return NextResponse.json(
        { error: profilesError.message },
        { status: 500 }
      );
    }

    // Get only file ownership/count information.
    // We do NOT return file names, storage keys,
    // MIME types, etc. here.
    const { data: files, error: filesError } =
      await supabaseAdmin
        .from("files")
        .select("id, user_id");

    if (filesError) {
      return NextResponse.json(
        { error: filesError.message },
        { status: 500 }
      );
    }

    const profileMap = new Map<
      string,
      {
        storage_used_bytes: number;
        storage_limit_bytes: number;
      }
    >();

    for (const profile of profiles || []) {
      profileMap.set(profile.id, {
        storage_used_bytes: Number(
          profile.storage_used_bytes || 0
        ),
        storage_limit_bytes: Number(
          profile.storage_limit_bytes || 0
        ),
      });
    }

    const fileCountMap = new Map<string, number>();

    for (const file of files || []) {
      fileCountMap.set(
        file.user_id,
        (fileCountMap.get(file.user_id) || 0) + 1
      );
    }

    const users = (authData.users || []).map(
      (user) => {
        const profile = profileMap.get(user.id);

        return {
          id: user.id,
          email: user.email || "",
          created_at: user.created_at,

          // Only statistics are exposed.
          // Individual files remain hidden.
          storage_used_bytes:
            profile?.storage_used_bytes || 0,

          storage_limit_bytes:
            profile?.storage_limit_bytes ||
            32212254720,

          file_count:
            fileCountMap.get(user.id) || 0,
        };
      }
    );

    return NextResponse.json({
      users,
    });
  } catch (error) {
    console.error(
      "Admin data API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load admin data.",
      },
      { status: 500 }
    );
  }
}