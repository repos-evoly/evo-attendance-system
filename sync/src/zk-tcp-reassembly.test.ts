/**
 * Deterministic TCP reassembly tests for the patched `@graphland/zkteco`
 * TCP transport (see `sync/patches/@graphland+zkteco+0.1.0.patch`).
 *
 * They drive the *compiled dist* implementation that production actually runs
 * (`node_modules/@graphland/zkteco/dist/transport/tcp.js`) through a fake
 * socket, so every TCP delivery pattern is fully reproducible and no device or
 * network is involved:
 *
 *   - several complete frames inside a single `data` event
 *   - trailing bytes of the next frame arriving together with the previous one
 *   - one frame fragmented across several `data` events
 *   - delayed delivery (one frame per event)
 *   - CMD_REG_EVENT frames interleaved with chunk data
 *   - a malformed frame header
 *   - an assembled payload whose length does not match the reported size
 *
 * A successful download must return the *complete* byte stream; incomplete or
 * malformed streams must surface an error instead of a partial payload.
 *
 * Run with:  npm test   (inside sync/)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { TcpTransport } from "../node_modules/@graphland/zkteco/dist/transport/tcp.js";
import {
  COMMANDS,
  MAX_CHUNK,
  REQUEST_DATA,
} from "../node_modules/@graphland/zkteco/dist/constants.js";
import {
  createTCPHeader,
  decodeTCPHeader,
} from "../node_modules/@graphland/zkteco/dist/protocol.js";

const SESSION_ID = 1;
const RECORD_COUNT = 4000;

/** Minimal socket stand-in: records writes and lets a test emit data events. */
class FakeSocket extends EventEmitter {
  readonly writes: Buffer[] = [];
  private readonly onWrite: (message: Buffer) => void;

  constructor(onWrite: (message: Buffer) => void) {
    super();
    this.onWrite = onWrite;
  }

  write(message: Buffer, callback?: (error?: Error | null) => void): boolean {
    const copy = Buffer.from(message);
    this.writes.push(copy);
    callback?.(null);
    this.onWrite(copy);
    return true;
  }

  end(callback?: () => void): void {
    callback?.();
  }

  setTimeout(): this {
    return this;
  }
}

type TransportInternals = {
  socket: FakeSocket | null;
  readWithBuffer: (
    request: Buffer,
    onProgress?: (received: number, total: number) => void,
  ) => Promise<{ data: Buffer; err: Error | null }>;
};

/** A device chunk frame: 16-byte frame header followed by `chunk` data bytes. */
function chunkFrame(chunk: Buffer, replyId: number): Buffer {
  return createTCPHeader(
    COMMANDS.CMD_DATA,
    SESSION_ID,
    replyId,
    Buffer.concat([Buffer.alloc(8), chunk]),
  );
}

/** A `CMD_REG_EVENT` / `EF_ATTLOG` frame (the device's real-time punch push). */
function eventFrame(): Buffer {
  return createTCPHeader(
    COMMANDS.CMD_REG_EVENT,
    COMMANDS.EF_ATTLOG,
    1,
    Buffer.alloc(8),
  );
}

/** A frame that declares a payload shorter than the frame header itself. */
function malformedFrame(): Buffer {
  const frame = Buffer.alloc(24);
  frame.writeUInt16LE(COMMANDS.CMD_DATA, 8);
  frame.writeUIntLE(4, 4, 2);
  return frame;
}

/** Deterministic attendance blob: 4-byte length header + 40-byte records. */
function attendancePayload(recordCount: number): Buffer {
  const body = Buffer.alloc(recordCount * 40);
  for (let index = 0; index < recordCount; index += 1) {
    body.writeUInt32LE(index + 1, index * 40);
  }
  const payload = Buffer.alloc(4 + body.length);
  payload.writeUInt32LE(body.length, 0);
  body.copy(payload, 4);
  return payload;
}

/** Splits the blob at MAX_CHUNK boundaries and frames each part. */
function splitIntoFrames(payload: Buffer): Buffer[] {
  const frames: Buffer[] = [];
  for (let offset = 0; offset < payload.length; offset += MAX_CHUNK) {
    const chunk = payload.subarray(
      offset,
      Math.min(offset + MAX_CHUNK, payload.length),
    );
    frames.push(chunkFrame(chunk, frames.length + 1));
  }
  return frames;
}

type DeliveryStep = { frames: Buffer[]; delayMs?: number };

const nextTick = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

/**
 * Runs the transport's chunk reader against a fake device.
 *
 * The fake device answers `CMD_DATA_WRRQ` with a `CMD_PREPARE_DATA` frame that
 * carries `size`, then replays `steps`; every step becomes exactly one TCP
 * `data` event.
 */
async function download(
  size: number,
  steps: DeliveryStep[],
): Promise<{ data: Buffer; err: Error | null; progress: number[] }> {
  const progress: number[] = [];
  const transport = new TcpTransport("127.0.0.1", 4370, 60_000);
  const internals = transport as unknown as TransportInternals;

  const preparePayload = Buffer.alloc(8);
  preparePayload.writeUInt32LE(size, 1);
  const prepareFrame = createTCPHeader(
    COMMANDS.CMD_PREPARE_DATA,
    SESSION_ID,
    1,
    preparePayload,
  );

  const socket = new FakeSocket((message: Buffer) => {
    const commandId = decodeTCPHeader(message.subarray(0, 16)).commandId;
    if (commandId !== COMMANDS.CMD_DATA_WRRQ) return;
    void (async () => {
      // Let `requestData` settle so the chunk reader attaches its listener first.
      await nextTick();
      socket.emit("data", prepareFrame);
      for (const step of steps) {
        await nextTick();
        if (step.delayMs) {
          await new Promise((resolve) => setTimeout(resolve, step.delayMs));
        }
        socket.emit("data", Buffer.concat(step.frames));
      }
    })();
  });

  internals.socket = socket;
  const result = await internals.readWithBuffer(
    REQUEST_DATA.GET_ATTENDANCE_LOGS,
    (received) => progress.push(received),
  );
  return { data: result.data, err: result.err, progress };
}

function expectComplete(
  result: { data: Buffer; err: Error | null },
  payload: Buffer,
): void {
  assert.equal(result.err, null, `unexpected error: ${result.err?.message}`);
  assert.equal(result.data.length, payload.length);
  assert.ok(result.data.equals(payload), "assembled bytes must match exactly");
}

test("assembles a download delivered as one single coalesced TCP event", async () => {
  const payload = attendancePayload(RECORD_COUNT);
  const frames = splitIntoFrames(payload);
  assert.equal(frames.length, 3, "setup expects a 3-chunk download");

  const result = await download(payload.length, [{ frames }]);

  expectComplete(result, payload);
  assert.deepEqual(result.progress, [MAX_CHUNK, MAX_CHUNK * 2, payload.length]);
});

test("keeps the trailing bytes of a second frame from the same event", async () => {
  const payload = attendancePayload(RECORD_COUNT);
  const frames = splitIntoFrames(payload);

  const result = await download(payload.length, [
    { frames: [frames[0], frames[1]] },
    { frames: [frames[2]] },
  ]);

  expectComplete(result, payload);
});

test("reassembles a frame fragmented across several TCP events", async () => {
  const payload = attendancePayload(RECORD_COUNT);
  const frames = splitIntoFrames(payload);
  const first = frames[0];

  const result = await download(payload.length, [
    { frames: [first.subarray(0, 6)] },
    { frames: [first.subarray(6, 40_000)] },
    { frames: [first.subarray(40_000)] },
    { frames: [frames[1]] },
    { frames: [frames[2]] },
  ]);

  expectComplete(result, payload);
});

test("handles frames delivered late, one per event", async () => {
  const payload = attendancePayload(RECORD_COUNT);
  const frames = splitIntoFrames(payload);

  const result = await download(payload.length, [
    { frames: [frames[0]], delayMs: 5 },
    { frames: [frames[1]], delayMs: 5 },
    { frames: [frames[2]], delayMs: 5 },
  ]);

  expectComplete(result, payload);
});

test("ignores a lone CMD_REG_EVENT frame between chunk frames", async () => {
  const payload = attendancePayload(RECORD_COUNT);
  const frames = splitIntoFrames(payload);

  const result = await download(payload.length, [
    { frames: [frames[0]] },
    { frames: [eventFrame()] },
    { frames: [frames[1], frames[2]] },
  ]);

  expectComplete(result, payload);
});

test("ignores a CMD_REG_EVENT frame coalesced with chunk data", async () => {
  const payload = attendancePayload(RECORD_COUNT);
  const frames = splitIntoFrames(payload);

  const result = await download(payload.length, [
    { frames: [eventFrame(), frames[0]] },
    { frames: [frames[1], frames[2]] },
  ]);

  expectComplete(result, payload);
});

test("rejects a malformed frame instead of hanging", async () => {
  const payload = attendancePayload(RECORD_COUNT);

  const result = await download(payload.length, [{ frames: [malformedFrame()] }]);

  assert.ok(result.err, "a malformed frame must never be reported as success");
  assert.match(result.err.message, /MALFORMED_PACKET_RECEIVED/);
});

test("rejects an assembled payload that does not match the reported size", async () => {
  const payload = attendancePayload(RECORD_COUNT);
  const frames = splitIntoFrames(payload);
  const oversizedLast = chunkFrame(Buffer.alloc(payload.length - MAX_CHUNK * 2 + 40), 3);

  const result = await download(payload.length, [
    { frames: [frames[0], frames[1], oversizedLast] },
  ]);

  assert.ok(result.err, "an over-long download must never be reported as success");
  assert.match(result.err.message, /INCOMPLETE_DATA_RECEIVED/);
});
