"use client";

import { useEffect, useRef, useState } from "react";
import {
  Cloud,
  Upload,
  Search,
  FileText,
  Image,
  Video,
  File as FileIcon,
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
  RotateCcw,
} from "lucide-react";

import { createClient } from "../lib/supabase-browser";

type Section = "files" | "starred" | "recent" | "trash";

type Item = {
  id: string;
  name: string;
  type: "pdf" | "image" | "video" | "file";
  size: string;
  date: string;
  createdAt: string;
  sizeBytes: number;
  isStarred: boolean;
  isDeleted: boolean;
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

  return <FileIcon className="text-gray-500" />;
}

function getFileTypeFromMime(mimeType: string): Item["type"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";

  return "file";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;

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
  const [section, setSection] = useState<Section>("files");

  const [q, setQ] = useState("");

  const [uploading, setUploading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);

  const [message, setMessage] = useState("");

  const [storageUsed, setStorageUsed] = useState(0);
  const [storageLimit, setStorageLimit] =
    useState(30 * 1024 * 1024 * 1024);

  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [processingId, setProcessingId] =
    useState<string | null>(null);

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

      if (!user) return;

      const { data: profile, error: profileError } =
        await supabase
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
          Number(profile.storage_used_bytes || 0)
        );

        setStorageLimit(
          Number(
            profile.storage_limit_bytes ||
              30 * 1024 * 1024 * 1024
          )
        );
      }

      const { data: files, error: filesError } =
        await supabase
          .from("files")
          .select(
            "id, name, size_bytes, mime_type, created_at, is_starred, is_deleted"
          )
          .eq("user_id", user.id)
          .order("created_at", {
            ascending: false,
          });

      if (filesError) {
        throw new Error(filesError.message);
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
        createdAt: file.created_at,
        sizeBytes: Number(
          file.size_bytes || 0
        ),
        isStarred: Boolean(file.is_starred),
        isDeleted: Boolean(file.is_deleted),
      }));

      setItems(formattedFiles);
    } catch (error) {
      console.error(
        "Load files error:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load your files."
      );
    } finally {
      setLoadingFiles(false);
    }
  }

  useEffect(() => {
    loadFiles();
  }, []);

  // --------------------------------
  // UPLOAD
  // --------------------------------

  async function uploadFiles(
    list: FileList | null
  ) {
    if (!list || list.length === 0) return;

    setUploading(true);
    setMessage("");

    try {
      for (const file of Array.from(list)) {
        const response = await fetch(
          "/api/files/upload-url",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: file.name,
              size: file.size,
              mimeType: file.type,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to prepare upload."
          );
        }

        const uploadResponse = await fetch(
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

        const supabase = createClient();

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          throw new Error(
            "You must be logged in."
          );
        }

        const { error } =
          await supabase
            .from("files")
            .insert({
              user_id: user.id,
              name: file.name,
              storage_key: data.storageKey,
              size_bytes: file.size,
              mime_type:
                file.type ||
                "application/octet-stream",
              is_starred: false,
              is_deleted: false,
            });

        if (error) {
          throw new Error(error.message);
        }
      }

      setMessage(
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

      setMessage(
        error instanceof Error
          ? error.message
          : "Upload failed."
      );
    } finally {
      setUploading(false);

      if (input.current) {
        input.current.value = "";
      }
    }
  }

  // --------------------------------
  // DOWNLOAD
  // --------------------------------

  async function downloadFile(
    fileId: string
  ) {
    try {
      setOpenMenu(null);
      setMessage(
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

      setMessage(
        "Download started."
      );
    } catch (error) {
      console.error(
        "Download error:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to download file."
      );
    }
  }

  // --------------------------------
  // STAR
  // --------------------------------

  async function toggleStar(
    fileId: string
  ) {
    const file = items.find(
      (item) => item.id === fileId
    );

    if (!file) return;

    try {
      setOpenMenu(null);
      setProcessingId(fileId);

      const supabase = createClient();

      const { error } =
        await supabase
          .from("files")
          .update({
            is_starred:
              !file.isStarred,
          })
          .eq("id", fileId)
          .eq("user_id", (
            await supabase.auth.getUser()
          ).data.user?.id);

      if (error) {
        throw new Error(error.message);
      }

      setItems((previous) =>
        previous.map((item) =>
          item.id === fileId
            ? {
                ...item,
                isStarred:
                  !item.isStarred,
              }
            : item
        )
      );

      setMessage(
        file.isStarred
          ? `"${file.name}" removed from Starred.`
          : `"${file.name}" added to Starred.`
      );
    } catch (error) {
      console.error(
        "Star error:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update Starred."
      );
    } finally {
      setProcessingId(null);
    }
  }

  // --------------------------------
  // MOVE TO TRASH
  // --------------------------------

  async function moveToTrash(
    fileId: string
  ) {
    const file = items.find(
      (item) => item.id === fileId
    );

    if (!file) return;

    const confirmed =
      window.confirm(
        `Move "${file.name}" to Trash?`
      );

    if (!confirmed) return;

    try {
      setOpenMenu(null);
      setProcessingId(fileId);

      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error(
          "You must be logged in."
        );
      }

      const { error } =
        await supabase
          .from("files")
          .update({
            is_deleted: true,
            deleted_at:
              new Date().toISOString(),
          })
          .eq("id", fileId)
          .eq("user_id", user.id);

      if (error) {
        throw new Error(error.message);
      }

      setItems((previous) =>
        previous.map((item) =>
          item.id === fileId
            ? {
                ...item,
                isDeleted: true,
              }
            : item
        )
      );

      setMessage(
        `"${file.name}" moved to Trash.`
      );
    } catch (error) {
      console.error(
        "Trash error:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to move file to Trash."
      );
    } finally {
      setProcessingId(null);
    }
  }

  // --------------------------------
  // RESTORE
  // --------------------------------

  async function restoreFile(
    fileId: string
  ) {
    const file = items.find(
      (item) => item.id === fileId
    );

    if (!file) return;

    try {
      setOpenMenu(null);
      setProcessingId(fileId);

      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error(
          "You must be logged in."
        );
      }

      const { error } =
        await supabase
          .from("files")
          .update({
            is_deleted: false,
            deleted_at: null,
          })
          .eq("id", fileId)
          .eq("user_id", user.id);

      if (error) {
        throw new Error(error.message);
      }

      setItems((previous) =>
        previous.map((item) =>
          item.id === fileId
            ? {
                ...item,
                isDeleted: false,
              }
            : item
        )
      );

      setMessage(
        `"${file.name}" restored.`
      );
    } catch (error) {
      console.error(
        "Restore error:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to restore file."
      );
    } finally {
      setProcessingId(null);
    }
  }

  // --------------------------------
  // PERMANENT DELETE
  // --------------------------------

  async function permanentlyDelete(
    fileId: string
  ) {
    const file = items.find(
      (item) => item.id === fileId
    );

    if (!file) return;

    const confirmed =
      window.confirm(
        `Permanently delete "${file.name}"? This cannot be undone.`
      );

    if (!confirmed) return;

    try {
      setOpenMenu(null);
      setProcessingId(fileId);

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
            permanent: true,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to permanently delete file."
        );
      }

      setItems((previous) =>
        previous.filter(
          (item) =>
            item.id !== fileId
        )
      );

      setStorageUsed((previous) =>
        Math.max(
          0,
          previous - file.sizeBytes
        )
      );

      setMessage(
        `"${file.name}" permanently deleted.`
      );
    } catch (error) {
      console.error(
        "Permanent delete error:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to permanently delete file."
      );
    } finally {
      setProcessingId(null);
    }
  }

  // --------------------------------
  // RENAME
  // --------------------------------

  function openRename(
    fileId: string,
    name: string
  ) {
    setOpenMenu(null);
    setRenameId(fileId);
    setRenameName(name);
  }

  async function renameFile() {
    if (
      !renameId ||
      !renameName.trim()
    ) {
      return;
    }

    const file = items.find(
      (item) =>
        item.id === renameId
    );

    if (!file) return;

    const newName =
      renameName.trim();

    if (newName === file.name) {
      setRenameId(null);
      setRenameName("");
      return;
    }

    try {
      setRenaming(true);

      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error(
          "You must be logged in."
        );
      }

      const { error } =
        await supabase
          .from("files")
          .update({
            name: newName,
          })
          .eq("id", renameId)
          .eq("user_id", user.id);

      if (error) {
        throw new Error(error.message);
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

      setMessage(
        "File renamed successfully."
      );
    } catch (error) {
      console.error(
        "Rename error:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to rename file."
      );
    } finally {
      setRenaming(false);
    }
  }

  // --------------------------------
  // SIGN OUT
  // --------------------------------

  async function signOut() {
    await createClient()
      .auth
      .signOut();
  }

  // --------------------------------
  // FILTERS
  // --------------------------------

  const filteredItems = items.filter(
    (item) => {
      const matchesSearch =
        item.name
          .toLowerCase()
          .includes(
            q.toLowerCase()
          );

      if (!matchesSearch) {
        return false;
      }

      if (section === "files") {
        return !item.isDeleted;
      }

      if (section === "starred") {
        return (
          !item.isDeleted &&
          item.isStarred
        );
      }

      if (section === "recent") {
        return !item.isDeleted;
      }

      if (section === "trash") {
        return item.isDeleted;
      }

      return true;
    }
  );

  const activeItems =
    section === "recent"
      ? [...filteredItems]
          .sort(
            (a, b) =>
              new Date(
                b.createdAt
              ).getTime() -
              new Date(
                a.createdAt
              ).getTime()
          )
          .slice(0, 20)
      : filteredItems;

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

  const trashCount =
    items.filter(
      (item) =>
        item.isDeleted
    ).length;

  const starredCount =
    items.filter(
      (item) =>
        item.isStarred &&
        !item.isDeleted
    ).length;

  const sectionTitle =
    section === "files"
      ? "My Files"
      : section === "starred"
      ? "Starred"
      : section === "recent"
      ? "Recent"
      : "Trash";

  return (
    <div className="flex min-h-screen bg-gray-50">

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

          <SidebarButton
            icon={
              <HardDrive size={18} />
            }
            label="My Files"
            active={
              section === "files"
            }
            onClick={() =>
              setSection("files")
            }
          />

          <SidebarButton
            icon={
              <Star size={18} />
            }
            label={
              starredCount
                ? `Starred (${starredCount})`
                : "Starred"
            }
            active={
              section === "starred"
            }
            onClick={() =>
              setSection("starred")
            }
          />

          <SidebarButton
            icon={
              <Clock3 size={18} />
            }
            label="Recent"
            active={
              section === "recent"
            }
            onClick={() =>
              setSection("recent")
            }
          />

          <SidebarButton
            icon={
              <Trash2 size={18} />
            }
            label={
              trashCount
                ? `Trash (${trashCount})`
                : "Trash"
            }
            active={
              section === "trash"
            }
            onClick={() =>
              setSection("trash")
            }
          />

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
            onClick={signOut}
            className="mt-4 text-sm flex gap-2 hover:text-indigo-600"
          >
            <Settings size={18} />
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
              {sectionTitle}
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
                setQ(e.target.value)
              }
              placeholder="Search files"
              className="bg-white border rounded-xl py-2.5 pl-10 pr-4 w-56 outline-none focus:ring-2 focus:ring-indigo-500"
            />

          </div>

        </header>

        {/* FILE INPUT */}

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

        {message && (
          <div className="mb-5 rounded-xl bg-white border px-4 py-3 text-sm">
            {message}
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
              items.filter(
                (item) =>
                  !item.isDeleted
              ).length
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

              <p className="text-xs text-gray-500 mt-1">
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
                width:
                  `${usedPercent}%`,
              }}
            />

          </div>

        </section>

        {/* UPLOAD AREA */}

        {section !== "trash" && (
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
        )}

        {/* FILE LIST */}

        <section className="card overflow-visible">

          <div className="px-5 py-4 border-b flex justify-between">

            <b>
              {section === "trash"
                ? "Deleted files"
                : section === "starred"
                ? "Starred files"
                : section === "recent"
                ? "Recent files"
                : "All files"}
            </b>

            <span className="text-sm text-indigo-600">
              {activeItems.length} files
            </span>

          </div>

          {loadingFiles ? (

            <div className="px-5 py-10 text-center text-sm text-gray-500">
              Loading your files...
            </div>

          ) : activeItems.length === 0 ? (

            <div className="px-5 py-12 text-center">

              <HardDrive className="mx-auto text-gray-300 mb-3" />

              <p className="text-sm text-gray-500">

                {q
                  ? "No files found."
                  : section === "starred"
                  ? "You haven't starred any files."
                  : section === "trash"
                  ? "Trash is empty."
                  : "You haven't uploaded any files yet."}

              </p>

            </div>

          ) : (

            activeItems.map((f) => (

              <div
                key={f.id}
                className="px-5 py-4 flex items-center gap-4 border-b last:border-0"
              >

                {/* ICON */}

                <div className="w-10 h-10 rounded-xl bg-gray-50 grid place-items-center shrink-0">

                  <TypeIcon
                    type={f.type}
                  />

                </div>

                {/* FILE INFO */}

                <div className="flex-1 min-w-0">

                  <div className="flex items-center gap-2">

                    <p className="font-medium truncate">
                      {f.name}
                    </p>

                    {f.isStarred &&
                      !f.isDeleted && (
                        <Star
                          size={14}
                          className="fill-current text-yellow-500 shrink-0"
                        />
                      )}

                  </div>

                  <p className="text-xs text-gray-400">
                    {f.size} ·{" "}
                    {f.date}
                  </p>

                </div>

                {/* OPTIONS */}

                <div className="relative shrink-0">

                  <button
                    onClick={() =>
                      setOpenMenu(
                        openMenu === f.id
                          ? null
                          : f.id
                      )
                    }
                    disabled={
                      processingId ===
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

                    /*
                     * IMPORTANT:
                     * bottom-11 makes the menu open ABOVE
                     * the three-dot button.
                     */

                    <div className="absolute right-0 bottom-11 z-[200] w-52 bg-white border rounded-xl shadow-xl py-1">

                      {f.isDeleted ? (

                        <>
                          <button
                            onClick={() =>
                              restoreFile(
                                f.id
                              )
                            }
                            className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-gray-50"
                          >
                            <RotateCcw
                              size={16}
                            />
                            Restore
                          </button>

                          <button
                            onClick={() =>
                              permanentlyDelete(
                                f.id
                              )
                            }
                            className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 text-red-600 hover:bg-red-50"
                          >
                            <Trash2
                              size={16}
                            />
                            Delete permanently
                          </button>
                        </>

                      ) : (

                        <>
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

                          <button
                            onClick={() =>
                              toggleStar(
                                f.id
                              )
                            }
                            className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-gray-50"
                          >
                            <Star
                              size={16}
                              className={
                                f.isStarred
                                  ? "fill-current text-yellow-500"
                                  : ""
                              }
                            />

                            {f.isStarred
                              ? "Unstar"
                              : "Star"}
                          </button>

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

                          <button
                            onClick={() =>
                              moveToTrash(
                                f.id
                              )
                            }
                            className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 text-red-600 hover:bg-red-50"
                          >
                            <Trash2
                              size={16}
                            />
                            Move to Trash
                          </button>
                        </>

                      )}

                      <div className="border-t my-1" />

                      <button
                        onClick={() =>
                          setOpenMenu(
                            null
                          )
                        }
                        className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-gray-50"
                      >
                        <X size={16} />
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
            <b>
              Ask your cloud
            </b>

            <p className="text-sm text-indigo-100 mt-1">
              AI search and document
              Q&A will be connected
              in the next feature stage.
            </p>
          </div>

        </section>

        {/* RENAME MODAL */}

        {renameId && (

          <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4">

            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">

              <div className="flex items-center justify-between mb-5">

                <h2 className="text-xl font-bold">
                  Rename file
                </h2>

                <button
                  onClick={() => {
                    setRenameId(null);
                    setRenameName("");
                  }}
                  className="p-2 rounded-lg hover:bg-gray-100"
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
                    e.key === "Enter"
                  ) {
                    renameFile();
                  }

                  if (
                    e.key === "Escape"
                  ) {
                    setRenameId(null);
                    setRenameName("");
                  }

                }}
                className="w-full mt-2 border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <div className="flex justify-end gap-3 mt-6">

                <button
                  onClick={() => {
                    setRenameId(null);
                    setRenameName("");
                  }}
                  className="px-4 py-2.5 rounded-xl border hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  onClick={renameFile}
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

function SidebarButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "w-full flex gap-3 items-center px-3 py-2.5 rounded-xl transition " +
        (active
          ? "bg-indigo-50 text-indigo-700 font-semibold"
          : "text-gray-600 hover:bg-gray-50")
      }
    >
      {icon}
      {label}
    </button>
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