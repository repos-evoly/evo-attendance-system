"use client";

import { useMemo } from "react";
import { ShieldCheck, ShieldHalf, ShieldOff } from "lucide-react";
import { DashboardHeader } from "@/components/attendance/layout/DashboardHeader";
import { StatCard } from "@/components/attendance/shared/StatCard";
import { WaiverTable } from "@/components/attendance/waivers/WaiverTable";
import { useWaivers } from "@/hooks/attendance/useWaivers";
import { getWaiverStatus } from "@/types/attendance/waiver.types";

/**
 * Waivers management page (read-only).
 *
 * Lists every waiver record - active and revoked - with the full grant and
 * revocation audit trail, read from the existing `GET /api/v1/waivers`.
 * Granting and revoking stay in the Daily Report; this page never mutates.
 */
export default function WaiversPage() {
  const { waivers, isLoading, error, refetch } = useWaivers();

  const { total, active, revoked } = useMemo(() => {
    let activeCount = 0;

    for (const waiver of waivers) {
      if (getWaiverStatus(waiver) === "ACTIVE") activeCount += 1;
    }

    return {
      total: waivers.length,
      active: activeCount,
      revoked: waivers.length - activeCount,
    };
  }, [waivers]);

  // Never show a misleading zero while the list is loading or failed.
  const summaryValue = error ? "—" : total;
  const activeValue = error ? "—" : active;
  const revokedValue = error ? "—" : revoked;

  return (
    <>
      <DashboardHeader
        title="Waivers"
        description="Review every granted waiver with its grant and revocation audit trail."
        breadcrumbs={[{ label: "Waivers" }]}
      />

      <section
        aria-label="Waiver summary"
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <StatCard
          label="Total Waivers"
          value={summaryValue}
          icon={ShieldHalf}
          tone="violet"
          isLoading={isLoading}
        />
        <StatCard
          label="Active Waivers"
          value={activeValue}
          icon={ShieldCheck}
          tone="emerald"
          isLoading={isLoading}
        />
        <StatCard
          label="Revoked Waivers"
          value={revokedValue}
          icon={ShieldOff}
          tone="rose"
          isLoading={isLoading}
        />
      </section>

      <WaiverTable
        waivers={waivers}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
      />
    </>
  );
}
