import {
  createShiftAssignmentRecord,
  getEmployeeStatus,
  getShiftAssignmentById,
  listEmployeeAssignmentPeriods,
  listShiftAssignments,
  shiftExists,
  updateShiftAssignmentRecord,
} from "./shift-assignment.repository";
import type {
  CreateShiftAssignmentInput,
  CreateShiftAssignmentResult,
  ShiftAssignmentRecord,
  UpdateShiftAssignmentInput,
  UpdateShiftAssignmentResult,
} from "./shift-assignment.types";
import {
  findOverlappingAssignment,
  isValidDateString,
} from "./shift-assignment.utils";

/** Lists shift assignments, optionally filtered by employeeId. */
export async function listAssignments(
  employeeId?: number,
): Promise<ShiftAssignmentRecord[]> {
  return listShiftAssignments(employeeId);
}

/**
 * Creates a shift assignment with application-level validation:
 * - Employee must exist and be active.
 * - Shift must exist.
 * - Start date must be a valid YYYY-MM-DD string.
 * - End date must be null or a valid YYYY-MM-DD string on or after start date.
 * - Must not overlap any existing shift assignment for the employee (inclusive boundaries).
 */
export async function createAssignment(
  input: CreateShiftAssignmentInput,
): Promise<CreateShiftAssignmentResult> {
  // 1. Validate startDate
  if (!isValidDateString(input.startDate)) {
    return {
      ok: false,
      error: {
        code: "INVALID_DATE",
        message: "Provide a valid startDate using YYYY-MM-DD format.",
      },
    };
  }

  // 2. Validate endDate
  if (input.endDate !== null && !isValidDateString(input.endDate)) {
    return {
      ok: false,
      error: {
        code: "INVALID_DATE",
        message: "Provide a valid endDate using YYYY-MM-DD format or null.",
      },
    };
  }

  // 3. Validate date ordering
  if (input.endDate !== null && input.endDate < input.startDate) {
    return {
      ok: false,
      error: {
        code: "INVALID_DATE_RANGE",
        message: "endDate cannot be earlier than startDate.",
      },
    };
  }

  // 4. Validate employee exists and is active
  const employeeStatus = await getEmployeeStatus(input.employeeId);
  if (!employeeStatus) {
    return {
      ok: false,
      error: {
        code: "EMPLOYEE_NOT_FOUND",
        message: `Employee #${input.employeeId} not found.`,
      },
    };
  }
  if (!employeeStatus.isActive) {
    return {
      ok: false,
      error: {
        code: "EMPLOYEE_INACTIVE",
        message: `Cannot assign a shift to inactive employee #${input.employeeId}.`,
      },
    };
  }

  // 5. Validate shift exists
  const shiftFound = await shiftExists(input.shiftId);
  if (!shiftFound) {
    return {
      ok: false,
      error: {
        code: "SHIFT_NOT_FOUND",
        message: `Shift #${input.shiftId} not found.`,
      },
    };
  }

  // 6. Validate no overlapping assignments exist for the employee
  const existing = await listEmployeeAssignmentPeriods(input.employeeId);
  const conflict = findOverlappingAssignment(
    existing,
    input.startDate,
    input.endDate,
  );

  if (conflict) {
    const conflictEnd = conflict.endDate ?? "ongoing";
    return {
      ok: false,
      error: {
        code: "OVERLAPPING_ASSIGNMENT",
        message: `Assignment overlaps with an existing shift assignment (${conflict.startDate} to ${conflictEnd}).`,
      },
    };
  }

  // 7. Persist
  try {
    const assignment = await createShiftAssignmentRecord(input);
    return { ok: true, assignment };
  } catch (error) {
    console.error("createAssignment failed:", error);
    return {
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to create shift assignment.",
      },
    };
  }
}

/**
 * Updates an existing shift assignment with application-level validation:
 * - Assignment must exist.
 * - Associated employee must be active.
 * - Shift (if changed) must exist.
 * - Date ranges must be valid and ordered.
 * - Must not overlap any other shift assignments for the employee,
 *   excluding the current assignment record itself.
 */
export async function updateAssignment(
  id: bigint,
  input: UpdateShiftAssignmentInput,
): Promise<UpdateShiftAssignmentResult> {
  const current = await getShiftAssignmentById(id);
  if (!current) {
    return {
      ok: false,
      error: {
        code: "ASSIGNMENT_NOT_FOUND",
        message: "Shift assignment record not found.",
      },
    };
  }

  const targetShiftId = input.shiftId ?? current.shiftId;
  const targetStartDate = input.startDate ?? current.startDate;
  const targetEndDate =
    input.endDate !== undefined ? input.endDate : current.endDate;

  // 1. Validate startDate
  if (!isValidDateString(targetStartDate)) {
    return {
      ok: false,
      error: {
        code: "INVALID_DATE",
        message: "Provide a valid startDate using YYYY-MM-DD format.",
      },
    };
  }

  // 2. Validate endDate
  if (targetEndDate !== null && !isValidDateString(targetEndDate)) {
    return {
      ok: false,
      error: {
        code: "INVALID_DATE",
        message: "Provide a valid endDate using YYYY-MM-DD format or null.",
      },
    };
  }

  // 3. Validate date ordering
  if (targetEndDate !== null && targetEndDate < targetStartDate) {
    return {
      ok: false,
      error: {
        code: "INVALID_DATE_RANGE",
        message: "endDate cannot be earlier than startDate.",
      },
    };
  }

  // 4. Validate employee is still active
  const employeeStatus = await getEmployeeStatus(current.employeeId);
  if (!employeeStatus || !employeeStatus.isActive) {
    return {
      ok: false,
      error: {
        code: "EMPLOYEE_INACTIVE",
        message: `Cannot update assignment for inactive employee #${current.employeeId}.`,
      },
    };
  }

  // 5. If shiftId is changing, validate new shift exists
  if (input.shiftId !== undefined && input.shiftId !== current.shiftId) {
    const shiftFound = await shiftExists(targetShiftId);
    if (!shiftFound) {
      return {
        ok: false,
        error: {
          code: "SHIFT_NOT_FOUND",
          message: `Shift #${targetShiftId} not found.`,
        },
      };
    }
  }

  // 6. Overlap check, excluding the record being updated
  const existing = await listEmployeeAssignmentPeriods(current.employeeId);
  const conflict = findOverlappingAssignment(
    existing,
    targetStartDate,
    targetEndDate,
    current.id,
  );

  if (conflict) {
    const conflictEnd = conflict.endDate ?? "ongoing";
    return {
      ok: false,
      error: {
        code: "OVERLAPPING_ASSIGNMENT",
        message: `Updated dates overlap with an existing shift assignment (${conflict.startDate} to ${conflictEnd}).`,
      },
    };
  }

  // 7. Persist
  try {
    const updated = await updateShiftAssignmentRecord(id, {
      shiftId: input.shiftId,
      startDate: input.startDate,
      endDate: input.endDate,
    });
    return { ok: true, assignment: updated };
  } catch (error) {
    console.error("updateAssignment failed:", error);
    return {
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to update shift assignment.",
      },
    };
  }
}
