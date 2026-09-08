import { execSync } from "node:child_process";

// Vercel sets VERCEL_ENV to "production" | "preview" | "development" on every
// build. Preview builds (Dependabot PRs, branch previews, ...) don't have
// DIRECT_URL configured, and even if they did, running migrations against the
// production database on every dependency-bump preview is unsafe. Only apply
// migrations on real production deploys; other hosts (Docker, etc.) don't set
// VERCEL_ENV and keep running migrations as before.
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
  console.log(
    `Skipping prisma migrate deploy for VERCEL_ENV="${process.env.VERCEL_ENV}".`,
  );
} else {
  execSync("prisma migrate deploy", { stdio: "inherit" });
}
