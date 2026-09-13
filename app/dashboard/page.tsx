"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckSquare,
  Clock3,
  Cloud,
  Download,
  Eye,
  File as FileIcon,
  FileText,
  Files,
  HardDrive,
  Image as ImageIcon,
  LogOut,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";

import { createClient } from "../../lib/supabase-browser";

const supabase = createClient();

type Section =
  | "files"
  | "starred"
  | "recent"
  | "trash";

type FileItem = {
  id: string;
  name: string;
  type: string;
  size: string;
  sizeBytes: number;
  createdAt: string;
  isStarred: boolean;
  isDeleted: boolean;
};

type PreviewFile = {
  name: string;
  mimeType: string;
  url: string;
};

const MAX_FILE_SIZE =
  5 * 1024 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB",
  ];

  const index = Math.min(
    Math.floor(
      Math.log(bytes) / Math.log(1024)
    ),
    units.length - 1
  );

  return `${(
    bytes / Math.pow(1024, index)
  ).toFixed(index === 0 ? 0 : 1)} ${
    units[index]
  }`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return ImageIcon;
  }

  if (mimeType.startsWith("video/")) {
    return Video;
  }

  if (mimeType.includes("pdf")) {
    return FileText;
  }

  return FileIcon;
}

function isPreviewable(mimeType: string) {
  return (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("video/")
  );
}

export default function Dashboard() {
  const [files, setFiles] =
    useState<FileItem[]>([]);

  const [section, setSection] =
    useState<Section>("files");

  const [search, setSearch] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [uploading, setUploading] =
    useState(false);

  const [storageUsed, setStorageUsed] =
    useState(0);

  const [storageLimit, setStorageLimit] =
    useState(
      30 * 1024 * 1024 * 1024
    );

  const [selectedIds, setSelectedIds] =
    useState<string[]>([]);

  const [menuId, setMenuId] =
    useState<string | null>(null);

  const [renameFile, setRenameFile] =
    useState<FileItem | null>(null);

  const [renameValue, setRenameValue] =
    useState("");

  const [previewFile, setPreviewFile] =
    useState<PreviewFile | null>(null);

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  /* =========================================================
     LOAD FILES
  ========================================================= */

  const loadFiles = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/";
        return;
      }

      const {
        data: fileData,
        error: fileError,
      } = await supabase
        .from("files")
        .select(
          "id, name, mime_type, size_bytes, created_at, is_starred, is_deleted"
        )
        .eq("user_id", user.id)
        .order("created_at", {
          ascending: false,
        });

      if (fileError) {
        throw new Error(
          fileError.message
        );
      }

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
        console.error(profileError);
      }

      const formattedFiles: FileItem[] =
        (fileData || []).map((file) => ({
          id: file.id,
          name: file.name,
          type: file.mime_type || "",
          size: formatBytes(
            Number(
              file.size_bytes || 0
            )
          ),
          sizeBytes: Number(
            file.size_bytes || 0
          ),
          createdAt: file.created_at,
          isStarred: Boolean(
            file.is_starred
          ),
          isDeleted: Boolean(
            file.is_deleted
          ),
        }));

      setFiles(formattedFiles);

      if (profile) {
        setStorageUsed(
          Number(
            profile.storage_used_bytes ||
              0
          )
        );

        setStorageLimit(
          Number(
            profile.storage_limit_bytes ||
              30 *
                1024 *
                1024 *
                1024
          )
        );
      }
    } catch (error) {
      console.error(
        "Load files error:",
        error
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  /* =========================================================
     UPLOAD
  ========================================================= */

  const uploadFiles = async (
    selectedFiles: FileList | File[]
  ) => {
    const list =
      Array.from(selectedFiles);

    if (list.length === 0) {
      return;
    }

    try {
      setUploading(true);

      for (const file of list) {
        if (
          file.size > MAX_FILE_SIZE
        ) {
          alert(
            `${file.name} is larger than the 5 GB maximum.`
          );
          continue;
        }

        const {
          data: { user },
        } =
          await supabase.auth.getUser();

        if (!user) {
          throw new Error(
            "You are not logged in."
          );
        }

        const response =
          await fetch(
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

        let data: {
          url?: string;
          uploadUrl?: string;
          signedUrl?: string;
          key?: string;
          storageKey?: string;
          storage_key?: string;
          error?: string;
        };

        try {
          data =
            await response.json();
        } catch {
          throw new Error(
            "The upload server returned an invalid response."
          );
        }

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to create upload URL."
          );
        }

        /*
         * Get the signed upload URL.
         *
         * The current API returns:
         * {
         *   uploadUrl: "...",
         *   storageKey: "..."
         * }
         */

        const uploadUrl =
          data.uploadUrl ||
          data.url ||
          data.signedUrl;

        if (!uploadUrl) {
          console.error(
            "Upload URL response:",
            data
          );

          throw new Error(
            "Upload URL was not returned by the server."
          );
        }

        /*
         * Upload directly to Cloudflare R2.
         */

        const uploadResponse =
          await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type":
                file.type ||
                "application/octet-stream",
            },
            body: file,
          });

        if (!uploadResponse.ok) {
          throw new Error(
            `Upload failed for ${file.name}.`
          );
        }

        /*
         * The API returns storageKey.
         */

        const storageKey =
          data.storageKey ||
          data.key ||
          data.storage_key;

        if (!storageKey) {
          console.error(
            "Storage key response:",
            data
          );

          throw new Error(
            "Storage key was not returned by the server."
          );
        }

        /*
         * Save the file metadata in Supabase.
         */

        const {
          error: dbError,
        } = await supabase
          .from("files")
          .insert({
            user_id: user.id,
            name: file.name,
            storage_key: storageKey,
            size_bytes: file.size,
            mime_type:
              file.type ||
              "application/octet-stream",
          });

        if (dbError) {
          throw new Error(
            "File uploaded but could not be saved."
          );
        }
      }

      await loadFiles();
    } catch (error) {
      console.error(
        "Upload error:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Upload failed."
      );
    } finally {
      setUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value =
          "";
      }
    }
  };

  const handleFileInput = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (event.target.files) {
      uploadFiles(
        event.target.files
      );
    }
  };

  const handleDrop = (
    event: React.DragEvent<HTMLDivElement>
  ) => {
    event.preventDefault();

    if (event.dataTransfer.files) {
      uploadFiles(
        event.dataTransfer.files
      );
    }
  };

  /* =========================================================
     DOWNLOAD
  ========================================================= */

  const handleDownload = async (
    file: FileItem
  ) => {
    try {
      const response =
        await fetch(
          "/api/files/download-url",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              fileId: file.id,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to download file."
        );
      }

      const url =
        data.url ||
        data.downloadUrl ||
        data.signedUrl;

      if (!url) {
        throw new Error(
          "Download URL was not returned."
        );
      }

      const link =
        document.createElement("a");

      link.href = url;
      link.download = file.name;
      link.target = "_blank";
      link.rel =
        "noopener noreferrer";

      document.body.appendChild(link);
      link.click();
      link.remove();

      setMenuId(null);
    } catch (error) {
      console.error(
        "Download error:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Unable to download file."
      );
    }
  };

  /* =========================================================
     PREVIEW
  ========================================================= */

  const handlePreview = async (
    file: FileItem
  ) => {
    if (!isPreviewable(file.type)) {
      await handleDownload(file);
      return;
    }

    try {
      setMenuId(null);

      const response =
        await fetch(
          "/api/files/download-url",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              fileId: file.id,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to preview file."
        );
      }

      const url =
        data.url ||
        data.downloadUrl ||
        data.signedUrl;

      if (!url) {
        throw new Error(
          "Preview URL was not returned."
        );
      }

      setPreviewFile({
        name: file.name,
        mimeType: file.type,
        url,
      });
    } catch (error) {
      console.error(
        "Preview error:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Unable to preview file."
      );
    }
  };

  /* =========================================================
     STAR
  ========================================================= */

  const toggleStar = async (
    file: FileItem
  ) => {
    try {
      const newValue =
        !file.isStarred;

      const { error } =
        await supabase
          .from("files")
          .update({
            is_starred: newValue,
          })
          .eq("id", file.id);

      if (error) {
        throw new Error(
          error.message
        );
      }

      setFiles((current) =>
        current.map((item) =>
          item.id === file.id
            ? {
                ...item,
                isStarred: newValue,
              }
            : item
        )
      );

      setMenuId(null);
    } catch (error) {
      console.error(
        "Star error:",
        error
      );

      alert(
        "Unable to update star."
      );
    }
  };

  /* =========================================================
     MOVE TO TRASH
  ========================================================= */

  const moveToTrash = async (
    file: FileItem
  ) => {
    try {
      const response =
        await fetch(
          "/api/files/delete",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              fileId: file.id,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to move file to Trash."
        );
      }

      setFiles((current) =>
        current.map((item) =>
          item.id === file.id
            ? {
                ...item,
                isDeleted: true,
              }
            : item
        )
      );

      setSelectedIds((current) =>
        current.filter(
          (id) => id !== file.id
        )
      );

      setMenuId(null);
    } catch (error) {
      console.error(
        "Trash error:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Unable to move file to Trash."
      );
    }
  };

  /* =========================================================
     RESTORE
  ========================================================= */

  const restoreFile = async (
    file: FileItem
  ) => {
    try {
      const { error } =
        await supabase
          .from("files")
          .update({
            is_deleted: false,
            deleted_at: null,
          })
          .eq("id", file.id);

      if (error) {
        throw new Error(
          error.message
        );
      }

      setFiles((current) =>
        current.map((item) =>
          item.id === file.id
            ? {
                ...item,
                isDeleted: false,
              }
            : item
        )
      );

      setMenuId(null);
    } catch (error) {
      console.error(
        "Restore error:",
        error
      );

      alert(
        "Unable to restore file."
      );
    }
  };

  /* =========================================================
     PERMANENT DELETE
  ========================================================= */

  const permanentlyDelete =
    async (file: FileItem) => {
      const confirmed =
        window.confirm(
          `Permanently delete "${file.name}"? This cannot be undone.`
        );

      if (!confirmed) {
        return;
      }

      try {
        const response =
          await fetch(
            "/api/files/delete",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                fileId: file.id,
                permanent: true,
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to permanently delete file."
          );
        }

        setFiles((current) =>
          current.filter(
            (item) =>
              item.id !== file.id
          )
        );

        setSelectedIds((current) =>
          current.filter(
            (id) => id !== file.id
          )
        );

        setStorageUsed(
          (current) =>
            Math.max(
              current -
                file.sizeBytes,
              0
            )
        );

        setMenuId(null);
      } catch (error) {
        console.error(
          "Permanent delete error:",
          error
        );

        alert(
          error instanceof Error
            ? error.message
            : "Unable to permanently delete file."
        );
      }
    };

  /* =========================================================
     RENAME
  ========================================================= */

  const openRename = (
    file: FileItem
  ) => {
    setRenameFile(file);
    setRenameValue(file.name);
    setMenuId(null);
  };

  const saveRename = async () => {
    if (!renameFile) {
      return;
    }

    const newName =
      renameValue.trim();

    if (!newName) {
      alert(
        "Please enter a file name."
      );
      return;
    }

    try {
      const { error } =
        await supabase
          .from("files")
          .update({
            name: newName,
          })
          .eq(
            "id",
            renameFile.id
          );

      if (error) {
        throw new Error(
          error.message
        );
      }

      setFiles((current) =>
        current.map((item) =>
          item.id === renameFile.id
            ? {
                ...item,
                name: newName,
              }
            : item
        )
      );

      setRenameFile(null);
      setRenameValue("");
    } catch (error) {
      console.error(
        "Rename error:",
        error
      );

      alert(
        "Unable to rename file."
      );
    }
  };

  /* =========================================================
     FILTERS
  ========================================================= */

  const activeFiles =
    files.filter(
      (file) => !file.isDeleted
    );

  const trashFiles =
    files.filter(
      (file) => file.isDeleted
    );

  const starredFiles =
    activeFiles.filter(
      (file) => file.isStarred
    );

  const recentFiles = [
    ...activeFiles,
  ]
    .sort(
      (a, b) =>
        new Date(
          b.createdAt
        ).getTime() -
        new Date(
          a.createdAt
        ).getTime()
    )
    .slice(0, 20);

  let visibleFiles: FileItem[] =
    activeFiles;

  if (section === "starred") {
    visibleFiles = starredFiles;
  }

  if (section === "recent") {
    visibleFiles = recentFiles;
  }

  if (section === "trash") {
    visibleFiles = trashFiles;
  }

  if (search.trim()) {
    const query =
      search.toLowerCase();

    visibleFiles =
      visibleFiles.filter(
        (file) =>
          file.name
            .toLowerCase()
            .includes(query)
      );
  }

  /* =========================================================
     SELECTION
  ========================================================= */

  const allVisibleSelected =
    visibleFiles.length > 0 &&
    visibleFiles.every((file) =>
      selectedIds.includes(file.id)
    );

  const toggleSelect = (
    id: string
  ) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter(
            (item) => item !== id
          )
        : [...current, id]
    );
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((current) =>
        current.filter(
          (id) =>
            !visibleFiles.some(
              (file) =>
                file.id === id
            )
        )
      );
    } else {
      setSelectedIds((current) => [
        ...new Set([
          ...current,
          ...visibleFiles.map(
            (file) => file.id
          ),
        ]),
      ]);
    }
  };

  /* =========================================================
     BULK MOVE TO TRASH
  ========================================================= */

  const bulkMoveToTrash =
    async () => {
      const selectedFiles =
        activeFiles.filter((file) =>
          selectedIds.includes(
            file.id
          )
        );

      if (
        selectedFiles.length === 0
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `Move ${selectedFiles.length} file(s) to Trash?`
        );

      if (!confirmed) {
        return;
      }

      try {
        const response =
          await fetch(
            "/api/files/delete-bulk",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                fileIds:
                  selectedFiles.map(
                    (file) => file.id
                  ),
                permanent: false,
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to move files to Trash."
          );
        }

        const selectedSet =
          new Set(
            selectedFiles.map(
              (file) => file.id
            )
          );

        setFiles((current) =>
          current.map((file) =>
            selectedSet.has(file.id)
              ? {
                  ...file,
                  isDeleted: true,
                }
              : file
          )
        );

        setSelectedIds([]);
      } catch (error) {
        console.error(
          "Bulk trash error:",
          error
        );

        alert(
          error instanceof Error
            ? error.message
            : "Unable to move files to Trash."
        );
      }
    };

  /* =========================================================
     BULK PERMANENT DELETE
  ========================================================= */

  const bulkPermanentDelete =
    async () => {
      const selectedFiles =
        trashFiles.filter((file) =>
          selectedIds.includes(
            file.id
          )
        );

      if (
        selectedFiles.length === 0
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `Permanently delete ${selectedFiles.length} file(s)? This cannot be undone.`
        );

      if (!confirmed) {
        return;
      }

      try {
        const response =
          await fetch(
            "/api/files/delete-bulk",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                fileIds:
                  selectedFiles.map(
                    (file) => file.id
                  ),
                permanent: true,
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to permanently delete files."
          );
        }

        const deletedBytes =
          selectedFiles.reduce(
            (total, file) =>
              total +
              Number(
                file.sizeBytes || 0
              ),
            0
          );

        const selectedSet =
          new Set(
            selectedFiles.map(
              (file) => file.id
            )
          );

        setFiles((current) =>
          current.filter(
            (file) =>
              !selectedSet.has(
                file.id
              )
          )
        );

        setStorageUsed(
          (current) =>
            Math.max(
              current -
                deletedBytes,
              0
            )
        );

        setSelectedIds([]);
      } catch (error) {
        console.error(
          "Bulk permanent delete error:",
          error
        );

        alert(
          error instanceof Error
            ? error.message
            : "Unable to permanently delete files."
        );
      }
    };

  /* =========================================================
     SIGN OUT
  ========================================================= */

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const usedPercentage =
    storageLimit > 0
      ? Math.min(
          (storageUsed /
            storageLimit) *
            100,
          100
        )
      : 0;

  const freeStorage =
    Math.max(
      storageLimit - storageUsed,
      0
    );

  /* =========================================================
     UI
  ========================================================= */

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1500px] gap-5">

        {/* SIDEBAR */}

        <aside className="hidden w-[250px] shrink-0 rounded-[30px] border border-white/60 bg-white/60 p-5 shadow-2xl backdrop-blur-xl md:flex md:flex-col">
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg">
              <Cloud size={24} />
            </div>

            <div>
              <h1 className="text-lg font-bold text-slate-900">
                CloudX
              </h1>

              <p className="text-xs text-slate-500">
                Private cloud storage
              </p>
            </div>
          </div>

          <nav className="space-y-2">
            <NavButton
              active={
                section === "files"
              }
              icon={
                <Files size={19} />
              }
              label="My Files"
              onClick={() => {
                setSection("files");
                clearSelection();
              }}
            />

            <NavButton
              active={
                section === "starred"
              }
              icon={
                <Star size={19} />
              }
              label="Starred"
              onClick={() => {
                setSection("starred");
                clearSelection();
              }}
            />

            <NavButton
              active={
                section === "recent"
              }
              icon={
                <Clock3 size={19} />
              }
              label="Recent"
              onClick={() => {
                setSection("recent");
                clearSelection();
              }}
            />

            <NavButton
              active={
                section === "trash"
              }
              icon={
                <Trash2 size={19} />
              }
              label="Trash"
              onClick={() => {
                setSection("trash");
                clearSelection();
              }}
            />
          </nav>

          <div className="mt-auto">
            <div className="rounded-3xl border border-white/70 bg-white/70 p-4 shadow-lg">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">
                  Storage
                </span>

                <HardDrive
                  size={18}
                  className="text-indigo-600"
                />
              </div>

              <div className="mb-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all"
                  style={{
                    width: `${usedPercentage}%`,
                  }}
                />
              </div>

              <p className="text-xs text-slate-500">
                {formatBytes(
                  storageUsed
                )}{" "}
                of{" "}
                {formatBytes(
                  storageLimit
                )}
              </p>
            </div>

            <button
              onClick={signOut}
              className="mt-4 flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-white"
            >
              <LogOut
                size={17}
                className="mr-2"
              />
              Sign out
            </button>
          </div>
        </aside>

        {/* MAIN */}

        <section className="min-w-0 flex-1">

          {/* HEADER */}

          <header className="mb-5 rounded-[30px] border border-white/60 bg-white/55 p-5 shadow-xl backdrop-blur-xl md:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="mb-1 text-sm font-medium text-indigo-600">
                  Your private space
                </p>

                <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">
                  My Cloud
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Store everything. Find
                  anything.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative">
                  <Search
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    value={search}
                    onChange={(event) =>
                      setSearch(
                        event.target.value
                      )
                    }
                    placeholder="Search files..."
                    className="h-12 w-full rounded-2xl border border-white/70 bg-white/70 pl-11 pr-4 text-sm outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 sm:w-[250px]"
                  />
                </div>

                <button
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  disabled={uploading}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:opacity-60"
                >
                  <Upload size={18} />

                  {uploading
                    ? "Uploading..."
                    : "Upload"}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={
                    handleFileInput
                  }
                />
              </div>
            </div>
          </header>

          {/* MOBILE NAV */}

          <div className="mb-5 flex gap-2 overflow-x-auto md:hidden">
            {[
              ["files", "Files"],
              ["starred", "Starred"],
              ["recent", "Recent"],
              ["trash", "Trash"],
            ].map(
              ([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    setSection(
                      value as Section
                    );
                    clearSelection();
                  }}
                  className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold ${
                    section === value
                      ? "bg-indigo-600 text-white"
                      : "bg-white/70 text-slate-600"
                  }`}
                >
                  {label}
                </button>
              )
            )}
          </div>

          {/* STATS */}

          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <StatCard
              title="Total files"
              value={activeFiles.length.toString()}
            />

            <StatCard
              title="Starred"
              value={starredFiles.length.toString()}
            />

            <StatCard
              title="Free storage"
              value={formatBytes(
                freeStorage
              )}
            />
          </div>

          {/* STORAGE + AI */}

          <div className="mb-5 grid gap-5 lg:grid-cols-2">
            <div className="relative overflow-hidden rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-xl backdrop-blur-xl">
              <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl" />

              <div className="relative flex items-center gap-6">
                <div className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-slate-100 shadow-inner">
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: `conic-gradient(#4f46e5 ${usedPercentage}%, #e2e8f0 ${usedPercentage}% 100%)`,
                    }}
                  />

                  <div className="absolute inset-[9px] flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
                    <span className="text-2xl font-bold text-slate-900">
                      {Math.round(
                        usedPercentage
                      )}
                      %
                    </span>

                    <span className="text-[10px] text-slate-500">
                      used
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-indigo-600">
                    Storage
                  </p>

                  <h3 className="mt-1 text-xl font-bold text-slate-900">
                    {formatBytes(
                      storageUsed
                    )}
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    of{" "}
                    {formatBytes(
                      storageLimit
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[30px] border border-indigo-200/50 bg-indigo-600 p-6 text-white shadow-xl">
              <Sparkles
                className="absolute right-6 top-6 opacity-30"
                size={35}
              />

              <div className="relative">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck
                    size={18}
                  />

                  <span className="text-sm font-semibold">
                    CloudX AI
                  </span>
                </div>

                <h3 className="text-xl font-bold">
                  Find anything faster.
                </h3>

                <p className="mt-2 max-w-md text-sm leading-6 text-indigo-100">
                  AI-powered search and
                  document understanding
                  are coming to CloudX.
                </p>
              </div>
            </div>
          </div>

          {/* UPLOAD AREA */}

          <div
            onDragOver={(event) =>
              event.preventDefault()
            }
            onDrop={handleDrop}
            onClick={() =>
              fileInputRef.current?.click()
            }
            className="mb-5 cursor-pointer rounded-[30px] border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-7 text-center transition hover:border-indigo-400 hover:bg-indigo-50"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-lg">
              <Upload size={25} />
            </div>

            <h3 className="mt-4 font-bold text-slate-900">
              Drop files here
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              or click to browse from your
              computer
            </p>
          </div>

          {/* FILE HEADER */}

          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {section === "files" &&
                  "My Files"}

                {section === "starred" &&
                  "Starred Files"}

                {section === "recent" &&
                  "Recent Files"}

                {section === "trash" &&
                  "Trash"}
              </h3>

              <p className="text-sm text-slate-500">
                {visibleFiles.length} file
                {visibleFiles.length !==
                1
                  ? "s"
                  : ""}
              </p>
            </div>

            {visibleFiles.length >
              0 && (
              <button
                onClick={
                  toggleSelectAll
                }
                className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm"
              >
                {allVisibleSelected ? (
                  <CheckSquare
                    size={17}
                  />
                ) : (
                  <Square size={17} />
                )}

                {allVisibleSelected
                  ? "Deselect all"
                  : "Select all"}
              </button>
            )}
          </div>

          {/* BULK ACTIONS */}

          {selectedIds.length >
            0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-3">
              <span className="text-sm font-semibold text-indigo-700">
                {selectedIds.length}{" "}
                selected
              </span>

              <div className="flex gap-2">
                <button
                  onClick={
                    clearSelection
                  }
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-600"
                >
                  Clear
                </button>

                {section ===
                "trash" ? (
                  <button
                    onClick={
                      bulkPermanentDelete
                    }
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Delete permanently
                  </button>
                ) : (
                  <button
                    onClick={
                      bulkMoveToTrash
                    }
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Move to Trash
                  </button>
                )}
              </div>
            </div>
          )}

          {/* FILE LIST */}

          <div className="space-y-3">
            {loading ? (
              <div className="rounded-[30px] bg-white/60 p-10 text-center shadow-lg">
                <p className="text-sm text-slate-500">
                  Loading your files...
                </p>
              </div>
            ) : visibleFiles.length ===
              0 ? (
              <div className="rounded-[30px] border border-white/60 bg-white/60 p-12 text-center shadow-lg backdrop-blur-xl">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Files size={28} />
                </div>

                <h3 className="mt-4 font-bold text-slate-900">
                  {search
                    ? "No files found"
                    : section ===
                        "trash"
                    ? "Trash is empty"
                    : "No files yet"}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {search
                    ? "Try another search."
                    : section ===
                        "trash"
                    ? "Deleted files will appear here."
                    : "Upload your first file to get started."}
                </p>
              </div>
            ) : (
              visibleFiles.map(
                (file) => {
                  const Icon =
                    getFileIcon(
                      file.type
                    );

                  const selected =
                    selectedIds.includes(
                      file.id
                    );

                  const previewable =
                    isPreviewable(
                      file.type
                    );

                  return (
                    <div
                      key={file.id}
                      onDoubleClick={() =>
                        previewable
                          ? handlePreview(
                              file
                            )
                          : handleDownload(
                              file
                            )
                      }
                      className={`group relative flex items-center gap-3 rounded-[25px] border p-3 shadow-lg backdrop-blur-xl transition hover:-translate-y-0.5 ${
                        selected
                          ? "border-indigo-300 bg-indigo-50/80"
                          : "border-white/60 bg-white/60"
                      }`}
                    >

                      {/* SELECT */}

                      <button
                        onClick={() =>
                          toggleSelect(
                            file.id
                          )
                        }
                        className="ml-1 shrink-0 text-slate-400 hover:text-indigo-600"
                        title={
                          selected
                            ? "Deselect"
                            : "Select"
                        }
                      >
                        {selected ? (
                          <CheckSquare
                            size={20}
                            className="text-indigo-600"
                          />
                        ) : (
                          <Square
                            size={20}
                          />
                        )}
                      </button>

                      {/* ICON */}

                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-md">
                        <Icon
                          size={22}
                          className={
                            previewable
                              ? "text-indigo-600"
                              : "text-slate-500"
                          }
                        />
                      </div>

                      {/* INFO */}

                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate font-semibold text-slate-900"
                          title={
                            file.name
                          }
                        >
                          {file.name}
                        </p>

                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span>
                            {file.size}
                          </span>

                          <span>
                            •
                          </span>

                          <span>
                            {new Date(
                              file.createdAt
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* PREVIEW */}

                      {previewable && (
                        <button
                          onClick={() =>
                            handlePreview(
                              file
                            )
                          }
                          title="Preview"
                          className="hidden h-10 w-10 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm transition hover:bg-indigo-50 md:flex"
                        >
                          <Eye
                            size={18}
                          />
                        </button>
                      )}

                      {/* STAR */}

                      <button
                        onClick={() =>
                          toggleStar(
                            file
                          )
                        }
                        title={
                          file.isStarred
                            ? "Remove star"
                            : "Star"
                        }
                        className="hidden h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm md:flex"
                      >
                        <Star
                          size={18}
                          className={
                            file.isStarred
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-slate-400"
                          }
                        />
                      </button>

                      {/* MENU */}

                      <div className="relative z-40">
                        <button
                          onClick={() =>
                            setMenuId(
                              menuId ===
                                file.id
                                ? null
                                : file.id
                            )
                          }
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm"
                          title="More"
                        >
                          <MoreHorizontal
                            size={19}
                            className="text-slate-500"
                          />
                        </button>

                        {menuId ===
                          file.id && (
                          <div className="absolute bottom-11 right-0 z-50 w-48 rounded-2xl border border-white/80 bg-white p-2 shadow-2xl">

                            {previewable && (
                              <MenuButton
                                icon={
                                  <Eye
                                    size={17}
                                  />
                                }
                                label="Preview"
                                onClick={() =>
                                  handlePreview(
                                    file
                                  )
                                }
                              />
                            )}

                            <MenuButton
                              icon={
                                <Download
                                  size={17}
                                />
                              }
                              label="Download"
                              onClick={() =>
                                handleDownload(
                                  file
                                )
                              }
                            />

                            {!file.isDeleted && (
                              <MenuButton
                                icon={
                                  <Pencil
                                    size={17}
                                  />
                                }
                                label="Rename"
                                onClick={() =>
                                  openRename(
                                    file
                                  )
                                }
                              />
                            )}

                            <MenuButton
                              icon={
                                <Star
                                  size={17}
                                />
                              }
                              label={
                                file.isStarred
                                  ? "Remove star"
                                  : "Add to starred"
                              }
                              onClick={() =>
                                toggleStar(
                                  file
                                )
                              }
                            />

                            {file.isDeleted ? (
                              <>
                                <MenuButton
                                  icon={
                                    <RotateCcw
                                      size={
                                        17
                                      }
                                    />
                                  }
                                  label="Restore"
                                  onClick={() =>
                                    restoreFile(
                                      file
                                    )
                                  }
                                />

                                <MenuButton
                                  danger
                                  icon={
                                    <Trash2
                                      size={
                                        17
                                      }
                                    />
                                  }
                                  label="Delete permanently"
                                  onClick={() =>
                                    permanentlyDelete(
                                      file
                                    )
                                  }
                                />
                              </>
                            ) : (
                              <MenuButton
                                danger
                                icon={
                                  <Trash2
                                    size={
                                      17
                                    }
                                  />
                                }
                                label="Move to Trash"
                                onClick={() =>
                                  moveToTrash(
                                    file
                                  )
                                }
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
              )
            )}
          </div>
        </section>
      </div>

      {/* PREVIEW MODAL */}

      {previewFile && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() =>
            setPreviewFile(null)
          }
        >
          <div
            className="relative flex max-h-[95vh] max-w-[95vw] flex-col overflow-hidden rounded-3xl bg-black shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="flex items-center justify-between gap-4 bg-black/90 px-5 py-4 text-white">
              <p
                className="truncate text-sm font-semibold"
                title={
                  previewFile.name
                }
              >
                {previewFile.name}
              </p>

              <button
                onClick={() =>
                  setPreviewFile(null)
                }
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 transition hover:bg-white/20"
              >
                <X size={21} />
              </button>
            </div>

            {previewFile.mimeType.startsWith(
              "image/"
            ) && (
              <div className="flex max-h-[85vh] items-center justify-center bg-black p-3">
                <img
                  src={previewFile.url}
                  alt={
                    previewFile.name
                  }
                  className="max-h-[80vh] max-w-[90vw] rounded-xl object-contain"
                />
              </div>
            )}

            {previewFile.mimeType.startsWith(
              "video/"
            ) && (
              <div className="flex max-h-[85vh] items-center justify-center bg-black p-3">
                <video
                  src={previewFile.url}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[80vh] max-w-[90vw] rounded-xl"
                >
                  Your browser does not support video playback.
                </video>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RENAME MODAL */}

      {renameFile && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() =>
            setRenameFile(null)
          }
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                Rename file
              </h3>

              <button
                onClick={() =>
                  setRenameFile(null)
                }
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            <input
              autoFocus
              value={renameValue}
              onChange={(event) =>
                setRenameValue(
                  event.target.value
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  saveRename();
                }

                if (
                  event.key ===
                  "Escape"
                ) {
                  setRenameFile(null);
                }
              }}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() =>
                  setRenameFile(null)
                }
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>

              <button
                onClick={saveRename}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white shadow-lg hover:bg-indigo-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLOSE MENU */}

      {menuId && (
        <button
          aria-label="Close menu"
          onClick={() =>
            setMenuId(null)
          }
          className="fixed inset-0 z-30 cursor-default"
        />
      )}
    </main>
  );
}

/* =========================================================
   NAV BUTTON
========================================================= */

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
        active
          ? "bg-indigo-600 text-white shadow-lg"
          : "text-slate-600 hover:bg-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* =========================================================
   MENU BUTTON
========================================================= */

function MenuButton({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-slate-100 ${
        danger
          ? "text-red-600 hover:bg-red-50"
          : "text-slate-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* =========================================================
   STAT CARD
========================================================= */

function StatCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-[25px] border border-white/60 bg-white/60 p-5 shadow-lg backdrop-blur-xl">
      <p className="text-sm text-slate-500">
        {title}
      </p>

      <p className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}