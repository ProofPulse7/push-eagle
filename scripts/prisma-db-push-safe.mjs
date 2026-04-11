import { execSync } from "node:child_process";

const command = "npx prisma db push";

try {
  execSync(command, { stdio: "inherit", shell: true });
} catch (error) {
  const message = String(error?.stderr || error?.stdout || error?.message || "");

  // On intermittent Neon connectivity issues, allow local dev to continue.
  if (message.includes("P1001") || message.includes("Can't reach database server")) {
    console.warn("[warn] Prisma db push skipped due to temporary database connectivity issue (P1001).");
    process.exit(0);
  }

  throw error;
}