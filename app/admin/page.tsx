"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  File,
  FileText,
  HardDrive,
  Image as ImageIcon,
  LogOut,
  Play,
  RefreshCw,
  Search,
  Shield,
  User,
  Users,
  X,
} from "lucide-react";

import { createClient } from "../../lib/supabase-browser";

const supabase = createClient();

type UserRow = {
  id: string;
  email: string;
  created_at: string;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  file_count: number;
};

type UserFile = {
  id: string;
  name: string;
  size_bytes: number;
  mime_type: string | null;
  created_at: string;
  is_deleted: boolean;
  is_starred: boolean;
};

type UserDetails = {
  user: {
    id: string;
    email: string;
    created_at: string;
  };
  profile: {
    full_name: string | null;
    storage_used_bytes: number;
    storage_limit_bytes: number;
  } | null;
  files: UserFile[];
};

type PreviewData = {
  id: string;
  name: string;
  url: string;
  mime_type: string | null;
  size_bytes: number;
};

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  return `${(
    bytes / Math.pow(1024, index)
  ).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(date: string) {
  return new Date(date).toLocaleString();
}

function isImage(mime: string | null) {
  return !!mime && mime.startsWith("image/");
}

function isVideo(mime: string | null) {
  return !!mime && mime.startsWith("video/");
}

function isPdf(mime: string | null) {
  return mime === "application/pdf";
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);

  const [selectedUser, setSelectedUser] =
    useState<UserDetails | null>(null);

  const [previewData, setPreviewData] =
    useState<PreviewData | null>(null);

  const [activeTab, setActiveTab] = useState<
    "overview" | "users"
  >("overview");

  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [userLoading, setUserLoading] =
    useState(false);
  const [previewLoading, setPreviewLoading] =
    useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    initializeAdmin();
  }, []);

  async function initializeAdmin() {
    try {
      const response = await fetch(
        "/api/admin/check",
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok || !data.isAdmin) {
        window.location.href = "/dashboard";
        return;
      }

      await loadUsers();
    } catch {
      window.location.href = "/dashboard";
    }
  }

  async function loadUsers() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        "/api/admin/data",
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to load users."
        );
      }

      setUsers(data.users || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load users."
      );
    } finally {
      setLoading(false);
    }
  }

  async function openUser(userId: string) {
    try {
      setUserLoading(true);
      setError("");
      setSelectedUser(null);
      setPreviewData(null);

      const response = await fetch(
        `/api/admin/user?userId=${encodeURIComponent(
          userId
        )}`,
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to load user."
        );
      }

      setSelectedUser(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load user."
      );
    } finally {
      setUserLoading(false);
    }
  }

  async function handlePreviewFile(file: UserFile) {
    try {
      setPreviewLoading(true);
      setError("");

      const response = await fetch(
        `/api/admin/file-url?fileId=${encodeURIComponent(
          file.id
        )}`,
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to preview file."
        );
      }

      setPreviewData({
        id: file.id,
        name: file.name,
        url: data.url,
        mime_type: file.mime_type,
        size_bytes: Number(
          file.size_bytes || 0
        ),
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to preview file."
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  function closeUser() {
    setSelectedUser(null);
    setPreviewData(null);
  }

  function closePreview() {
    setPreviewData(null);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return users;
    }

    return users.filter((user) =>
      user.email.toLowerCase().includes(query)
    );
  }, [users, search]);

  const totalFiles = users.reduce(
    (total, user) =>
      total + Number(user.file_count || 0),
    0
  );

  const totalStorage = users.reduce(
    (total, user) =>
      total +
      Number(user.storage_used_bytes || 0),
    0
  );

  const totalCapacity = users.reduce(
    (total, user) =>
      total +
      Number(user.storage_limit_bytes || 0),
    0
  );

  const storagePercentage =
    totalCapacity > 0
      ? Math.min(
          100,
          (totalStorage / totalCapacity) * 100
        )
      : 0;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/30">
              <Shield size={23} />
            </div>

            <div>
              <h1 className="text-lg font-bold">
                CloudX Admin
              </h1>

              <p className="text-xs text-slate-500">
                Super Admin • Read Only
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadUsers}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm transition hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={
                  loading ? "animate-spin" : ""
                }
              />

              <span className="hidden sm:inline">
                Refresh
              </span>
            </button>

            <button
              onClick={signOut}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
            >
              <LogOut size={16} />

              <span className="hidden sm:inline">
                Sign out
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        {/* SIDEBAR */}
        <aside className="hidden min-h-[calc(100vh-73px)] w-60 border-r border-white/10 p-5 md:block">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-600">
            Admin
          </p>

          <button
            onClick={() => {
              setActiveTab("overview");
              closeUser();
            }}
            className={`mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
              activeTab === "overview" &&
              !selectedUser
                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <HardDrive size={18} />

            Overview
          </button>

          <button
            onClick={() => {
              setActiveTab("users");
              closeUser();
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
              activeTab === "users" &&
              !selectedUser
                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Users size={18} />

            Users
          </button>

          <div className="mt-8 rounded-2xl border border-indigo-400/10 bg-indigo-500/5 p-4">
            <p className="text-xs text-slate-600">
              Access
            </p>

            <p className="mt-1 text-sm font-semibold">
              Super Admin
            </p>

            <p className="mt-1 text-xs text-slate-500">
              View and preview only
            </p>
          </div>
        </aside>

        {/* CONTENT */}
        <section className="min-w-0 flex-1 p-5 sm:p-6">
          {/* ERROR */}
          {error && (
            <div className="mb-6 flex items-center justify-between rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-300">
              <span>{error}</span>

              <button
                onClick={() => setError("")}
                className="rounded-lg p-1 hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>
          )}

          {/* OVERVIEW */}
          {activeTab === "overview" &&
            !selectedUser && (
              <div>
                <div className="mb-8">
                  <h2 className="text-3xl font-bold">
                    Overview
                  </h2>

                  <p className="mt-2 text-slate-400">
                    Platform statistics. Individual
                    user data is not displayed here.
                  </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    icon={<Users size={21} />}
                    title="Users"
                    value={users.length.toString()}
                  />

                  <StatCard
                    icon={<File size={21} />}
                    title="Files"
                    value={totalFiles.toString()}
                  />

                  <StatCard
                    icon={<HardDrive size={21} />}
                    title="Storage Used"
                    value={formatBytes(totalStorage)}
                  />

                  <StatCard
                    icon={<HardDrive size={21} />}
                    title="Capacity"
                    value={formatBytes(totalCapacity)}
                  />
                </div>

                <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">
                        Platform Storage
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        Combined user storage
                      </p>
                    </div>

                    <span className="font-semibold">
                      {storagePercentage.toFixed(1)}%
                    </span>
                  </div>

                  <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{
                        width: `${storagePercentage}%`,
                      }}
                    />
                  </div>

                  <div className="mt-3 flex justify-between text-xs text-slate-600">
                    <span>
                      {formatBytes(totalStorage)}
                    </span>

                    <span>
                      {formatBytes(totalCapacity)}
                    </span>
                  </div>
                </div>
              </div>
            )}

          {/* USERS */}
          {activeTab === "users" &&
            !selectedUser && (
              <div>
                <div className="mb-7">
                  <h2 className="text-3xl font-bold">
                    Users
                  </h2>

                  <p className="mt-2 text-slate-400">
                    Select a user to view their account
                    and files.
                  </p>
                </div>

                {/* SEARCH */}
                <div className="mb-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <Search
                    size={19}
                    className="text-slate-500"
                  />

                  <input
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                    placeholder="Search user by email..."
                    className="w-full bg-transparent text-sm outline-none placeholder:text-slate-600"
                  />
                </div>

                {/* USER LIST */}
                <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
                  <div className="hidden grid-cols-[1fr_120px_140px] border-b border-white/10 px-5 py-4 text-xs font-semibold uppercase tracking-wider text-slate-600 sm:grid">
                    <span>User</span>
                    <span>Files</span>
                    <span>Joined</span>
                  </div>

                  {loading ? (
                    <div className="p-12 text-center text-slate-500">
                      Loading users...
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                      No users found.
                    </div>
                  ) : (
                    <div>
                      {filteredUsers.map((user) => (
                        <button
                          key={user.id}
                          onClick={() =>
                            openUser(user.id)
                          }
                          className="flex w-full items-center justify-between gap-4 border-b border-white/5 px-5 py-5 text-left transition hover:bg-white/[0.06]"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
                              <User size={19} />
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {user.email}
                              </p>

                              <p className="mt-1 text-xs text-slate-600">
                                {user.file_count} files
                              </p>
                            </div>
                          </div>

                          <div className="hidden items-center gap-8 text-sm sm:flex">
                            <span className="w-16 text-slate-400">
                              {user.file_count}
                            </span>

                            <span className="w-24 text-slate-500">
                              {new Date(
                                user.created_at
                              ).toLocaleDateString()}
                            </span>
                          </div>

                          <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
                            View
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* USER DETAILS */}
          {selectedUser && (
            <div>
              <button
                onClick={closeUser}
                className="mb-6 flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
              >
                <ArrowLeft size={17} />

                Back to Users
              </button>

              {userLoading ? (
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-12 text-center text-slate-500">
                  Loading user details...
                </div>
              ) : (
                <>
                  {/* USER PROFILE */}
                  <div className="mb-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-300">
                        <User size={29} />
                      </div>

                      <div className="min-w-0">
                        <h2 className="truncate text-2xl font-bold">
                          {selectedUser.user.email}
                        </h2>

                        {selectedUser.profile
                          ?.full_name && (
                          <p className="mt-1 text-sm text-slate-400">
                            {
                              selectedUser.profile
                                .full_name
                            }
                          </p>
                        )}

                        <p className="mt-2 break-all text-xs text-slate-600">
                          ID: {selectedUser.user.id}
                        </p>

                        <p className="mt-1 text-xs text-slate-600">
                          Joined:{" "}
                          {formatDate(
                            selectedUser.user
                              .created_at
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* USER STATS */}
                  <div className="grid gap-5 sm:grid-cols-3">
                    <StatCard
                      icon={<File size={21} />}
                      title="Files"
                      value={selectedUser.files.length.toString()}
                    />

                    <StatCard
                      icon={<HardDrive size={21} />}
                      title="Storage Used"
                      value={formatBytes(
                        Number(
                          selectedUser.profile
                            ?.storage_used_bytes ||
                            0
                        )
                      )}
                    />

                    <StatCard
                      icon={<HardDrive size={21} />}
                      title="Storage Limit"
                      value={formatBytes(
                        Number(
                          selectedUser.profile
                            ?.storage_limit_bytes ||
                            0
                        )
                      )}
                    />
                  </div>

                  {/* USER STORAGE BAR */}
                  <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">
                          User Storage
                        </p>

                        <p className="mt-1 text-xs text-slate-600">
                          Current storage usage
                        </p>
                      </div>

                      <span className="text-sm text-slate-400">
                        {formatBytes(
                          Number(
                            selectedUser.profile
                              ?.storage_used_bytes ||
                              0
                          )
                        )}{" "}
                        /{" "}
                        {formatBytes(
                          Number(
                            selectedUser.profile
                              ?.storage_limit_bytes ||
                              0
                          )
                        )}
                      </span>
                    </div>

                    <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{
                          width: `${
                            Number(
                              selectedUser.profile
                                ?.storage_limit_bytes ||
                                0
                            ) > 0
                              ? Math.min(
                                  100,
                                  (Number(
                                    selectedUser.profile
                                      ?.storage_used_bytes ||
                                      0
                                  ) /
                                    Number(
                                      selectedUser.profile
                                        ?.storage_limit_bytes ||
                                        1
                                    )) *
                                    100
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* FILE LIST */}
                  <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
                    <div className="border-b border-white/10 px-6 py-5">
                      <h3 className="font-semibold">
                        User Files
                      </h3>

                      <p className="mt-1 text-xs text-slate-600">
                        Click a file to preview its
                        contents.
                      </p>
                    </div>

                    {selectedUser.files.length ===
                    0 ? (
                      <div className="p-12 text-center text-slate-500">
                        This user has no files.
                      </div>
                    ) : (
                      <div>
                        {selectedUser.files.map(
                          (file) => (
                            <button
                              key={file.id}
                              onClick={() =>
                                handlePreviewFile(
                                  file
                                )
                              }
                              className="flex w-full items-center justify-between gap-4 border-b border-white/5 px-6 py-5 text-left transition hover:bg-white/[0.05]"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-300">
                                  {isImage(
                                    file.mime_type
                                  ) ? (
                                    <ImageIcon
                                      size={19}
                                    />
                                  ) : isVideo(
                                      file.mime_type
                                    ) ? (
                                    <Play
                                      size={19}
                                    />
                                  ) : isPdf(
                                      file.mime_type
                                    ) ? (
                                    <FileText
                                      size={19}
                                    />
                                  ) : (
                                    <File
                                      size={19}
                                    />
                                  )}
                                </div>

                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">
                                    {file.name}
                                  </p>

                                  <p className="mt-1 truncate text-xs text-slate-500">
                                    {formatBytes(
                                      Number(
                                        file.size_bytes ||
                                          0
                                      )
                                    )}{" "}
                                    •{" "}
                                    {file.mime_type ||
                                      "Unknown type"}
                                  </p>

                                  <p className="mt-1 text-xs text-slate-600">
                                    {formatDate(
                                      file.created_at
                                    )}
                                  </p>

                                  <div className="mt-1 flex gap-2">
                                    {file.is_deleted && (
                                      <span className="text-xs text-red-400">
                                        Trash
                                      </span>
                                    )}

                                    {file.is_starred && (
                                      <span className="text-xs text-yellow-400">
                                        Starred
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <span className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
                                Preview
                              </span>
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {/* PREVIEW MODAL */}
      {(previewData || previewLoading) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => {
            if (!previewLoading) {
              closePreview();
            }
          }}
        >
          <div
            className="relative max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            {/* PREVIEW HEADER */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {previewData?.name ||
                    "Loading preview..."}
                </p>

                {previewData && (
                  <p className="mt-1 text-xs text-slate-500">
                    {formatBytes(
                      previewData.size_bytes
                    )}
                  </p>
                )}
              </div>

              <button
                onClick={closePreview}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* PREVIEW CONTENT */}
            <div className="flex max-h-[calc(92vh-75px)] min-h-[300px] items-center justify-center overflow-auto p-6">
              {previewLoading ? (
                <RefreshCw
                  size={32}
                  className="animate-spin text-indigo-400"
                />
              ) : previewData ? (
                <>
                  {/* IMAGE */}
                  {isImage(
                    previewData.mime_type
                  ) && (
                    <img
                      src={previewData.url}
                      alt={previewData.name}
                      className="max-h-[75vh] max-w-full rounded-xl object-contain"
                    />
                  )}

                  {/* VIDEO */}
                  {isVideo(
                    previewData.mime_type
                  ) && (
                    <video
                      src={previewData.url}
                      controls
                      autoPlay
                      playsInline
                      className="max-h-[75vh] max-w-full rounded-xl"
                    />
                  )}

                  {/* PDF */}
                  {isPdf(
                    previewData.mime_type
                  ) && (
                    <iframe
                      src={previewData.url}
                      title={previewData.name}
                      className="h-[75vh] w-full rounded-xl bg-white"
                    />
                  )}

                  {/* OTHER FILE */}
                  {!isImage(
                    previewData.mime_type
                  ) &&
                    !isVideo(
                      previewData.mime_type
                    ) &&
                    !isPdf(
                      previewData.mime_type
                    ) && (
                      <div className="max-w-md text-center">
                        <FileText
                          size={60}
                          className="mx-auto mb-5 text-slate-600"
                        />

                        <h3 className="text-lg font-semibold">
                          Preview unavailable
                        </h3>

                        <p className="mt-2 text-sm text-slate-500">
                          This file type cannot be
                          previewed directly in the
                          browser.
                        </p>

                        <p className="mt-3 break-all text-xs text-slate-700">
                          {previewData.mime_type ||
                            "Unknown file type"}
                        </p>
                      </div>
                    )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
        {icon}
      </div>

      <p className="text-sm text-slate-500">
        {title}
      </p>

      <p className="mt-1 text-2xl font-bold">
        {value}
      </p>
    </div>
  );
}