/**
 * Configuration for attendance reports.
 */

export interface ReportConfig {
  weekendDays: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  duplicatePunchMinutes: number;
  maxShiftHours: number;
}

export const DEFAULT_CONFIG: ReportConfig = {
  weekendDays: [5, 6], // Friday and Saturday (based on Part A data inspection)
  duplicatePunchMinutes: 2,
  maxShiftHours: 16,
};
