import { spawn } from "node:child_process";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/server/modules/auth/session-user";

/**
 * Exit codes of the existing Sync Service (`sync/src/sync-postgres.ts`).
 * The lock itself is owned by that script: this route never creates or takes
 * a lock, it only reports what the script decided.
 */
const EXIT_SUCCESS = 0;
const EXIT_FAILED = 1;
const EXIT_ALREADY_RUNNING = 2;

/**
 * Fixed command and fixed working directory.
 */
const SYNC_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";
const SYNC_SCRIPT = "sync:postgres";
const SYNC_CWD = path.join(process.cwd(), "sync");

/** Keeps only the tail of the child output for the server log. */
const MAX_LOGGED_OUTPUT = 8000;

interface SyncServiceResult {
  code: number | null;
  output: string;
}

/**
 * Runs the Sync Service and resolves with its exit code. The child process
 * connects to the device; the web app never does.
 */
function runSyncService(): Promise<SyncServiceResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(SYNC_COMMAND, ["run", SYNC_SCRIPT], {
      cwd: SYNC_CWD,
      shell: true,
      windowsHide: true,
    });

    let output = "";

    const collect = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > MAX_LOGGED_OUTPUT) {
        output = output.slice(-MAX_LOGGED_OUTPUT);
      }
    };

    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({ code, output });
    });
  });
}

/**
 * Starts a run of the Sync Service. Restricted to ADMIN, HR, MANAGER, and VIEWER.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ["ADMIN", "HR", "MANAGER", "VIEWER"]);
    if (!auth.ok) return auth.response;

    const { code, output } = await runSyncService();

    console.log(`[api/v1/sync/run] Sync Service exited with code ${code}\n${output.trim()}`);

    if (code === EXIT_SUCCESS) {
      return NextResponse.json({
        success: true,
        data: {
          exitCode: code,
          message: "Device sync completed. Reports are up to date.",
        },
      });
    }

    if (code === EXIT_ALREADY_RUNNING) {
      return NextResponse.json(
        {
          success: false,
          message: "Another device sync is already running.",
        },
        { status: 409 }
      );
    }

    if (code === EXIT_FAILED) {
      return NextResponse.json(
        {
          success: false,
          message: "The device sync failed. Check the Sync Service logs.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "The Sync Service stopped unexpectedly.",
      },
      { status: 500 }
    );
  } catch (error) {
    console.error("Sync run API could not start the Sync Service:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Could not start the Sync Service.",
      },
      { status: 500 }
    );
  }
}
