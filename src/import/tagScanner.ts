/**
 * A tolerant, streaming XML *tag* scanner, specialised for Apple Health export.xml.
 *
 * Why not a full SAX parser: exports from some iOS versions contain invalid XML, and a strict parser stops
 * at the first error, losing years of data. We only need start/end tags and their attributes (the file has
 * no text content we care about), so we scan tags, skip anything malformed, and keep going.
 *
 * Fast path: `seek` lets the consumer jump to the next occurrence of a literal (e.g. "<Workout ")
 * using native indexOf instead of visiting every tag.
 */
export interface Tag {
  name: string;
  /** Raw attribute text; parse lazily with parseAttrs() only for tags you care about. */
  raw: string;
  isEnd: boolean;
  selfClosing: boolean;
}

const MAX_TAG = 1 << 20; // 1 MB: anything longer is garbage

export class TagScanner {
  private buf = '';
  /** When set, skip directly to the next occurrence of this literal. */
  seek: string | null = null;
  malformed = 0;

  constructor(private onTag: (tag: Tag) => void) {}

  push(chunk: string): void {
    this.buf = this.buf.length ? this.buf + chunk : chunk;
    this.drain(false);
  }

  end(): void {
    this.drain(true);
    this.buf = '';
  }

  private drain(final: boolean): void {
    const buf = this.buf;
    let pos = 0;
    for (;;) {
      let lt: number;
      if (this.seek) {
        lt = buf.indexOf(this.seek, pos);
        if (lt < 0) {
          // keep a tail in case the literal straddles the chunk boundary
          pos = Math.max(pos, buf.length - this.seek.length);
          break;
        }
      } else {
        lt = buf.indexOf('<', pos);
        if (lt < 0) { pos = buf.length; break; }
      }

      // Comments and declarations (<!-- -->, <!DOCTYPE, <!ELEMENT, <?xml)
      const c1 = buf.charCodeAt(lt + 1);
      if (c1 === 33 /* ! */ && buf.startsWith('<!--', lt)) {
        const e = buf.indexOf('-->', lt + 4);
        if (e < 0) { pos = lt; break; }
        pos = e + 3;
        continue;
      }

      const gt = this.findTagEnd(buf, lt);
      if (gt === -1) { pos = lt; break; } // need more data
      if (gt === -2) {
        // broken tag: resume after the next newline
        this.malformed++;
        const nl = buf.indexOf('\n', lt + 1);
        if (nl < 0) { pos = lt; if (final || buf.length - lt > MAX_TAG) pos = buf.length; break; }
        pos = nl + 1;
        continue;
      }
      pos = gt + 1;
      if (c1 === 33 || c1 === 63 /* ? */) continue;

      const isEnd = c1 === 47; /* / */
      const nameStart = isEnd ? lt + 2 : lt + 1;
      let nameEnd = nameStart;
      while (nameEnd < gt) {
        const ch = buf.charCodeAt(nameEnd);
        if (ch === 32 || ch === 10 || ch === 13 || ch === 9 || ch === 47 || ch === 62) break;
        nameEnd++;
      }
      if (nameEnd === nameStart) { this.malformed++; continue; }
      const selfClosing = buf.charCodeAt(gt - 1) === 47;
      this.onTag({
        name: buf.slice(nameStart, nameEnd),
        raw: buf.slice(nameEnd, selfClosing ? gt - 1 : gt),
        isEnd,
        selfClosing,
      });
    }
    this.buf = pos >= buf.length ? '' : buf.slice(pos);
    if (final) this.buf = '';
  }

  /** Index of the '>' closing the tag at lt, respecting quotes. -1 = need more data, -2 = broken. */
  private findTagEnd(buf: string, lt: number): number {
    let from = lt + 1;
    for (;;) {
      const gt = buf.indexOf('>', from);
      const q = buf.indexOf('"', from);
      if (q !== -1 && (gt === -1 || q < gt)) {
        // opening quote before '>': find its closing quote, which must be on the same line
        const q2 = buf.indexOf('"', q + 1);
        const nl = buf.indexOf('\n', q + 1);
        if (q2 === -1) {
          if (nl !== -1) return -2;
          return buf.length - lt > MAX_TAG ? -2 : -1;
        }
        if (nl !== -1 && nl < q2) return -2;
        from = q2 + 1;
        continue;
      }
      if (gt === -1) return buf.length - lt > MAX_TAG ? -2 : -1;
      // A '<' before '>' outside quotes means this tag never closed.
      const nextLt = buf.indexOf('<', lt + 1);
      if (nextLt !== -1 && nextLt < gt && buf.charCodeAt(lt + 1) !== 33) return -2;
      return gt;
    }
  }
}

const ATTR_RE = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
const ENTITY_RE = /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(ENTITY_RE, (_, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : ENTITIES[e],
  );
}

export function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(raw))) out[m[1]] = decodeEntities(m[2]);
  return out;
}

/** Fast single attribute read without building an object (hot path for millions of Records). */
export function attr(raw: string, name: string): string | undefined {
  const key = ` ${name}="`;
  let i = raw.indexOf(key);
  if (i < 0) {
    // attribute may follow a newline / tab instead of a space
    const m = new RegExp(`\\s${name}="`).exec(raw);
    if (!m) return undefined;
    i = m.index;
  }
  const s = i + key.length;
  const e = raw.indexOf('"', s);
  if (e < 0) return undefined;
  return decodeEntities(raw.slice(s, e));
}
