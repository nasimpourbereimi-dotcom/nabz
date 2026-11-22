// A tiny, safe Markdown renderer for the bundled Shortcuts guide (works offline; no innerHTML).
// Supports what the guide uses: headings, paragraphs, ordered/bulleted lists with nesting,
// blockquotes, tables, fenced code, horizontal rules, **bold** and `code`.
import type { ComponentChildren } from 'preact';

function inline(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith('**') ? <b key={k++}>{inline(t.slice(2, -2))}</b> : <code key={k++} class="md-code" dir="ltr">{t.slice(1, -1)}</code>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r/g, '').split('\n');
  const blocks: ComponentChildren[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={k++} class="md-pre" dir="ltr">{code.join('\n')}</pre>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const style = level === 1 ? 'font-size:24px;font-weight:900' : level === 2 ? 'font-size:19px;font-weight:900;margin-top:20px' : 'font-size:15px;font-weight:700;margin-top:12px';
      blocks.push(<div key={k++} role="heading" aria-level={level} style={style}>{inline(h[2])}</div>);
      i++;
      continue;
    }
    if (/^---+\s*$/.test(line)) { blocks.push(<hr key={k++} class="md-hr" />); i++; continue; }
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|[\s|:-]+\|?\s*$/.test(lines[i])) rows.push(cells(lines[i]));
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={k++} style="overflow-x:auto">
          <table class="md-table">
            <thead><tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
            <tbody>{body.map((r, j) => <tr key={j}>{r.map((c, n) => <td key={n}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (line.startsWith('>')) {
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<div key={k++} class="card suggest small" style="line-height:1.9;margin-top:8px">{inline(q.join(' '))}</div>);
      continue;
    }
    const li = /^(\s*)(\d+\.|-)\s+(.*)$/.exec(line);
    if (li) {
      const indent = Math.floor(li[1].length / 2);
      const marker = li[2] === '-' ? '•' : li[2].replace('.', '');
      // continuation lines (indented, not a new item) belong to this item
      const parts = [li[3]];
      i++;
      while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*(\d+\.|-)\s+/.test(lines[i])) parts.push(lines[i++].trim());
      blocks.push(
        <div key={k++} class="md-li" style={{ paddingInlineStart: `${indent * 16}px` }}>
          <span class="md-marker">{/\d/.test(marker) ? Number(marker).toLocaleString('fa-IR') : marker}</span>
          <span>{inline(parts.join(' '))}</span>
        </div>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#|```|\||>|---|\s*(\d+\.|-)\s)/.test(lines[i])) para.push(lines[i++].trim());
    blocks.push(<p key={k++} style="margin:8px 0;line-height:1.9;font-size:14px">{inline(para.join(' '))}</p>);
  }
  return <div class="md">{blocks}</div>;
}
