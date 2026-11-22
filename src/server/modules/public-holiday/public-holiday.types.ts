/**
 * Row shape returned by the public holiday API.
 *
 * `holidayId` / `createdById` / `cancelledById` are Postgres bigints and are
 * serialized as strings because JSON cannot represent `bigint`. Dates are
 * `YYYY-MM-DD`; `dateTo` is inclusive.
 *
 * A CANCELLED row keeps all of its original fields and adds the cancellation
 * audit data; records are never deleted.
 */
export interface PublicHolidayRecord {
  holidayId: string;
  name: string;
  dateFrom: string;
  dateTo: string;
  reason: string | null;
  createdById: string;
  /** `users.username` of the creator, joined for display. */
  createdByName: string;
  createdAt: string;
  cancelledAt: string | null;
  cancelledById: string | null;
  /** `users.username` of the canceller, joined for display. */
  cancelledByName: string | null;
  cancellationReason: string | null;
}

export interface CreatePublicHolidayInput {
  name: string;
  dateFrom: string;
  dateTo: string;
  reason: string | null;
  /** `users.user_id` of the acting user, taken from the verified session. */
  createdById: bigint;
}

export interface UpdatePublicHolidayInput {
  name: string;
  dateFrom: string;
  dateTo: string;
  reason: string | null;
}

export interface CancelPublicHolidayInput {
  /** Mandatory explanation, kept with the record for the audit trail. */
  reason: string;
  /** `users.user_id` of the acting user, taken from the verified session. */
  cancelledById: bigint;
}

export interface ReactivatePublicHolidayInput {
  /** `users.user_id` of the acting user, taken from the verified session. */
  reactivatedById: bigint;
}

/**
 * A public holiday period with the details the attendance calculators need.
 *
 * This is a minimal representation used by the attendance calculator to determine
 * if a date falls within a public holiday range.
 */
export interface PublicHolidayPeriod {
  holidayId: string;
  name: string;
  dateFrom: string;
  dateTo: string;
  reason: string | null;
}
