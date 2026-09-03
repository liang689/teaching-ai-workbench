/* ============================================================
 * Office 文档文本提取器（浏览器端）
 * 支持：.docx（Word）/ .pptx（PPT）/ .xlsx（Excel）
 * 原理：Office Open XML 本质是 ZIP + XML，用 JSZip 解包后抽取正文文本
 * 依赖：js/vendor/jszip.min.js
 * ============================================================ */
window.OfficeParse = (function () {
  'use strict';

  const MAX_LEN = 30000; // 单文件提取上限，防止撑爆模型上下文
  const SUPPORTED = ['docx', 'pptx', 'xlsx'];

  const extOf = name => (name.split('.').pop() || '').toLowerCase();
  const isOffice = name => SUPPORTED.includes(extOf(name));

  /* XML 字符串 → DOM 文档 */
  function toDoc(xml) {
    const DP = (typeof DOMParser !== 'undefined') ? DOMParser : (window.DOMParser || null);
    if (!DP) throw new Error('当前环境不支持 XML 解析（DOMParser 不可用）');
    const doc = new DP().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error('XML 解析失败（文件可能已损坏或加密）');
    }
    return doc;
  }

  /* 取命名空间无关的元素列表 */
  const els = (root, tag) => Array.from(root.getElementsByTagNameNS('*', tag));

  /* 提取元素内的纯文本（含制表符、换行处理） */
  function elText(el) {
    let out = '';
    for (const c of el.childNodes) {
      if (c.nodeType === 3) { out += c.nodeValue; continue; }
      const t = c.localName;
      if (t === 'tab') out += '\t';
      else if (t === 'br' || t === 'cr') out += '\n';
      else out += elText(c);
    }
    return out;
  }

  const numOf = n => { const m = String(n).match(/(\d+)/); return m ? +m[1] : 0; };

  /* 统一收尾：去尾空白、去空行、超长截断 */
  function trimJoin(arr) {
    const text = arr.map(s => s.replace(/\s+$/, '')).filter(s => s.trim() !== '').join('\n');
    return text.length > MAX_LEN
      ? text.slice(0, MAX_LEN) + `\n\n…（内容过长，已截取前 ${MAX_LEN} 字，建议分段处理）`
      : text;
  }

  /* ---------------- Word (.docx) ---------------- */
  async function parseDocx(zip) {
    const entry = zip.file('word/document.xml');
    if (!entry) throw new Error('不是有效的 Word 文档（缺少 document.xml）');
    const doc = toDoc(await entry.async('string'));
    return trimJoin(els(doc, 'p').map(elText));
  }

  /* ---------------- PPT (.pptx) ---------------- */
  async function parsePptx(zip) {
    const slides = Object.keys(zip.files)
      .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => numOf(a) - numOf(b));
    if (!slides.length) throw new Error('不是有效的 PPT 文档（未找到幻灯片内容）');

    const parts = [];
    for (const f of slides) {
      const n = numOf(f);
      const doc = toDoc(await zip.file(f).async('string'));
      const texts = els(doc, 't').map(t => t.textContent.trim()).filter(Boolean);
      let body = texts.join('\n');

      // 附带演讲者备注
      const notes = zip.file(`ppt/notesSlides/notesSlide${n}.xml`);
      if (notes) {
        const nd = toDoc(await notes.async('string'));
        const nt = els(nd, 't').map(t => t.textContent.trim()).filter(Boolean);
        if (nt.length) body += '\n【备注】' + nt.join('\n');
      }
      parts.push(`【幻灯片 ${n}】\n${body}`);
    }
    return trimJoin(parts);
  }

  /* ---------------- Excel (.xlsx) ---------------- */
  async function parseXlsx(zip) {
    // 共享字符串表
    let shared = [];
    const ss = zip.file('xl/sharedStrings.xml');
    if (ss) {
      const doc = toDoc(await ss.async('string'));
      shared = els(doc, 'si').map(elText);
    }

    // 工作表名（通过 workbook.xml + rels 映射）
    const relTarget = {};
    const rels = zip.file('xl/_rels/workbook.xml.rels');
    if (rels) {
      const doc = toDoc(await rels.async('string'));
      els(doc, 'Relationship').forEach(r => {
        relTarget[r.getAttribute('Id')] = r.getAttribute('Target');
      });
    }
    const nameByFile = {};
    const wb = zip.file('xl/workbook.xml');
    if (wb) {
      const doc = toDoc(await wb.async('string'));
      els(doc, 'sheet').forEach(s => {
        const rid = s.getAttribute('r:id');
        if (!rid) return;
        const tgt = relTarget[rid];
        if (!tgt) return;
        nameByFile['xl/' + tgt.replace(/^\/+/, '')] = s.getAttribute('name');
      });
    }

    const sheets = Object.keys(zip.files)
      .filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort((a, b) => numOf(a) - numOf(b));
    const parts = [];

    for (const f of sheets) {
      const doc = toDoc(await zip.file(f).async('string'));
      const rows = [];
      for (const r of els(doc, 'row')) {
        const vals = els(r, 'c').map(c => {
          const t = c.getAttribute('t');
          const is = c.getElementsByTagNameNS('*', 'is')[0];
          if (t === 'inlineStr' && is) return elText(is);
          const v = c.getElementsByTagNameNS('*', 'v')[0];
          if (!v) return '';
          const raw = v.textContent;
          if (t === 's') {
            const idx = +raw;
            return shared[idx] !== undefined ? shared[idx] : '';
          }
          return raw; // 数字 / 布尔 / 日期等原样输出
        }).map(s => (s || '').trim());

        if (vals.some(v => v !== '')) rows.push(vals.join('\t'));
      }
      const name = nameByFile[f] || `工作表 ${numOf(f)}`;
      parts.push(`【${name}】\n${rows.join('\n')}`);
    }
    return trimJoin(parts);
  }

  /* ---------------- 入口 ---------------- */
  async function parse(file) {
    const ext = extOf(file.name);
    if (!SUPPORTED.includes(ext)) return null;
    const JZ = (typeof JSZip !== 'undefined') ? JSZip : (window.JSZip || null);
    if (!JZ) throw new Error('Office 解析库未加载，请刷新页面重试');
    // 统一转为 ArrayBuffer：浏览器 File/Blob 与 Node 环境都兼容
    const data = (typeof file.arrayBuffer === 'function') ? await file.arrayBuffer() : file;
    const zip = await JZ.loadAsync(data);
    if (ext === 'docx') return parseDocx(zip);
    if (ext === 'pptx') return parsePptx(zip);
    return parseXlsx(zip);
  }

  return { parse, isOffice };
})();
