import test from "node:test";
import assert from "node:assert/strict";
import { decodeGt06Location, frameGt06, parseGt06Frames } from "../src/gt06.js";

test("GT06 framing round-trips a packet and validates CRC", () => {
  const packet = frameGt06(0x22, Buffer.from([1, 2, 3]), 0x1234);
  const parsed = parseGt06Frames(packet);
  assert.equal(parsed.frames.length, 1);
  assert.equal(parsed.frames[0].protocol, 0x22);
  assert.equal(parsed.frames[0].serial, 0x1234);
  assert.deepEqual([...parsed.frames[0].payload], [1, 2, 3]);
  assert.equal(parsed.frames[0].validCrc, true);
});

test("GT06 parser retains incomplete TCP frame bytes", () => {
  const packet = frameGt06(0x22, Buffer.from([1, 2]), 7);
  const first = parseGt06Frames(packet.subarray(0, 5));
  assert.equal(first.frames.length, 0);
  assert.equal(first.remainder.length, 5);
  const second = parseGt06Frames(Buffer.concat([first.remainder, packet.subarray(5)]));
  assert.equal(second.frames.length, 1);
});

test("GT06 GPS decoder validates and converts coordinates", () => {
  const payload = Buffer.alloc(18);
  payload.set([0x26, 0x11, 0x24, 0x12, 0x30, 0x00, 0x08], 0);
  payload.writeUInt32BE(Math.round(11.0168 * 1800000), 7);
  payload.writeUInt32BE(Math.round(76.9558 * 1800000), 11);
  payload[15] = 42;
  payload.writeUInt16BE(0x0c00 | 90, 16);
  const point = decodeGt06Location(payload);
  assert.ok(Math.abs(point.latitude - 11.0168) < 0.00001);
  assert.ok(Math.abs(point.longitude - 76.9558) < 0.00001);
  assert.equal(point.speed_kph, 42);
  assert.equal(point.heading, 90);
});
