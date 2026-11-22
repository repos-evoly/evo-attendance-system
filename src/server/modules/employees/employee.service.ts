
import { findAllEmployees } from "./employee.repository";

export async function getEmployees() {
  return findAllEmployees();
}
