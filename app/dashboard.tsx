"use client";

import { useEffect, useRef, useState } from "react";
import {
  Cloud,
  Upload,
  Search,
  FileText,
  Image,
  Video,
  File,
  Trash2,
  Star,
  Clock3,
  Settings,
  HardDrive,
  MoreHorizontal,
  ShieldCheck,
  Sparkles,
  Download,
  Pencil,
  X,
} from "lucide-react";
import { createClient } from "../lib/supabase-browser";

type Item = {
  id: string;
  name: string;
  type: "pdf" | "image" | "video" | "file";
  size: string;
  date: string;
  sizeBytes: number;
};

function TypeIcon({ type }: { type: Item["type"] }) {
  if (type === "pdf") {
    return <FileText className="text-red-500" />;
  }

  if (type === "image") {
    return <Image className="text-blue-500" />;
  }

  if (type === "video") {
    return <Video className="text-purple-500" />;
  }

  return <File className="text-gray-500" />;
}

function getFileTypeFromMime(
  mimeType: string
): Item["type"] {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType === "application/pdf") {
    return "pdf";
  }

  return "file";
}

function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Dashboard() {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");

  const [uploading, setUploading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);

  const [uploadMessage, setUploadMessage] =
    useState("");

  const [storageUsed, setStorageUsed] =
    useState(0);

  const [storageLimit, setStorageLimit] =
    useState(30 * 1024 * 1024 * 1024);

  const [openMenu, setOpenMenu] =
    useState<string | null>(null);

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const [renameId, setRenameId] =
    useState<string | null>(null);

  const [renameName, setRenameName] =
    useState("");

  const [renaming, setRenaming] =
    useState(false);

  const input = useRef<HTMLInputElement>(null);

  // --------------------------------
  // LOAD FILES
  // --------------------------------

  async function loadFiles() {
    try {
      setLoadingFiles(true);

      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return;
      }

      // Load storage information
      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select(
          "storage_used_bytes, storage_limit_bytes"
        )
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error(
          "Profile loading error:",
          profileError
        );
      }

      if (profile) {
        setStorageUsed(
          Number(
            profile.storage_used_bytes || 0
          )
        );

        setStorageLimit(
          Number(
            profile.storage_limit_bytes ||
              30 * 1024 * 1024 * 1024
          )
        );
      }

      // Load real files
      const {
        data: files,
        error: filesError,
      } = await supabase
        .from("files")
        .select(
          "id, name, size_bytes, mime_type, created_at"
        )
        .eq("user_id", user.id)
        .eq("is_deleted", false)
        .order("created_at", {
          ascending: false,
        });

      if (filesError) {
        console.error(
          "Files loading error:",
          filesError
        );

        setUploadMessage(
          "Unable to load your files."
        );

        return;
      }

      const formattedFiles: Item[] = (
        files || []
      ).map((file) => ({
        id: file.id,
        name: file.name,
        type: getFileTypeFromMime(
          file.mime_type || ""
        ),
        size: formatSize(
          Number(file.size_bytes || 0)
        ),
        date: formatDate(file.created_at),
        sizeBytes: Number(
          file.size_bytes || 0
        ),
      }));

      setItems(formattedFiles);
    } catch (error) {
      console.error(
        "Load files error:",
        error
      );

      setUploadMessage(
        "Unable to load your files."
      );
    } finally {
      setLoadingFiles(false);
    }
  }

  useEffect(() => {
    loadFiles();
  }, []);

  // --------------------------------
  // DOWNLOAD
  // --------------------------------

  async function downloadFile(
    fileId: string
  ) {
    try {
      setOpenMenu(null);

      setUploadMessage(
        "Preparing download..."
      );

      const response = await fetch(
        "/api/files/download-url",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            fileId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to prepare download."
        );
      }

      window.location.href =
        data.downloadUrl;

      setUploadMessage(
        "Download started."
      );
    } catch (error) {
      console.error(
        "Download error:",
        error
      );

      setUploadMessage(
        error instanceof Error
          ? error.message
          : "Unable to download file."
      );
    }
  }

  // --------------------------------
  // DELETE
  // --------------------------------

  async function deleteFile(
    fileId: string
  ) {
    const file = items.find(
      (item) => item.id === fileId
    );

    if (!file) {
      return;
    }

    setOpenMenu(null);

    const confirmed =
      window.confirm(
        `Delete "${file.name}" permanently?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(fileId);

      setUploadMessage(
        "Deleting file..."
      );

      const response = await fetch(
        "/api/files/delete",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            fileId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to delete file."
        );
      }

      // Remove from current UI
      setItems((previous) =>
        previous.filter(
          (item) =>
            item.id !== fileId
        )
      );

      // Update storage display
      setStorageUsed((previous) =>
        Math.max(
          0,
          previous - file.sizeBytes
        )
      );

      setUploadMessage(
        `"${file.name}" deleted successfully.`
      );
    } catch (error) {
      console.error(
        "Delete error:",
        error
      );

      setUploadMessage(
        error instanceof Error
          ? error.message
          : "Unable to delete file."
      );
    } finally {
      setDeletingId(null);
    }
  }

  // --------------------------------
  // OPEN RENAME WINDOW
  // --------------------------------

  function openRename(
    fileId: string,
    currentName: string
  ) {
    setOpenMenu(null);
    setRenameId(fileId);
    setRenameName(currentName);
  }

  // --------------------------------
  // RENAME
  // --------------------------------

  async function renameFile() {
    if (
      !renameId ||
      !renameName.trim()
    ) {
      return;
    }

    const newName =
      renameName.trim();

    const file = items.find(
      (item) =>
        item.id === renameId
    );

    if (!file) {
      return;
    }

    if (newName === file.name) {
      setRenameId(null);
      setRenameName("");
      return;
    }

    try {
      setRenaming(true);

      const supabase =
        createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error(
          "You must be logged in."
        );
      }

      const {
        error,
      } = await supabase
        .from("files")
        .update({
          name: newName,
        })
        .eq("id", renameId)
        .eq("user_id", user.id);

      if (error) {
        throw new Error(
          error.message
        );
      }

      setItems((previous) =>
        previous.map((item) =>
          item.id === renameId
            ? {
                ...item,
                name: newName,
              }
            : item
        )
      );

      setRenameId(null);
      setRenameName("");

      setUploadMessage(
        "File renamed successfully."
      );
    } catch (error) {
      console.error(
        "Rename error:",
        error
      );

      setUploadMessage(
        error instanceof Error
          ? error.message
          : "Unable to rename file."
      );
    } finally {
      setRenaming(false);
    }
  }

  // --------------------------------
  // UPLOAD
  // --------------------------------

  async function uploadFiles(
    list: FileList | null
  ) {
    if (
      !list ||
      list.length === 0
    ) {
      return;
    }

    setUploading(true);
    setUploadMessage("");

    try {
      for (const file of Array.from(
        list
      )) {
        // Ask server for signed R2 URL
        const response = await fetch(
          "/api/files/upload-url",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              name: file.name,
              size: file.size,
              mimeType: file.type,
            }),
          }
        );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to prepare upload."
          );
        }

        // Upload directly to R2
        const uploadResponse =
          await fetch(
            data.uploadUrl,
            {
              method: "PUT",
              headers: {
                "Content-Type":
                  file.type ||
                  "application/octet-stream",
              },
              body: file,
            }
          );

        if (!uploadResponse.ok) {
          throw new Error(
            `Upload failed for ${file.name}.`
          );
        }

        // Save metadata in Supabase
        const supabase =
          createClient();

        const {
          data: { user },
        } =
          await supabase.auth.getUser();

        if (!user) {
          throw new Error(
            "You must be logged in."
          );
        }

        const {
          data: savedFile,
          error: saveError,
        } =
          await supabase
            .from("files")
            .insert({
              user_id: user.id,
              name: file.name,
              storage_key:
                data.storageKey,
              size_bytes:
                file.size,
              mime_type:
                file.type ||
                "application/octet-stream",
            })
            .select("id")
            .single();

        if (
          saveError ||
          !savedFile
        ) {
          throw new Error(
            saveError?.message ||
              "Unable to save file information."
          );
        }
      }

      setUploadMessage(
        list.length === 1
          ? "File uploaded successfully."
          : "Files uploaded successfully."
      );

      await loadFiles();
    } catch (error) {
      console.error(
        "Upload error:",
        error
      );

      setUploadMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong during upload."
      );
    } finally {
      setUploading(false);

      if (input.current) {
        input.current.value = "";
      }
    }
  }

  // --------------------------------
  // SIGN OUT
  // --------------------------------

  async function out() {
    await createClient()
      .auth
      .signOut();
  }

  // --------------------------------
  // SEARCH
  // --------------------------------

  const shown = items.filter(
    (item) =>
      item.name
        .toLowerCase()
        .includes(
          q.toLowerCase()
        )
  );

  // --------------------------------
  // STORAGE
  // --------------------------------

  const usedPercent =
    storageLimit > 0
      ? Math.min(
          (storageUsed /
            storageLimit) *
            100,
          100
        )
      : 0;

  const freeSpace =
    Math.max(
      storageLimit -
        storageUsed,
      0
    );

  // --------------------------------
  // UI
  // --------------------------------

  return (
    <div className="flex min-h-screen">
      {/* SIDEBAR */}

      <aside className="hidden md:flex w-[250px] bg-white border-r flex-col p-5">
        <div className="flex items-center gap-2 mb-9">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white grid place-items-center">
            <Cloud />
          </div>

          <b className="text-xl">
            CloudX
          </b>
        </div>

        <button
          onClick={() =>
            input.current?.click()
          }
          disabled={uploading}
          className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold flex justify-center gap-2 disabled:opacity-60"
        >
          <Upload size={18} />

          {uploading
            ? "Uploading..."
            : "Upload"}
        </button>

        <nav className="mt-6 space-y-1 text-sm">
          {[
            "My Files",
            "Starred",
            "Recent",
            "Trash",
          ].map((x, i) => (
            <button
              key={x}
              className={
                "w-full flex gap-3 px-3 py-2.5 rounded-xl " +
                (i === 0
                  ? "bg-indigo-50 text-indigo-700 font-semibold"
                  : "text-gray-600")
              }
            >
              {i === 0 ? (
                <HardDrive
                  size={18}
                />
              ) : i === 1 ? (
                <Star size={18} />
              ) : i === 2 ? (
                <Clock3
                  size={18}
                />
              ) : (
                <Trash2
                  size={18}
                />
              )}

              {x}
            </button>
          ))}
        </nav>

        <div className="mt-auto">
          <div className="card p-4">
            <div className="flex gap-2">
              <ShieldCheck
                size={18}
                className="text-indigo-600"
              />

              <b className="text-sm">
                Private cloud
              </b>
            </div>

            <p className="text-xs text-gray-500 mt-2">
              30 GB free plan.
            </p>
          </div>

          <button
            onClick={out}
            className="mt-4 text-sm flex gap-2"
          >
            <Settings
              size={18}
            />

            Sign out
          </button>
        </div>
      </aside>

      {/* MAIN */}

      <main className="flex-1 p-5 md:p-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-sm text-gray-500">
              Welcome back
            </p>

            <h1 className="text-3xl font-bold">
              My Files
            </h1>
          </div>

          <div className="relative">
            <Search
              className="absolute left-3 top-2.5 text-gray-400"
              size={18}
            />

            <input
              value={q}
              onChange={(e) =>
                setQ(
                  e.target.value
                )
              }
              placeholder="Search files"
              className="bg-white border rounded-xl py-2.5 pl-10 pr-4 w-56"
            />
          </div>
        </header>

        {/* HIDDEN FILE INPUT */}

        <input
          ref={input}
          hidden
          type="file"
          multiple
          onChange={(e) =>
            uploadFiles(
              e.target.files
            )
          }
        />

        {/* MESSAGE */}

        {uploadMessage && (
          <div className="mb-5 rounded-xl bg-gray-50 border px-4 py-3 text-sm">
            {uploadMessage}
          </div>
        )}

        {/* STATS */}

        <section className="grid sm:grid-cols-3 gap-4 mb-7">
          <Stat
            title="Storage used"
            value={formatSize(
              storageUsed
            )}
            sub={`of ${formatSize(
              storageLimit
            )}`}
          />

          <Stat
            title="Files"
            value={String(
              items.length
            )}
            sub="in your cloud"
          />

          <Stat
            title="Free space"
            value={formatSize(
              freeSpace
            )}
            sub="available"
          />
        </section>

        {/* STORAGE */}

        <section className="card p-5 mb-7">
          <div className="flex justify-between mb-3">
            <div>
              <b>Storage</b>

              <p className="text-xs text-gray-500">
                30 GB free plan
              </p>
            </div>

            <b>
              {usedPercent.toFixed(
                1
              )}
              %
            </b>
          </div>

          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-2 bg-indigo-600 rounded-full"
              style={{
                width: `${usedPercent}%`,
              }}
            />
          </div>
        </section>

        {/* UPLOAD AREA */}

        <section
          className="upload rounded-2xl p-8 text-center mb-7 cursor-pointer"
          onClick={() =>
            input.current?.click()
          }
          onDragOver={(e) =>
            e.preventDefault()
          }
          onDrop={(e) => {
            e.preventDefault();

            uploadFiles(
              e.dataTransfer.files
            );
          }}
        >
          <Upload className="mx-auto text-indigo-600 mb-3" />

          <b>
            {uploading
              ? "Uploading your files..."
              : "Drop files here to upload"}
          </b>

          <p className="text-sm text-gray-500 mt-1">
            Choose files from your device
          </p>
        </section>

        {/* FILE LIST */}

        <section className="card overflow-hidden">
          <div className="px-5 py-4 border-b flex justify-between">
            <b>Recent files</b>

            <span className="text-sm text-indigo-600">
              {shown.length} files
            </span>
          </div>

          {loadingFiles ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">
              Loading your files...
            </div>
          ) : shown.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">
              {q
                ? "No files found."
                : "You haven't uploaded any files yet."}
            </div>
          ) : (
            shown.map((f) => (
              <div
                key={f.id}
                className="px-5 py-4 flex items-center gap-4 border-b last:border-0"
              >
                {/* ICON */}

                <div className="w-10 h-10 rounded-xl bg-gray-50 grid place-items-center">
                  <TypeIcon
                    type={f.type}
                  />
                </div>

                {/* FILE INFO */}

                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {f.name}
                  </p>

                  <p className="text-xs text-gray-400">
                    {f.size} ·{" "}
                    {f.date}
                  </p>
                </div>

                {/* OPTIONS */}

                <div className="relative">
                  <button
                    onClick={() =>
                      setOpenMenu(
                        openMenu ===
                          f.id
                          ? null
                          : f.id
                      )
                    }
                    disabled={
                      deletingId ===
                      f.id
                    }
                    className="text-gray-400 hover:text-indigo-600 p-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    title="File options"
                  >
                    <MoreHorizontal
                      size={20}
                    />
                  </button>

                  {openMenu ===
                    f.id && (
                    <div className="absolute right-0 top-11 z-50 w-48 bg-white border rounded-xl shadow-lg py-1">
                      {/* DOWNLOAD */}

                      <button
                        onClick={() =>
                          downloadFile(
                            f.id
                          )
                        }
                        className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-gray-50"
                      >
                        <Download
                          size={16}
                        />

                        Download
                      </button>

                      {/* RENAME */}

                      <button
                        onClick={() =>
                          openRename(
                            f.id,
                            f.name
                          )
                        }
                        className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-gray-50"
                      >
                        <Pencil
                          size={16}
                        />

                        Rename
                      </button>

                      {/* DELETE */}

                      <button
                        onClick={() =>
                          deleteFile(
                            f.id
                          )
                        }
                        disabled={
                          deletingId ===
                          f.id
                        }
                        className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2
                          size={16}
                        />

                        {deletingId ===
                        f.id
                          ? "Deleting..."
                          : "Delete"}
                      </button>

                      <div className="border-t my-1" />

                      {/* CANCEL */}

                      <button
                        onClick={() =>
                          setOpenMenu(
                            null
                          )
                        }
                        className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-gray-50"
                      >
                        <X
                          size={16}
                        />

                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </section>

        {/* AI */}

        <section className="mt-7 rounded-2xl bg-indigo-600 text-white p-6 flex gap-3">
          <Sparkles />

          <div>
            <b>Ask your cloud</b>

            <p className="text-sm text-indigo-100">
              AI search will connect
              after real storage is
              live.
            </p>
          </div>
        </section>

        {/* RENAME MODAL */}

        {renameId && (
          <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold">
                  Rename file
                </h2>

                <button
                  onClick={() => {
                    setRenameId(
                      null
                    );

                    setRenameName(
                      ""
                    );
                  }}
                  className="p-2 rounded-lg hover:bg-gray-100"
                  title="Close"
                >
                  <X size={20} />
                </button>
              </div>

              <label className="text-sm font-medium text-gray-700">
                File name
              </label>

              <input
                autoFocus
                value={renameName}
                onChange={(e) =>
                  setRenameName(
                    e.target.value
                  )
                }
                onKeyDown={(e) => {
                  if (
                    e.key ===
                    "Enter"
                  ) {
                    renameFile();
                  }

                  if (
                    e.key ===
                    "Escape"
                  ) {
                    setRenameId(
                      null
                    );

                    setRenameName(
                      ""
                    );
                  }
                }}
                className="w-full mt-2 border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setRenameId(
                      null
                    );

                    setRenameName(
                      ""
                    );
                  }}
                  className="px-4 py-2.5 rounded-xl border hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  onClick={
                    renameFile
                  }
                  disabled={
                    renaming ||
                    !renameName.trim()
                  }
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50"
                >
                  {renaming
                    ? "Saving..."
                    : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="card p-5">
      <p className="text-sm text-gray-500">
        {title}
      </p>

      <b className="text-2xl">
        {value}
      </b>

      <p className="text-xs text-gray-400">
        {sub}
      </p>
    </div>
  );
}