import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("id, name, storage_key, mime_type, is_deleted")
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

    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: file.storage_key,
      ResponseContentDisposition: `attachment; filename="${file.name.replace(/"/g, "")}"`,
      ResponseContentType:
        file.mime_type || "application/octet-stream",
    });

    const downloadUrl = await getSignedUrl(r2, command, {
      expiresIn: 300,
    });

    return NextResponse.json({
      downloadUrl,
    });
  } catch (error) {
    console.error("Download URL error:", error);

    return NextResponse.json(
      { error: "Unable to create download URL." },
      { status: 500 }
    );
  }
}