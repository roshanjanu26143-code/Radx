const START = Buffer.from([0x78, 0x78]);
const STOP = Buffer.from([0x0d, 0x0a]);

export function crc16X25(buffer) {
  let crc = 0xffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0x8408) : (crc >>> 1);
    }
  }
  return (~crc) & 0xffff;
}

export function frameGt06(protocol, payload, serial = 0) {
  const body = Buffer.concat([
    Buffer.from([protocol]),
    payload,
    Buffer.from([(serial >>> 8) & 0xff, serial & 0xff]),
  ]);
  const length = body.length + 2;
  const lengthBuffer = Buffer.from([length]);
  const checksumInput = Buffer.concat([lengthBuffer, body]);
  const crc = crc16X25(checksumInput);
  const crcBuffer = Buffer.from([(crc >>> 8) & 0xff, crc & 0xff]);
  return Buffer.concat([START, lengthBuffer, body, crcBuffer, STOP]);
}

export function parseGt06Frames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 5 <= buffer.length) {
    const start = buffer.indexOf(START, offset);
    if (start < 0) break;
    if (start + 3 > buffer.length) break;
    const length = buffer[start + 2];
    const total = 2 + 1 + length + 2;
    if (start + total > buffer.length) break;
    const frame = buffer.subarray(start, start + total);
    if (frame[total - 2] !== STOP[0] || frame[total - 1] !== STOP[1]) {
      offset = start + 1;
      continue;
    }
    const protocol = frame[3];
    const serialOffset = total - 6;
    const serial = frame.readUInt16BE(serialOffset);
    const crcOffset = total - 4;
    const expectedCrc = frame.readUInt16BE(crcOffset);
    const actualCrc = crc16X25(frame.subarray(2, crcOffset));
    frames.push({
      protocol,
      serial,
      payload: frame.subarray(4, serialOffset),
      validCrc: expectedCrc === actualCrc,
      raw: Buffer.from(frame),
    });
    offset = start + total;
  }
  return { frames, remainder: Buffer.from(buffer.subarray(offset)) };
}

export function decodeGt06Imei(payload) {
  if (!payload || payload.length < 8) return null;
  const digits = [...payload.subarray(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .replace(/^0+/, "");
  const imei = digits.slice(0, 15);
  return /^\d{14,16}$/.test(imei) ? imei : null;
}

function bcd(byte) {
  return (Math.floor(byte / 16) * 10) + (byte % 16);
}

export function decodeGt06Location(payload) {
  // GT06 protocol 0x12: date/time, GPS info, satellites, coordinates,
  // speed, course/status. Variants can differ; reject undersized packets.
  if (!payload || payload.length < 18) throw new Error("GT06 GPS packet is too short");
  const year = 2000 + bcd(payload[0]);
  const month = bcd(payload[1]);
  const day = bcd(payload[2]);
  const hour = bcd(payload[3]);
  const minute = bcd(payload[4]);
  const second = bcd(payload[5]);
  const satellites = payload[6] & 0x0f;
  const latitudeRaw = payload.readUInt32BE(7);
  const longitudeRaw = payload.readUInt32BE(11);
  const speedKph = payload[15];
  const courseStatus = payload.readUInt16BE(16);
  const latitudePositive = Boolean(courseStatus & 0x0400);
  const longitudePositive = Boolean(courseStatus & 0x0800);
  const latitude = (latitudeRaw / 1800000) * (latitudePositive ? 1 : -1);
  const longitude = (longitudeRaw / 1800000) * (longitudePositive ? 1 : -1);
  const heading = courseStatus & 0x03ff;
  const recordedAt = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (!Number.isFinite(recordedAt.getTime()) || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error("GT06 GPS packet contains an invalid timestamp");
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error("GT06 GPS packet contains invalid coordinates");
  }
  return {
    latitude,
    longitude,
    speed_kph: speedKph,
    heading,
    recorded_at: recordedAt.toISOString(),
    satellites,
  };
}

export function gt06Ack(frame) {
  return frameGt06(frame.protocol, Buffer.alloc(0), frame.serial);
}
