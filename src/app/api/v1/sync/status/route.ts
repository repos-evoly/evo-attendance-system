import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import type { SyncRunSummary } from "@/types/sync/sync-status.types";

/** How many recent runs are returned alongside the latest one. */
const RECENT_RUN_LIMIT = 5;

type SyncRunRecord = NonNullable<
  Awaited<ReturnType<typeof prisma.syncRun.findFirst>>
>;

/**
 * Maps a `sync_runs` row to the API shape.
 *
 * `id` is a BIGINT, which JSON cannot serialize, so it is converted to a
 * string. Timestamps are serialized as ISO strings, like the other endpoints.
 */
function toSyncRunSummary(run: SyncRunRecord): SyncRunSummary {
  return {
    id: run.id.toString(),
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    recordsSeen: run.recordsSeen,
    recordsNew: run.recordsNew,
    duplicatesSkipped: run.duplicatesSkipped,
    error: run.error,
  };
}

/**
 * Read-only device synchronization status.
 *
 * Reports the latest run and the previous runs already recorded in
 * `sync_runs`. Nothing here connects to the device or starts a run: the Sync
 * Service remains a separate process that owns all device communication.
 */
export async function GET() {
  try {
    const runs = await prisma.syncRun.findMany({
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: RECENT_RUN_LIMIT,
    });

    const latest = runs[0] ?? null;

    return NextResponse.json({
      success: true,
      data: {
        latest: latest ? toSyncRunSummary(latest) : null,
        recent: runs.map(toSyncRunSummary),
      },
    });
  } catch (error) {
    console.error("Sync status API failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to retrieve device sync status.",
      },
      { status: 500 },
    );
  }
}
