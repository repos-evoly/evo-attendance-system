/**
 * Types mirroring the existing `src/app/api/v1/public-holidays` endpoints.
 *
 * The endpoints return the same envelope as every other route:
 *   success -> { success: true, data }
 *   failure -> { success: false, message }
 *
 * `holidayId` / `createdById` / `cancelledById` are Postgres bigints and arrive as strings because
 * JSON cannot represent `bigint`. Dates are `YYYY-MM-DD` and `dateTo` is inclusive.
 * These are display contracts only.
 *
 * A CANCELLED row keeps all of its original fields and adds the cancellation
 * audit data; records are never deleted.
 */

/** One public holiday record as returned by `GET /api/v1/public-holidays`. */
export interface PublicHoliday {
  holidayId: string;
  name: string;
  dateFrom: string;
  dateTo: string;
  reason: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
  cancelledAt: string | null;
  cancelledById: string | null;
  cancelledByName: string | null;
  cancellationReason: string | null;
}

/** Body of `POST /api/v1/public-holidays`; `createdById` is resolved from the session. */
export interface CreatePublicHolidayRequest {
  name: string;
  dateFrom: string;
  dateTo: string;
  reason?: string;
}

/** Body of `PATCH /api/v1/public-holidays/[holidayId]`. */
export interface UpdatePublicHolidayRequest {
  name: string;
  dateFrom: string;
  dateTo: string;
  reason?: string;
}

/** Body of `DELETE /api/v1/public-holidays/[holidayId]` - cancellation. */
export interface CancelPublicHolidayRequest {
  reason: string;
}

/** Body of `POST /api/v1/public-holidays/[holidayId]` - reactivation. */
export interface ReactivatePublicHolidayRequest {
  // No body needed - the acting user comes from the session
}
