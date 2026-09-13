import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { r2, R2_BUCKET } from "@/lib/r2";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const fileId = String(body.fileId || "").trim();

    if (!fileId) {
      return NextResponse.json(
        { error: "File ID is required." },
        { status: 400 }
      );
    }

    // Make sure this file belongs to the logged-in user.
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("id, storage_key, size_bytes")
      .eq("id", fileId)
      .eq("user_id", user.id)
      .eq("is_deleted", false)
      .single();

    if (fileError || !file) {
      return NextResponse.json(
        { error: "File not found." },
        { status: 404 }
      );
    }

    // Delete the actual object from Cloudflare R2.
    await r2.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: file.storage_key,
      })
    );

    // Mark the database record as deleted.
    const { error: updateError } = await supabase
      .from("files")
      .update({ is_deleted: true })
      .eq("id", file.id)
      .eq("user_id", user.id);

    if (updateError) {
      console.error(
        "File database update error:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "File was removed from storage, but database cleanup failed.",
        },
        { status: 500 }
      );
    }

    // Release the storage quota.
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
      message: "File deleted successfully.",
    });
  } catch (error) {
    console.error("Delete file error:", error);

    return NextResponse.json(
      { error: "Unable to delete file." },
      { status: 500 }
    );
  }
}