import { getInitials } from "@/lib/attendance/employee.utils";

const GRADIENTS = [
  "from-violet-500 to-purple-600",
  "from-indigo-500 to-violet-600",
  "from-fuchsia-500 to-purple-600",
  "from-purple-500 to-indigo-500",
  "from-violet-500 to-fuchsia-500",
] as const;

const SIZES = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-16 w-16 text-xl",
} as const;

interface EmployeeAvatarProps {
  fullName: string;
  employeeId: number;
  size?: keyof typeof SIZES;
}

/** Initials avatar with a deterministic gradient derived from the employee ID. */
export function EmployeeAvatar({
  fullName,
  employeeId,
  size = "md",
}: EmployeeAvatarProps) {
  const index = Math.abs(employeeId) % GRADIENTS.length;
  const gradient = GRADIENTS[index] ?? "from-violet-500 to-purple-600";

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br font-semibold text-white shadow-sm ${gradient} ${SIZES[size]}`}
    >
      {getInitials(fullName)}
    </span>
  );
}
