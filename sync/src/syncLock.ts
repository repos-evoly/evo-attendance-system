/**
 * Sync lock file management.
 * Prevents concurrent sync operations.
 */

import * as fs from 'fs';
import * as path from 'path';

const LOCK_FILE = path.join(process.cwd(), 'data', 'sync.lock');
const LOCK_STALE_MINUTES = 15;

interface LockData {
  pid: number;
  startTime: string;
}

/**
 * Create a lock file.
 * Returns true if successful, false if a lock already exists and is not stale.
 */
export function createLock(): boolean {
  // Ensure data directory exists
  const dataDir = path.dirname(LOCK_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Check if lock file exists
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const content = fs.readFileSync(LOCK_FILE, 'utf8');
      const lockData: LockData = JSON.parse(content);
      const lockTime = new Date(lockData.startTime);
      const now = new Date();
      const ageMinutes = (now.getTime() - lockTime.getTime()) / (1000 * 60);

      if (ageMinutes < LOCK_STALE_MINUTES) {
        // Lock is fresh, don't proceed
        return false;
      } else {
        // Lock is stale, remove it
        fs.unlinkSync(LOCK_FILE);
      }
    } catch (e) {
      // Invalid lock file, remove it
      try {
        fs.unlinkSync(LOCK_FILE);
      } catch (e2) {
        // Ignore
      }
    }
  }

  // Create new lock file
  const lockData: LockData = {
    pid: process.pid,
    startTime: new Date().toISOString(),
  };
  fs.writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2));
  return true;
}

/**
 * Remove the lock file.
 */
export function removeLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Check if a lock exists and is not stale.
 */
export function isLocked(): boolean {
  if (!fs.existsSync(LOCK_FILE)) {
    return false;
  }

  try {
    const content = fs.readFileSync(LOCK_FILE, 'utf8');
    const lockData: LockData = JSON.parse(content);
    const lockTime = new Date(lockData.startTime);
    const now = new Date();
    const ageMinutes = (now.getTime() - lockTime.getTime()) / (1000 * 60);

    return ageMinutes < LOCK_STALE_MINUTES;
  } catch (e) {
    // Invalid lock file, treat as not locked
    return false;
  }
}
