import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { createSupabaseServerClient } from "../../../../lib/supabase-server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { r2, R2_BUCKET } from "../../../../lib/r2";

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);

    const fileId = searchParams.get("fileId");

    if (!fileId) {
      return NextResponse.json(
        { error: "File ID is required." },
        { status: 400 }
      );
    }

    // Only retrieve the selected file.
    const { data: file, error: fileError } =
      await supabaseAdmin
        .from("files")
        .select(
          "id, name, storage_key, size_bytes, mime_type, created_at, is_deleted, is_starred"
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

    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: file.storage_key,
      ResponseContentDisposition: `inline; filename="${encodeURIComponent(
        file.name
      )}"`,
      ResponseContentType:
        file.mime_type || "application/octet-stream",
    });

    const url = await getSignedUrl(r2, command, {
      expiresIn: 900,
    });

    return NextResponse.json({
      success: true,
      url,
      file: {
        id: file.id,
        name: file.name,
        size_bytes: Number(file.size_bytes || 0),
        mime_type: file.mime_type,
        created_at: file.created_at,
        is_deleted: file.is_deleted,
        is_starred: file.is_starred,
      },
    });
  } catch (error) {
    console.error(
      "Admin file preview error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create preview URL.",
      },
      { status: 500 }
    );
  }
}