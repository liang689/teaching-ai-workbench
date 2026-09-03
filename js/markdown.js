/* ============================================================
 * 迷你 Markdown 渲染器（零依赖，供 AI 回复使用）
 * 支持：标题 / 加粗 / 斜体 / 删除线 / 行内代码 / 代码块 / 列表 /
 *       引用 / 表格 / 分隔线 / 链接 / 段落
 * 安全：先转义 HTML，链接仅允许 http(s)
 * ============================================================ */
window.mdRender = (function () {
  'use strict';

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  const enc = s => encodeURIComponent(s);

  /* 行内样式 */
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return s;
  }

  function codeBlock(lang, code) {
    const name = lang || 'code';
    return `<div class="md-code"><div class="md-code-head"><span>${esc(name)}</span>` +
      `<button class="md-copy" data-code="${enc(code)}">复制</button></div>` +
      `<pre><code>${esc(code)}</code></pre></div>`;
  }

  function render(md) {
    if (!md) return '';
    const lines = String(md).replace(/\r\n/g, '\n').split('\n');
    let html = '';
    let i = 0;
    const isBlank = l => /^\s*$/.test(l);

    while (i < lines.length) {
      const line = lines[i];

      /* 围栏代码块 */
      const fm = line.match(/^```(\w*)/);
      if (fm) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // 跳过闭合
        html += codeBlock(fm[1], buf.join('\n'));
        continue;
      }

      if (isBlank(line)) { i++; continue; }

      /* 标题 */
      const h = line.match(/^(#{1,6})\s+(.*)/);
      if (h) {
        const lvl = h[1].length;
        html += `<h${lvl}>${inline(h[2])}</h${lvl}>`;
        i++;
        continue;
      }

      /* 引用 */
      if (/^>\s?/.test(line)) {
        const buf = [line.replace(/^>\s?/, '')];
        i++;
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        html += `<blockquote>${inline(buf.join(' '))}</blockquote>`;
        continue;
      }

      /* 无序列表 */
      const ul = line.match(/^[-*+]\s+(.*)/);
      if (ul && !/^[-*+]\s*$/.test(line)) {
        const buf = [ul[1]];
        i++;
        while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
          buf.push(lines[i].replace(/^[-*+]\s+/, ''));
          i++;
        }
        html += `<ul>${buf.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`;
        continue;
      }

      /* 有序列表 */
      const ol = line.match(/^\d+\.\s+(.*)/);
      if (ol) {
        const buf = [ol[1]];
        i++;
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          buf.push(lines[i].replace(/^\d+\.\s+/, ''));
          i++;
        }
        html += `<ol>${buf.map(x => `<li>${inline(x)}</li>`).join('')}</ol>`;
        continue;
      }

      /* 分隔线 */
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
        html += '<hr>';
        i++;
        continue;
      }

      /* 表格 */
      if (line.includes('|') && i + 1 < lines.length &&
          /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) &&
          lines[i + 1].includes('-') && lines[i + 1].includes('|')) {
        const head = line.split('|').map(c => c.trim()).filter(c => c !== '');
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes('|')) {
          rows.push(lines[i].split('|').map(c => c.trim()).filter(c => c !== ''));
          i++;
        }
        html += `<div class="md-table-wrap"><table><thead><tr>` +
          head.map(c => `<th>${inline(c)}</th>`).join('') + `</tr></thead><tbody>` +
          rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') +
          `</tbody></table></div>`;
        continue;
      }

      /* 段落（合并至空行或下一块起始） */
      const buf = [line];
      i++;
      while (i < lines.length && !isBlank(lines[i]) && !/^```/.test(lines[i]) &&
             !/^#{1,6}\s/.test(lines[i]) && !/^[-*+]\s/.test(lines[i]) &&
             !/^\d+\.\s/.test(lines[i]) && !/^>\s?/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      html += `<p>${inline(buf.join(' '))}</p>`;
    }
    return html;
  }

  return render;
})();
