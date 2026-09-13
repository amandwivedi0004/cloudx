"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Cloud,
  Mail,
  LockKeyhole,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

import { createClient } from "../lib/supabase-browser";

const supabase = createClient();

export default function HomePage() {
  const [mode, setMode] = useState<"login" | "signup">(
    "login"
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] =
    useState(true);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        window.location.href = "/dashboard";
        return;
      }
    } catch (error) {
      console.error(
        "Session check error:",
        error
      );
    } finally {
      setCheckingSession(false);
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setMessage("");

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError("Please enter your email.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    if (password.length < 6) {
      setError(
        "Password must be at least 6 characters."
      );
      return;
    }

    try {
      setLoading(true);

      if (mode === "login") {
        const { error: loginError } =
          await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });

        if (loginError) {
          throw new Error(loginError.message);
        }

        window.location.href = "/dashboard";
        return;
      }

      const {
        data,
        error: signupError,
      } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });

      if (signupError) {
        throw new Error(signupError.message);
      }

      if (data.session) {
        window.location.href = "/dashboard";
        return;
      }

      setMessage(
        "Account created. Please check your email to confirm your account."
      );

      setMode("login");
      setPassword("");
    } catch (error) {
      console.error(
        "Authentication error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4 text-white">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 shadow-xl">
            <Cloud size={28} />
          </div>

          <p className="text-sm text-slate-400">
            Loading CloudX...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      {/* BACKGROUND GLOW */}

      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />

      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />

      {/* LOGIN CARD */}

      <div className="relative w-full max-w-md">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.07] p-6 shadow-2xl backdrop-blur-2xl sm:p-8">
          {/* LOGO */}

          <div className="mb-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-600 text-white shadow-xl shadow-indigo-600/30">
              <Cloud size={32} />
            </div>

            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white">
              CloudX
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              Store everything. Find anything.
            </p>
          </div>

          {/* TABS */}

          <div className="mb-6 grid grid-cols-2 rounded-2xl bg-black/20 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
                setMessage("");
              }}
              className={`rounded-xl py-3 text-sm font-semibold transition ${
                mode === "login"
                  ? "bg-white text-slate-900 shadow-lg"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Login
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError("");
                setMessage("");
              }}
              className={`rounded-xl py-3 text-sm font-semibold transition ${
                mode === "signup"
                  ? "bg-white text-slate-900 shadow-lg"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Create account
            </button>
          </div>

          {/* FORM */}

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            {/* EMAIL */}

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Email
              </label>

              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                />

                <input
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="h-13 w-full rounded-2xl border border-white/10 bg-black/20 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-600 transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
            </div>

            {/* PASSWORD */}

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Password
              </label>

              <div className="relative">
                <LockKeyhole
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                />

                <input
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Enter your password"
                  autoComplete={
                    mode === "login"
                      ? "current-password"
                      : "new-password"
                  }
                  className="h-13 w-full rounded-2xl border border-white/10 bg-black/20 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-600 transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
            </div>

            {/* ERROR */}

            {error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* SUCCESS */}

            {message && (
              <div className="rounded-2xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-300">
                {message}
              </div>
            )}

            {/* SUBMIT */}

            <button
              type="submit"
              disabled={loading}
              className="group flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Login to CloudX"
                : "Create CloudX account"}

              {!loading && (
                <ArrowRight
                  size={18}
                  className="transition-transform group-hover:translate-x-1"
                />
              )}
            </button>
          </form>

          {/* PRIVACY */}

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
            <ShieldCheck
              size={20}
              className="mt-0.5 shrink-0 text-indigo-400"
            />

            <p className="text-xs leading-5 text-slate-500">
              Your CloudX files are private from other
              users. Your storage is protected by
              authenticated access.
            </p>
          </div>

          {/* FREE STORAGE */}

          <div className="mt-5 text-center">
            <p className="text-xs text-slate-500">
              Every account includes
            </p>

            <p className="mt-1 text-sm font-semibold text-slate-300">
              30 GB free cloud storage
            </p>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-slate-600">
          CloudX • Private cloud storage
        </p>
      </div>
    </main>
  );
}