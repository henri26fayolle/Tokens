import { Transform } from 'node:stream';

const LF_LF = Buffer.from('\n\n');
const CRLF_CRLF = Buffer.from('\r\n\r\n');

/** Offset just past the first complete SSE frame, or -1 if none yet. */
function frameEnd(buffer: Buffer): number {
  const lf = buffer.indexOf(LF_LF);
  const crlf = buffer.indexOf(CRLF_CRLF);
  if (lf === -1 && crlf === -1) return -1;
  if (lf === -1) return crlf + 4;
  if (crlf === -1 || lf < crlf) return lf + 2;
  return crlf + 4;
}

/**
 * Splits an SSE byte stream into whole frames, forwarding each frame's
 * ORIGINAL bytes untouched — the client must receive exactly what the
 * provider sent. `onFrame` returning false drops the frame (used only to
 * swallow the usage chunk the gateway itself asked for).
 */
export function createSseFrameTransform(onFrame: (frame: Buffer) => boolean): Transform {
  let pending: Buffer = Buffer.alloc(0);
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      for (;;) {
        const end = frameEnd(pending);
        if (end === -1) break;
        const frame = pending.subarray(0, end);
        pending = pending.subarray(end);
        if (onFrame(frame)) this.push(frame);
      }
      callback();
    },
    flush(callback) {
      if (pending.length && onFrame(pending)) this.push(pending);
      callback();
    },
  });
}

/** Minimal SSE frame reader: event name + joined data payload. */
export function parseSseFrame(frame: Buffer): { event: string | null; data: string | null } {
  let event: string | null = null;
  const data: string[] = [];
  for (const line of frame.toString('utf8').split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).trimStart());
    }
  }
  return { event, data: data.length ? data.join('\n') : null };
}
