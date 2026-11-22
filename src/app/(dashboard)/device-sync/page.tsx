"use client";

import { DashboardHeader } from "@/components/attendance/layout/DashboardHeader";
import { SyncStatusCard } from "@/components/attendance/sync/SyncStatusCard";
import { useSyncStatus } from "@/hooks/attendance/useSyncStatus";

/**
 * Device synchronization page. Reuses the existing `useSyncStatus` hook and
 * `SyncStatusCard`, which read `GET /api/v1/sync/status` and start the Sync
 * Service through `POST /api/v1/sync/run`.
 */
export default function DeviceSyncPage() {
  const syncStatus = useSyncStatus();

  return (
    <>
      <DashboardHeader
        title="Device Sync"
        description="Latest device synchronization status and recent runs."
        breadcrumbs={[{ label: "Device Sync" }]}
      />

      <SyncStatusCard status={syncStatus} />
    </>
  );
}
