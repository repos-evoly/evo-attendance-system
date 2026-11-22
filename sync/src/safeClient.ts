import { ZKTecoClient } from '@graphland/zkteco';
import type { DeviceInfo } from '@graphland/zkteco';
import { createSafeZKClientWithAllowlist } from './allowlistTransport.js';
import {
  parseUsersFromBufferWithCorrectEncoding,
  parseUsersDetailedFromBuffer,
  type DeviceUserDetail,
} from './userEncoding.js';

/**
 * Read-only wrapper for ZKTeco MB20 device.
 *
 * This factory creates a proxy that holds the underlying ZKTecoClient in a closure,
 * making it completely inaccessible from outside. Only read-safe operations are exposed.
 *
 * @unsafe NEVER call: clearAttendanceLog, resetDevice, deleteUser, createUser,
 *                 updateUser, setTime, openDoor, refreshData, executeCmd,
 *                 disableDevice, enableDevice, replaceAttendanceLog,
 *                 deleteAttendanceRecord, getFingerprintTemplates
 */
export interface ISafeZKClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getInfo(): Promise<DeviceInfo>;
  getTime(): Promise<Date>;
  getUsers(): Promise<Array<{ pin: string; name: string }>>;
  getUsersDetailed(): Promise<DeviceUserDetail[]>;
  getAttendances(onProgress?: (received: number, total: number) => void): Promise<Array<{ deviceUserId: string; recordTime: Date; punch: number; status: number }>>;
}

export function createSafeZKClient(
  ip: string,
  port: number = 4370,
  timeout: number = 10000,
): ISafeZKClient {
  // Client stored in closure - completely inaccessible from outside
  // AND protected by wire-level allowlist
  const client = createSafeZKClientWithAllowlist(ip, port, timeout);

  return {
    /**
     * Connect to the device via TCP (with UDP fallback).
     * Uses CMD_CONNECT, CMD_AUTH (if needed), and CMD_GET_FREE_SIZES.
     */
    async connect(): Promise<void> {
      await client.connect();
    },

    /**
     * Disconnect from the device.
     * Uses CMD_EXIT.
     */
    async disconnect(): Promise<void> {
      await client.disconnect();
    },

    /**
     * Get device information (user counts, log counts, log capacity).
     * Uses CMD_GET_FREE_SIZES.
     */
    async getInfo(): Promise<DeviceInfo> {
      return await client.getInfo();
    },

    /**
     * Get the device's current time.
     * Uses CMD_GET_TIME.
     */
    async getTime(): Promise<Date> {
      return await client.getTime();
    },

    /**
     * Get all users from the device.
     * Returns pin and name only. NEVER returns: password, cardno, role, uid, or any templates.
     * Uses CMD_FREE_DATA, CMD_DATA_WRRQ, CMD_DATA_RDY, CMD_DATA.
     *
     * Note: Decodes names from Windows-1256 (Arabic) instead of ASCII to fix garbled text.
     */
    async getUsers(): Promise<Array<{ pin: string; name: string }>> {
      // Access the transport directly to get raw buffer
      const transport = (client as any).tcp;
      if (!transport) {
        throw new Error('Transport not available');
      }

      const { data, err } = await transport.getUsers();
      if (err) throw err;

      // Parse with Windows-1256 decoding
      const packetSize = transport.userPacketSize || 72;
      return parseUsersFromBufferWithCorrectEncoding(data, packetSize);
    },

    /**
     * Get all users with the full read-only field set the device exposes
     * (uid, pin, name, role, card number, group, timezones, password-populated
     * flag). Uses the SAME read path as getUsers() — no new device commands and
     * no change to the wire-level allowlist. The password value is never returned.
     */
    async getUsersDetailed(): Promise<DeviceUserDetail[]> {
      const transport = (client as any).tcp;
      if (!transport) {
        throw new Error('Transport not available');
      }

      const { data, err } = await transport.getUsers();
      if (err) throw err;

      const packetSize = transport.userPacketSize || 72;
      return parseUsersDetailedFromBuffer(data, packetSize);
    },

    /**
     * Get all attendance records from the device.
     * Returns deviceUserId, recordTime, and numeric punch/status codes (not personal data).
     * Strips: userSn, statusLabel, punchLabel, ip.
     * Uses CMD_FREE_DATA, CMD_DATA_WRRQ, CMD_DATA_RDY, CMD_DATA.
     */
    async getAttendances(
      onProgress?: (received: number, total: number) => void,
    ): Promise<Array<{ deviceUserId: string; recordTime: Date; punch: number; status: number }>> {
      const records = await client.getAttendances(onProgress);
      return records.map(r => ({
        deviceUserId: String(r.deviceUserId),
        recordTime: r.recordTime,
        punch: r.punch ?? 0,
        status: r.status ?? 0,
      }));
    },
  };
}
