import readmeRaw from 'virtual:readme';

/** 极简 Markdown → JSX 解析器 (仅 README 中使用的语法) */
function parseMd(src: string) {
  const lines = src.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let inCode = false;
  let codeBuffer = '';
  let codeLang = '';

  const pushNode = (node: React.ReactNode) => { nodes.push(node); };

  while (i < lines.length) {
    let line = lines[i];

    // code block toggle
    if (/^```/.test(line.trim())) {
      if (inCode) {
        pushNode(<pre key={i} style={{ background: 'rgba(0,0,0,0.05)', padding: 12, borderRadius: 6, fontSize: 12, lineHeight: 1.6, overflowX: 'auto' }}><code>{codeBuffer.trimEnd()}</code></pre>);
        codeBuffer = '';
        inCode = false;
      } else {
        codeLang = line.trim().slice(3);
        inCode = true;
      }
      i++; continue;
    }
    if (inCode) {
      codeBuffer += line + '\n';
      i++; continue;
    }

    // blank
    if (line.trim() === '') { i++; continue; }

    // heading
    const hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      const lvl = hMatch[1].length;
      const text = hMatch[2];
      if (lvl === 1) {
        pushNode(<div key={i} className="panel-header">{text}</div>);
      } else {
        pushNode(<h3 key={i} style={{ color: 'var(--highlight)', marginBottom: 8 }}>{text}</h3>);
      }
      i++; continue;
    }

    // table — collect lines starting with |
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const rows = tableLines.map(r => r.split('|').filter(c => c.trim() !== '').map(c => c.trim()));
      if (rows.length < 2) continue;
      const header = rows[0];
      const body = rows.filter((_, idx) => idx > 0 && !/^[-:\s|]+$/.test(tableLines[idx]));
      pushNode(
        <table key={i - tableLines.length} style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 600, fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {header.map((h, hi) => <th key={hi} style={{ textAlign: 'left', padding: '4px 8px' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
                {row.map((c, ci) => <td key={ci} style={{ padding: '4px 8px', color: ci > 0 ? 'var(--text-dim)' : undefined }}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }

    // unordered list — collect consecutive -  / * lines
    if (/^[-*]\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      pushNode(
        <ol key={i - items.length} style={{ paddingLeft: 20 }}>
          {items.map((item, ii) => (
            <li key={ii}>{inlineParse(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // paragraph (consecutive non-empty non-special lines)
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^[#|`>\-*]/.test(lines[i].trim())) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length === 1) {
      pushNode(<p key={i - paraLines.length}>{inlineParse(paraLines[0])}</p>);
    } else {
      pushNode(<p key={i - paraLines.length}>{paraLines.map((pl, pli) => <span key={pli}>{inlineParse(pl)}{pli < paraLines.length - 1 && <br />}</span>)}</p>);
    }
  }

  return <>{nodes}</>;

  function inlineParse(text: string): React.ReactNode {
    // link
    const parts = text.split(/(\[.+?\]\(.+?\))/g);
    return parts.map((part, idx) => {
      const lm = part.match(/\[(.+?)\]\((.+?)\)/);
      if (lm) {
        return <a key={idx} href={lm[2]} target="_blank" rel="noopener" style={{ color: 'var(--highlight)' }}>{lm[1]}</a>;
      }
      // bold
      const bParts = part.split(/(\*\*.*?\*\*)/g);
      return bParts.map((bp, bi) => {
        const bm = bp.match(/^\*\*(.+?)\*\*$/);
        if (bm) return <strong key={bi}>{bm[1]}</strong>;
        // inline code
        const cParts = bp.split(/(`.*?`)/g);
        return cParts.map((cp, ci) => {
          const cm = cp.match(/^`(.+?)`$/);
          if (cm) return <code key={ci} style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 3, fontSize: '0.92em' }}>{cm[1]}</code>;
          return cp;
        });
      });
    });
  }
}

export default function HomePage() {
  const content = parseMd(readmeRaw);
  return (
    <div className="page-wrapper">
      <div className="page-box">
        <div className="page-group">
          <div className="panel page-col-full" style={{ overflowY: 'auto', lineHeight: 1.9, fontSize: 14 }}>
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}
