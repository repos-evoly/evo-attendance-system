/**
 * Sync lock file management.
 * Prevents concurrent sync operations.
 * Uses atomic file creation, ownership verification, and PID-based stale detection.
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';

const DEFAULT_LOCK_FILE = path.join(process.cwd(), 'data', 'sync.lock');
const LOCK_STALE_MINUTES = 15;

// Allow override for testing
let lockFilePath = DEFAULT_LOCK_FILE;

/**
 * Set the lock file path (for testing only).
 */
export function _setLockFilePath(path: string): void {
  lockFilePath = path;
}

/**
 * Get the current lock file path.
 */
function getLockFile(): string {
  return lockFilePath;
}

interface LockData {
  pid: number;
  startTime: string;
  nonce: string; // Cryptographically unique identifier for ownership verification
}

// Store the nonce of the lock we created for ownership verification
let ourLockNonce: string | null = null;

/**
 * Reset internal state (for testing only).
 * Clears the stored nonce so the module can be retested.
 */
export function _resetLockState(): void {
  ourLockNonce = null;
}

/**
 * Generate a cryptographically secure unique nonce for lock ownership.
 */
function generateNonce(): string {
  return crypto.randomUUID();
}

/**
 * Check if a process with the given PID is still running.
 * Returns true if running, false if not running or PID is invalid.
 * Handles errors safely (e.g., permission denied on other user's processes).
 */
let isProcessRunningOverride: ((pid: number) => boolean) | null = null;

function isProcessRunning(pid: number): boolean {
  if (isProcessRunningOverride !== null) {
    return isProcessRunningOverride(pid);
  }

  if (pid <= 0 || pid > 2147483647) {
    // Invalid PID range
    return false;
  }
  try {
    // Signal 0 checks if process exists without sending a signal
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // ESRCH: no such process, EPERM: exists but we don't have permission
    // On Windows, ESRCH indicates process doesn't exist
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ESRCH') {
      return false;
    }
    // If we get EPERM or other errors, assume process is running
    // (we can't verify, but shouldn't treat it as abandoned)
    return true;
  }
}

/**
 * Override the process running check for testing.
 */
export function _setIsProcessRunning(fn: (pid: number) => boolean): void {
  isProcessRunningOverride = fn;
}

/**
 * Reset the process running check override.
 */
export function _resetIsProcessRunning(): void {
  isProcessRunningOverride = null;
}

/**
 * Read and parse lock file safely.
 * Returns null if file doesn't exist or is malformed.
 */
function readLockFile(): LockData | null {
  const lockFile = getLockFile();
  try {
    if (!fs.existsSync(lockFile)) {
      return null;
    }
    const content = fs.readFileSync(lockFile, 'utf8');
    const lockData: LockData = JSON.parse(content);
    // Validate required fields
    if (typeof lockData.pid !== 'number' ||
        typeof lockData.startTime !== 'string' ||
        typeof lockData.nonce !== 'string') {
      return null;
    }
    return lockData;
  } catch (e) {
    return null;
  }
}

/**
 * Check if a lock is abandoned (stale by age OR process not running).
 */
function isLockAbandoned(lockData: LockData): boolean {
  const lockTime = new Date(lockData.startTime);
  const now = new Date();
  const ageMinutes = (now.getTime() - lockTime.getTime()) / (1000 * 60);

  // Abandoned if older than threshold OR process is not running
  const isStaleByAge = ageMinutes >= LOCK_STALE_MINUTES;
  const isProcessDead = !isProcessRunning(lockData.pid);

  return isStaleByAge || isProcessDead;
}

/**
 * Attempt to create a lock file atomically.
 * Returns the file descriptor if successful.
 * Throws on filesystem errors (except EEXIST which returns null).
 */
function tryCreateLockAtomically(): number | null {
  const lockFile = getLockFile();
  const dataDir = path.dirname(lockFile);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  try {
    // 'wx' flag: create file exclusively, fail if exists
    const fd = fs.openSync(lockFile, 'wx');
    return fd;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EEXIST') {
      // File already exists - not an error, just means we can't create
      return null;
    }
    // Other errors (permission denied, invalid path, etc.) are real errors
    throw new Error(`Failed to create lock file: ${err.message}`);
  }
}

/**
 * Create a lock file atomically.
 * Returns true if successful, false if a lock already exists and is not abandoned.
 * Throws on filesystem errors (other than EEXIST).
 */
export function createLock(): boolean {
  // First, try atomic creation
  const fd = tryCreateLockAtomically();
  if (fd !== null) {
    // We got the lock! Write our data and close.
    const nonce = generateNonce();
    ourLockNonce = nonce;
    const lockData: LockData = {
      pid: process.pid,
      startTime: new Date().toISOString(),
      nonce,
    };
    let writeSuccess = false;
    try {
      fs.writeSync(fd, JSON.stringify(lockData, null, 2));
      writeSuccess = true;
      return true;
    } catch (e) {
      // Write failed - clean up the partially created lock
      ourLockNonce = null;
      throw new Error(`Failed to write lock data: ${(e as Error).message}`);
    } finally {
      try {
        fs.closeSync(fd);
      } catch (e2) {
        // Ignore close errors
      }
      if (!writeSuccess) {
        // Clean up the empty/partial file
        try {
          fs.unlinkSync(getLockFile());
        } catch (e3) {
          // Ignore unlink errors
        }
      }
    }
  }

  // Lock file exists. Check if it's malformed or abandoned.
  const existingLock = readLockFile();
  if (existingLock === null) {
    // Malformed lock file. Try to remove it and retry once.
    try {
      fs.unlinkSync(getLockFile());
    } catch (e) {
      // Ignore removal errors
    }
    // Retry atomic creation
    const retryFd = tryCreateLockAtomically();
    if (retryFd !== null) {
      const nonce = generateNonce();
      ourLockNonce = nonce;
      const lockData: LockData = {
        pid: process.pid,
        startTime: new Date().toISOString(),
        nonce,
      };
      let writeSuccess = false;
      try {
        fs.writeSync(retryFd, JSON.stringify(lockData, null, 2));
        writeSuccess = true;
        return true;
      } catch (e) {
        ourLockNonce = null;
        throw new Error(`Failed to write lock data: ${(e as Error).message}`);
      } finally {
        try {
          fs.closeSync(retryFd);
        } catch (e2) {
          // Ignore
        }
        if (!writeSuccess) {
          try {
            fs.unlinkSync(getLockFile());
          } catch (e3) {
            // Ignore
          }
        }
      }
    }
    // Another process might have created the lock during our retry
    return false;
  }

  // Valid lock file exists. Check if abandoned.
  if (isLockAbandoned(existingLock)) {
    // Lock is abandoned. Remove it and retry.
    try {
      fs.unlinkSync(getLockFile());
    } catch (e) {
      // Removal failed - another process might have taken it
      return false;
    }
    // Retry atomic creation immediately
    const retryFd = tryCreateLockAtomically();
    if (retryFd !== null) {
      const nonce = generateNonce();
      ourLockNonce = nonce;
      const lockData: LockData = {
        pid: process.pid,
        startTime: new Date().toISOString(),
        nonce,
      };
      let writeSuccess = false;
      try {
        fs.writeSync(retryFd, JSON.stringify(lockData, null, 2));
        writeSuccess = true;
        return true;
      } catch (e) {
        ourLockNonce = null;
        throw new Error(`Failed to write lock data: ${(e as Error).message}`);
      } finally {
        try {
          fs.closeSync(retryFd);
        } catch (e2) {
          // Ignore
        }
        if (!writeSuccess) {
          try {
            fs.unlinkSync(getLockFile());
          } catch (e3) {
            // Ignore
          }
        }
      }
    }
    // Another process won the race
    return false;
  }

  // Lock is active and held by another process.
  return false;
}

/**
 * Remove the lock file if we own it.
 * Only removes locks matching our stored nonce.
 */
export function removeLock(): void {
  if (ourLockNonce === null) {
    // We never created a lock, or already removed it.
    return;
  }

  try {
    const existingLock = readLockFile();
    if (existingLock !== null && existingLock.nonce === ourLockNonce) {
      // We own this lock, safe to remove.
      fs.unlinkSync(getLockFile());
      ourLockNonce = null;
    }
    // If nonce doesn't match, another process owns the lock - don't remove it.
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Check if a lock exists and is not abandoned.
 */
export function isLocked(): boolean {
  const lockData = readLockFile();
  if (lockData === null) {
    return false;
  }
  return !isLockAbandoned(lockData);
}
