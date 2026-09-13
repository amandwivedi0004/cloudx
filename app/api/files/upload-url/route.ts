import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { r2, R2_BUCKET } from "@/lib/r2";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    // Verify the logged-in user
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

    const name = String(body.name || "").trim();
    const size = Number(body.size || 0);
    const mimeType = String(
      body.mimeType || "application/octet-stream"
    );

    // Validate file information
    if (!name || !Number.isFinite(size) || size <= 0) {
      return NextResponse.json(
        { error: "Invalid file information." },
        { status: 400 }
      );
    }

    // Maximum single-file size for now: 5 GB
    const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;

    if (size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File is larger than the 5 GB limit." },
        { status: 413 }
      );
    }

    // Atomically reserve storage in Supabase
    const { data: reservation, error: reservationError } =
      await supabase.rpc("reserve_storage", {
        bytes_to_add: size,
      });

    if (reservationError) {
      console.error("Storage reservation error:", reservationError);

      return NextResponse.json(
        { error: "Unable to check storage quota." },
        { status: 500 }
      );
    }

    if (reservation !== true) {
      return NextResponse.json(
        { error: "Not enough storage space." },
        { status: 413 }
      );
    }

    // Create a unique and safe R2 object key
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");

    const storageKey = `${user.id}/${crypto.randomUUID()}-${safeName}`;

    // Create temporary upload URL
    const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
    ContentType: mimeType,
  });

    const uploadUrl = await getSignedUrl(r2, command, {
      expiresIn: 900,
    });

    return NextResponse.json({
      uploadUrl,
      storageKey,
    });
  } catch (error) {
    console.error("Upload URL error:", error);

    return NextResponse.json(
      { error: "Unable to create upload URL." },
      { status: 500 }
    );
  }
}