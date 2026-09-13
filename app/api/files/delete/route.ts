import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import { createSupabaseServerClient } from "../../../../lib/supabase-server";
import { r2, R2_BUCKET } from "../../../../lib/r2";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const fileId = body.fileId;
    const permanent = body.permanent === true;

    if (!fileId) {
      return NextResponse.json(
        { error: "File ID is required." },
        { status: 400 }
      );
    }

    const { data: file, error: fileError } = await supabase
      .from("files")
      .select(
        "id, name, storage_key, size_bytes, is_deleted"
      )
      .eq("id", fileId)
      .eq("user_id", user.id)
      .single();

    if (fileError || !file) {
      return NextResponse.json(
        { error: "File not found." },
        { status: 404 }
      );
    }

    // Move to Trash
    if (!permanent) {
      const { error } = await supabase
        .from("files")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq("id", fileId)
        .eq("user_id", user.id);

      if (error) {
        throw new Error(error.message);
      }

      return NextResponse.json({
        success: true,
        message: "File moved to Trash.",
      });
    }

    // Permanently delete the R2 object
    await r2.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: file.storage_key,
      })
    );

    // Delete database record
    const { error: deleteError } = await supabase
      .from("files")
      .delete()
      .eq("id", fileId)
      .eq("user_id", user.id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    // Release storage quota
    const { error: releaseError } = await supabase.rpc(
      "release_storage",
      {
        bytes_to_release: Number(file.size_bytes),
      }
    );

    if (releaseError) {
      console.error(
        "Storage release error:",
        releaseError
      );
    }

    return NextResponse.json({
      success: true,
      message: "File permanently deleted.",
    });
  } catch (error) {
    console.error("Delete API error:", error);

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