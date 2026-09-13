import { NextResponse } from "next/server";
import {
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

import { createSupabaseServerClient } from "../../../../lib/supabase-server";
import { r2, R2_BUCKET } from "../../../../lib/r2";

export async function POST(
  request: Request
) {
  try {
    const supabase =
      await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Not authenticated.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const fileIds = Array.isArray(
      body.fileIds
    )
      ? body.fileIds
      : [];

    const permanent =
      body.permanent === true;

    if (fileIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "No files were selected.",
        },
        { status: 400 }
      );
    }

    if (fileIds.length > 100) {
      return NextResponse.json(
        {
          error:
            "You can delete up to 100 files at once.",
        },
        { status: 400 }
      );
    }

    /* =====================================================
       GET ONLY THE CURRENT USER'S FILES
    ===================================================== */

    const {
      data: files,
      error: filesError,
    } = await supabase
      .from("files")
      .select(
        "id, user_id, name, storage_key, size_bytes, is_deleted"
      )
      .in("id", fileIds)
      .eq("user_id", user.id);

    if (filesError) {
      return NextResponse.json(
        {
          error: filesError.message,
        },
        { status: 500 }
      );
    }

    if (
      !files ||
      files.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No matching files were found.",
        },
        { status: 404 }
      );
    }

    /* =====================================================
       MOVE TO TRASH
       permanent = false
    ===================================================== */

    if (!permanent) {
      const activeFiles =
        files.filter(
          (file) =>
            file.is_deleted === false
        );

      if (
        activeFiles.length === 0
      ) {
        return NextResponse.json(
          {
            error:
              "Only active files can be moved to Trash.",
          },
          { status: 400 }
        );
      }

      const activeIds =
        activeFiles.map(
          (file) => file.id
        );

      const {
        error: updateError,
      } = await supabase
        .from("files")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .in("id", activeIds)
        .eq("user_id", user.id);

      if (updateError) {
        return NextResponse.json(
          {
            error:
              updateError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        permanent: false,
        movedCount: activeFiles.length,
      });
    }

    /* =====================================================
       PERMANENT DELETE
       permanent = true

       ONLY FILES ALREADY IN TRASH
    ===================================================== */

    const trashFiles =
      files.filter(
        (file) =>
          file.is_deleted === true
      );

    if (
      trashFiles.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Only files in Trash can be permanently deleted.",
        },
        { status: 400 }
      );
    }

    /* =====================================================
       DELETE OBJECTS FROM CLOUDFLARE R2
    ===================================================== */

    const objects =
      trashFiles
        .filter(
          (file) =>
            Boolean(
              file.storage_key
            )
        )
        .map((file) => ({
          Key: file.storage_key,
        }));

    if (objects.length > 0) {
      await r2.send(
        new DeleteObjectsCommand({
          Bucket: R2_BUCKET,
          Delete: {
            Objects: objects,
            Quiet: true,
          },
        })
      );
    }

    /* =====================================================
       DELETE DATABASE ROWS
    ===================================================== */

    const trashIds =
      trashFiles.map(
        (file) => file.id
      );

    const {
      error: deleteError,
    } = await supabase
      .from("files")
      .delete()
      .in("id", trashIds)
      .eq("user_id", user.id)
      .eq("is_deleted", true);

    if (deleteError) {
      return NextResponse.json(
        {
          error:
            deleteError.message,
        },
        { status: 500 }
      );
    }

    /* =====================================================
       RELEASE STORAGE
    ===================================================== */

    const deletedBytes =
      trashFiles.reduce(
        (total, file) =>
          total +
          Number(
            file.size_bytes || 0
          ),
        0
      );

    if (deletedBytes > 0) {
      const {
        error: storageError,
      } = await supabase.rpc(
        "release_storage",
        {
          bytes_to_release:
            deletedBytes,
        }
      );

      if (storageError) {
        console.error(
          "Storage release error:",
          storageError
        );
      }
    }

    return NextResponse.json({
      success: true,
      permanent: true,
      deletedCount:
        trashFiles.length,
      releasedBytes:
        deletedBytes,
    });
  } catch (error) {
    console.error(
      "Bulk delete error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to process bulk delete.",
      },
      { status: 500 }
    );
  }
}