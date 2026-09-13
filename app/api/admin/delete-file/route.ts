import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import { createSupabaseServerClient } from "../../../../lib/supabase-server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { r2, R2_BUCKET } from "../../../../lib/r2";

export async function POST(request: Request) {
  try {
    // Check logged-in admin
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
    const fileId = body.fileId;

    if (!fileId) {
      return NextResponse.json(
        { error: "File ID is required." },
        { status: 400 }
      );
    }

    // Find the file
    const { data: file, error: fileError } =
      await supabaseAdmin
        .from("files")
        .select(
          "id, user_id, name, storage_key, size_bytes"
        )
        .eq("id", fileId)
        .maybeSingle();

    if (fileError) {
      return NextResponse.json(
        { error: fileError.message },
        { status: 500 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { error: "File not found." },
        { status: 404 }
      );
    }

    // Delete from Cloudflare R2
    await r2.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: file.storage_key,
      })
    );

    // Delete database record
    const { error: deleteError } =
      await supabaseAdmin
        .from("files")
        .delete()
        .eq("id", file.id);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    // Update user's storage usage directly as Admin.
    const { data: profile } =
      await supabaseAdmin
        .from("profiles")
        .select("storage_used_bytes")
        .eq("id", file.user_id)
        .maybeSingle();

    if (profile) {
      const currentUsed = Number(
        profile.storage_used_bytes || 0
      );

      const newUsed = Math.max(
        0,
        currentUsed - Number(file.size_bytes || 0)
      );

      await supabaseAdmin
        .from("profiles")
        .update({
          storage_used_bytes: newUsed,
        })
        .eq("id", file.user_id);
    }

    return NextResponse.json({
      success: true,
      message: "File permanently deleted.",
      fileId: file.id,
      fileName: file.name,
    });
  } catch (error) {
    console.error(
      "Admin delete file error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to delete file.",
      },
      { status: 500 }
    );
  }
}