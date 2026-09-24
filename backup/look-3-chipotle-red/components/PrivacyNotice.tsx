/**
 * The privacy notice, shown in full.
 *
 * Fetched from the server rather than duplicated here, so there is exactly one
 * copy of it and the version a person agrees to is the version they read.
 *
 * The markdown rendering is deliberately small — headings, lists, tables, bold
 * and paragraphs — because pulling in a markdown library to display one
 * document the app itself authors would be a lot of bytes for no benefit.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Sheet } from './Sheet';

interface Notice {
  version: string;
  effective: string;
  markdown: string;
}

/** Bold spans inside a line of text. */
function inline(text: string, key: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={`${key}-${index}`}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={`${key}-${index}`}>{part}</span>
    ),
  );
}

function render(markdown: string) {
  const blocks: React.ReactNode[] = [];
  const lines = markdown.split('\n');
  let list: string[] = [];
  let table: string[][] = [];
  /*
   * The source is hard-wrapped at about eighty columns for readability in the
   * editor. Treating each wrapped line as its own paragraph breaks sentences
   * into ragged fragments, so lines are joined until a blank one ends the
   * paragraph — which is what the blank line means in markdown anyway.
   */
  let paragraph: string[] = [];

  const flushList = (key: string) => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`ul-${key}`} className="policy-list">
        {list.map((item, index) => (
          <li key={index}>{inline(item, `${key}-${index}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  const flushTable = (key: string) => {
    if (table.length === 0) return;
    const [head, ...rows] = table;
    blocks.push(
      <div key={`tw-${key}`} className="policy-table-wrap">
        <table className="policy-table">
          <thead>
            <tr>{head!.map((cell, i) => <th key={i}>{inline(cell, `h${i}`)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>{row.map((cell, c) => <td key={c}>{inline(cell, `c${r}${c}`)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = [];
  };

  const flushParagraph = (key: string) => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ');
    blocks.push(<p key={`p-${key}`}>{inline(text, key)}</p>);
    paragraph = [];
  };

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const key = String(index);

    if (line.startsWith('|')) {
      flushParagraph(key);
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      // the |---|---| separator row carries no content
      if (!cells.every((cell) => /^:?-+:?$/.test(cell))) table.push(cells);
      return;
    }
    flushTable(key);

    if (line.startsWith('- ')) {
      flushParagraph(key);
      list.push(line.slice(2));
      return;
    }
    // a wrapped continuation of the bullet above, not a new paragraph
    if (list.length > 0 && line.startsWith('  ') && line.trim() !== '') {
      list[list.length - 1] += ` ${line.trim()}`;
      return;
    }
    flushList(key);

    if (line === '' || line === '---') {
      flushParagraph(key);
      return;
    }
    if (line.startsWith('#')) {
      flushParagraph(key);
      // the sheet already carries the document's title
      if (line.startsWith('### ')) blocks.push(<h4 key={key}>{line.slice(4)}</h4>);
      else if (line.startsWith('## ')) blocks.push(<h3 key={key}>{line.slice(3)}</h3>);
      return;
    }
    paragraph.push(line.trim());
  });

  flushParagraph('end');
  flushList('end');
  flushTable('end');
  return blocks;
}

export function PrivacyNotice({ onClose }: { onClose: () => void }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get<Notice>('/api/auth/privacy')
      .then((data) => live && setNotice(data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  return (
    <Sheet title="Privacy notice" onClose={onClose}>
      {failed ? (
        <div className="banner error">Could not load the notice. Please try again before agreeing.</div>
      ) : !notice ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="policy">{render(notice.markdown)}</div>
      )}
      <button type="button" className="btn-block" style={{ marginTop: 16 }} onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}
