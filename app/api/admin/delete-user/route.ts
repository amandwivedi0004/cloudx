import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import { createSupabaseServerClient } from "../../../../lib/supabase-server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { r2, R2_BUCKET } from "../../../../lib/r2";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user: adminUser },
    } = await supabase.auth.getUser();

    if (!adminUser) {
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

    const body = await request.json();
    const userId = body.userId;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "User ID is required." },
        { status: 400 }
      );
    }

    // NEVER allow the Super Admin to delete themselves.
    if (userId === adminUser.id) {
      return NextResponse.json(
        {
          error:
            "The Super Admin account cannot be deleted from the Admin Panel.",
        },
        { status: 400 }
      );
    }

    // Get all files belonging to this user.
    const { data: files, error: filesError } =
      await supabaseAdmin
        .from("files")
        .select("id, storage_key")
        .eq("user_id", userId);

    if (filesError) {
      return NextResponse.json(
        { error: filesError.message },
        { status: 500 }
      );
    }

    // Delete every R2 object belonging to the user.
    if (files && files.length > 0) {
      const results = await Promise.allSettled(
        files.map((file) =>
          r2.send(
            new DeleteObjectCommand({
              Bucket: R2_BUCKET,
              Key: file.storage_key,
            })
          )
        )
      );

      const failed = results.filter(
        (result) => result.status === "rejected"
      );

      if (failed.length > 0) {
        console.error(
          "Some R2 objects could not be deleted:",
          failed
        );

        return NextResponse.json(
          {
            error:
              "Some user files could not be removed from storage. The user was NOT deleted.",
          },
          { status: 500 }
        );
      }
    }

    // Delete database file records.
    const { error: deleteFilesError } =
      await supabaseAdmin
        .from("files")
        .delete()
        .eq("user_id", userId);

    if (deleteFilesError) {
      return NextResponse.json(
        { error: deleteFilesError.message },
        { status: 500 }
      );
    }

    // Delete profile.
    const { error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", userId);

    if (profileError) {
      console.error(
        "Profile deletion error:",
        profileError
      );
    }

    // Remove admin_users record if one exists.
    const { error: adminTableError } =
      await supabaseAdmin
        .from("admin_users")
        .delete()
        .eq("user_id", userId);

    if (adminTableError) {
      console.error(
        "Admin table cleanup error:",
        adminTableError
      );
    }

    // Finally delete the Supabase Auth account.
    const { error: authDeleteError } =
      await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      return NextResponse.json(
        {
          error: authDeleteError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "User and all of their files were deleted.",
      deletedFiles: files?.length || 0,
    });
  } catch (error) {
    console.error(
      "Admin delete user error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to delete user.",
      },
      { status: 500 }
    );
  }
}