/* ============================================================
 * AI 智能对话模块
 * - 支持任意 OpenAI 兼容接口（DeepSeek / 通义 / Kimi / 智谱 / Ollama 等）
 * - 流式输出（SSE）+ 非流式兜底
 * - 材料上传（.txt/.md/.json/.csv），场景提示词一键装载为系统指令
 * ============================================================ */
window.Chat = (function () {
  'use strict';

  const $ = s => document.querySelector(s);

  /* ---------- 服务商预设 ---------- */
  const PROVIDERS = [
    { key: 'deepseek', name: 'DeepSeek 官方（推荐）', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { key: 'qwen', name: '通义千问（阿里云百炼）', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    { key: 'kimi', name: 'Kimi（月之暗面）', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    { key: 'zhipu', name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    { key: 'openai', name: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { key: 'ollama', name: 'Ollama 本地（无需 API Key）', base: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
    { key: 'custom', name: '自定义（OpenAI 兼容协议）', base: '', model: '' }
  ];

  const DEFAULT_SYS = {
    title: '通用教育助手',
    content: '你是一位专业的教育工作者助手，请认真、准确、结构清晰地回答老师的问题，输出可直接使用的成果。'
  };

  const LS_SETTINGS = 'wb_ai_settings';
  const LS_HISTORY = 'wb_ai_history';
  const LS_SYS = 'wb_ai_sys';

  /* ---------- 存储 ---------- */
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  };

  let settings = store.get(LS_SETTINGS, { baseUrl: '', apiKey: '', model: '', temperature: 0.7, maxTokens: 4096 });
  let history = store.get(LS_HISTORY, []);
  let sys = store.get(LS_SYS, DEFAULT_SYS);
  let files = [];            // 待发送材料 [{name, content}]
  let streaming = false;
  let abortCtl = null;

  const hasConfig = () => settings.baseUrl && (settings.apiKey || settings.baseUrl.includes('localhost'));

  /* ---------- 轻提示复用 ---------- */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
    }
    return fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  /* ---------- 主视图 ---------- */
  function render() {
    const host = $('#main');
    const cfgOk = hasConfig();
    host.innerHTML = `
      <div class="chat-layout">
        <div class="chat-head">
          <div class="chat-title">🤖 AI 智能对话
            <span class="chat-sub">连接你的大模型，直接在页面里创作与处理资料</span>
          </div>
          <div class="chat-head-right">
            <button class="chip-btn" id="sysBtn" title="切换场景提示词（系统指令）">🧭 <span id="sysName">${esc(sys.title)}</span></button>
            <button class="chip-btn" id="newChatBtn" title="清空当前对话">🔄 新对话</button>
            <button class="chip-btn" id="chatSettingsBtn" title="连接大模型">⚙️ 模型设置</button>
          </div>
        </div>

        ${cfgOk ? '' : `
        <div class="chat-banner">
          🔌 尚未连接大模型：点击右上角 <b>⚙️ 模型设置</b>，选服务商、填 API Key 即可开始（支持 DeepSeek / 通义 / Kimi / 智谱 / OpenAI / 本地 Ollama）。
        </div>`}

        <div class="chat-messages" id="chatMessages">${messagesHTML()}</div>

        <div class="chat-input-wrap">
          ${files.length ? `<div class="chat-files" id="chatFiles">${files.map((f, i) =>
            `<span class="file-chip">${f.icon || '📄'} ${esc(f.name)} <button data-rmfile="${i}">✕</button></span>`).join('')}</div>` : ''}
          <textarea id="chatInput" rows="2" placeholder="输入问题或材料内容…（Enter 发送，Shift+Enter 换行；📎 支持 .txt/.md/.csv 及 Word / PPT / Excel 文档）"></textarea>
          <div class="chat-input-actions">
            <button class="chip-btn" id="fileBtn">📎 附材料</button>
            <input type="file" id="fileInput" accept=".txt,.md,.json,.csv,.log,.tsv,.docx,.pptx,.xlsx" multiple hidden>
            <span class="chat-hint">AI 输出仅供参考，请人工审核</span>
            <button class="btn" id="stopBtn" hidden>⏹ 停止</button>
            <button class="btn" id="sendBtn">发送 ➤</button>
          </div>
        </div>
      </div>`;

    bindChatEvents();
    const el = $('#chatMessages');
    el.scrollTop = el.scrollHeight;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function messagesHTML() {
    if (!history.length) {
      return `<div class="chat-empty">
        <div class="ce-icon">💬</div>
        <p><b>开始你的第一轮 AI 工作</b></p>
        <p class="ce-sub">两种方式任选：</p>
        <p class="ce-item">1️⃣ 从某个场景卡片 → 「用此场景开始 AI 对话」，AI 直接进入该角色（如磨课顾问、学情分析助手）；</p>
        <p class="ce-item">2️⃣ 直接在下框输入问题，或 📎 上传材料（Word / PPT / Excel / 文本）让 AI 帮你处理，如：分析成绩表、提炼课件要点、润色教案。</p>
      </div>`;
    }
    return history.map(m => m.role === 'user' ? userMsgHTML(m) : aiMsgHTML(m)).join('');
  }

  function userMsgHTML(m) {
    return `<div class="msg msg-user"><div class="msg-bubble">${esc(m.content).replace(/\n/g, '<br>')}</div></div>`;
  }

  function aiMsgHTML(m) {
    const body = m.reasoning
      ? `<details class="reasoning"><summary>💭 思考过程</summary><div>${esc(m.reasoning).replace(/\n/g, '<br>')}</div></details>` + mdRender(m.content)
      : mdRender(m.content);
    return `<div class="msg msg-ai"><div class="msg-ai-head"><span>🤖 AI</span><button class="copy-msg" data-copy="${encodeURIComponent(m.content)}">复制</button></div><div class="msg-bubble">${body}</div></div>`;
  }

  /* ---------- 聊天区事件 ---------- */
  function bindChatEvents() {
    const input = $('#chatInput');
    const send = $('#sendBtn');
    const stop = $('#stopBtn');

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
    });
    send.addEventListener('click', sendMsg);
    stop.addEventListener('click', () => { if (abortCtl) abortCtl.abort(); });

    $('#chatSettingsBtn').addEventListener('click', openSettings);
    $('#newChatBtn').addEventListener('click', () => {
      history = []; saveHistory();
      $('#chatMessages').innerHTML = messagesHTML();
      toast('🔄 已开启新对话');
    });
    $('#sysBtn').addEventListener('click', openSysModal);
    $('#fileBtn').addEventListener('click', () => $('#fileInput').click());
    $('#fileInput').addEventListener('change', e => {
      Array.from(e.target.files).forEach(async f => {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        const isOffice = ['docx', 'pptx', 'xlsx'].includes(ext);
        const icon = ext === 'docx' ? '📝' : ext === 'pptx' ? '🎞️' : ext === 'xlsx' ? '📊' : '📄';
        const limit = isOffice ? 20 * 1024 * 1024 : 400 * 1024;
        if (f.size > limit) {
          toast(`⚠️ ${f.name} 超出大小限制（${isOffice ? '20MB' : '400KB'}）`);
          return;
        }
        if (isOffice) {
          try {
            if (!window.OfficeParse) throw new Error('Office 解析模块未加载，请刷新页面');
            const text = await window.OfficeParse.parse(f);
            if (!text) throw new Error('未提取到文本内容');
            files.push({ name: f.name, content: text, icon });
            toast(`✅ ${f.name} 已解析（${(text.length / 1000).toFixed(1)}K 字）`);
          } catch (err) {
            toast(`⚠️ ${f.name} 解析失败：${err.message}`);
          }
          render();
          return;
        }
        const rd = new FileReader();
        rd.onload = () => { files.push({ name: f.name, content: rd.result, icon }); render(); };
        rd.onerror = () => toast(`⚠️ 读取 ${f.name} 失败`);
        rd.readAsText(f);
      });
      e.target.value = '';
    });

    // 删除材料
    const filesBox = $('#chatFiles');
    if (filesBox) filesBox.addEventListener('click', e => {
      const b = e.target.closest('[data-rmfile]');
      if (b) { files.splice(+b.dataset.rmfile, 1); render(); }
    });

    // 复制消息 / 复制代码块
    const msgs = $('#chatMessages');
    msgs.addEventListener('click', e => {
      const cp = e.target.closest('[data-copy]');
      if (cp) {
        copyText(decodeURIComponent(cp.dataset.copy)).then(ok => toast(ok ? '✅ 已复制' : '❌ 复制失败'));
        return;
      }
      const mc = e.target.closest('.md-copy');
      if (mc) {
        copyText(decodeURIComponent(mc.dataset.code)).then(ok => toast(ok ? '✅ 代码已复制' : '❌ 复制失败'));
      }
    });
  }

  /* ---------- 发送消息 ---------- */
  async function sendMsg() {
    if (streaming) return;
    const input = $('#chatInput');
    const text = input.value.trim();
    if (!text && !files.length) return;
    if (!hasConfig()) {
      toast('⚠️ 请先在 ⚙️ 模型设置 中连接大模型');
      openSettings();
      return;
    }

    // 组装用户消息（材料 + 文本）
    let content = text;
    if (files.length) {
      const mats = files.map(f => `【材料文件：${f.name}】\n${f.content}`).join('\n\n');
      content = mats + (text ? '\n\n' + text : '');
    }

    history.push({ role: 'user', content });
    files = [];
    input.value = '';
    saveHistory();
    rerenderKeepInput();

    const msgs = buildMessages(content);
    await streamChat(msgs);
  }

  function buildMessages(userContent) {
    const arr = [];
    if (sys && sys.content) arr.push({ role: 'system', content: sys.content });
    const tail = history.slice(-16);
    tail.forEach(m => arr.push({ role: m.role, content: m.content }));
    arr.push({ role: 'user', content: userContent });
    return arr;
  }

  /* 保留输入框焦点与内容的整体重绘 */
  function rerenderKeepInput() {
    const input = $('#chatInput');
    const val = input ? input.value : '';
    const box = $('#chatMessages');
    const top = box ? box.scrollTop : 0;
    render();
    const ni = $('#chatInput');
    if (ni) { ni.value = val; ni.focus(); }
    const nb = $('#chatMessages');
    if (nb) nb.scrollTop = nb.scrollHeight;
  }

  /* ---------- 流式请求 ---------- */
  async function streamChat(msgs) {
    streaming = true;
    abortCtl = new AbortController();
    const holder = { role: 'assistant', content: '', reasoning: '' };
    history.push(holder);
    saveHistory();
    rerenderKeepInput();

    const update = () => {
      const last = history[history.length - 1];
      last.content = holder.content;
      last.reasoning = holder.reasoning;
      const box = $('#chatMessages');
      if (!box) return;
      const nodes = box.querySelectorAll('.msg-ai');
      const lastNode = nodes[nodes.length - 1];
      if (lastNode) {
        const body = holder.reasoning
          ? `<details class="reasoning" open><summary>💭 思考过程</summary><div>${esc(holder.reasoning).replace(/\n/g, '<br>')}</div></details>` + mdRender(holder.content)
          : (holder.content ? mdRender(holder.content) : '<span class="typing">● ● ●</span>');
        lastNode.querySelector('.msg-bubble').innerHTML = body;
      }
      box.scrollTop = box.scrollHeight;
    };

    try {
      const ok = await requestStream(msgs, holder, update, abortCtl.signal);
      if (!ok) await nonStreamFallback(msgs, holder, update);
    } catch (err) {
      if (err.name === 'AbortError') {
        if (!holder.content) holder.content = '（已停止）';
        holder.content += '\n\n> ⏹ 已手动停止生成';
      } else if (err.__retryNonStream) {
        try {
          await nonStreamFallback(msgs, holder, update);
        } catch (err2) {
          holder.content = (holder.content || '') + `\n\n> ⚠️ 请求失败：${esc(err2.message)}\n> 请检查 ⚙️ 模型设置，或改用本地 Ollama / 兼容网关。`;
          update();
        }
      } else {
        holder.content = (holder.content || '') + `\n\n> ⚠️ 请求失败：${esc(err.message)}\n> 请检查 ⚙️ 模型设置，或改用本地 Ollama / 兼容网关。`;
        update();
      }
    } finally {
      streaming = false;
      abortCtl = null;
      saveHistory();
      render();
      const box = $('#chatMessages');
      if (box) box.scrollTop = box.scrollHeight;
    }
  }

  /* 非流式兜底请求 */
  async function nonStreamFallback(msgs, holder, update) {
    holder.content = '';
    holder.reasoning = '';
    const resp = await fetch(settings.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' },
        settings.apiKey ? { 'Authorization': 'Bearer ' + settings.apiKey } : {}),
      body: JSON.stringify({
        model: settings.model,
        messages: msgs,
        temperature: +settings.temperature,
        max_tokens: +settings.maxTokens || 4096,
        stream: false
      }),
      signal: abortCtl.signal
    });
    if (!resp.ok) throw await readErr(resp);
    const j = await resp.json();
    holder.content = j.choices?.[0]?.message?.content || '(空回复)';
    update();
  }

  /* OpenAI 兼容 SSE 流式解析；返回 true 表示流式成功 */
  async function requestStream(msgs, holder, update, signal) {
    const url = settings.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const resp = await fetch(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' },
        settings.apiKey ? { 'Authorization': 'Bearer ' + settings.apiKey } : {}),
      body: JSON.stringify({
        model: settings.model,
        messages: msgs,
        temperature: +settings.temperature,
        max_tokens: +settings.maxTokens || 4096,
        stream: true
      }),
      signal
    });
    if (!resp.ok) {
      const detail = await readErr(resp);
      // 若平台不支持流式，交由调用方走非流式兜底
      throw Object.assign(detail, { __retryNonStream: true });
    }
    if (!resp.body) return false;

    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const data = t.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          const delta = j.choices?.[0]?.delta;
          if (delta?.reasoning_content) holder.reasoning += delta.reasoning_content;
          if (delta?.content) holder.content += delta.content;
        } catch { /* 忽略无法解析的行 */ }
      }
      update();
    }
    if (!holder.content && !holder.reasoning) return false;
    return true;
  }

  async function readErr(resp) {
    let msg = `HTTP ${resp.status}`;
    try {
      const j = await resp.json();
      msg = j.error?.message || j.message || msg;
    } catch { /* 忽略 */ }
    return new Error(msg);
  }

  /* ---------- 场景提示词（系统指令） ---------- */
  function startWithScenario(id) {
    const s = SCENARIOS.find(x => x.id === id);
    if (!s) return;
    sys = {
      title: `场景 ${s.no} · ${s.title}`,
      content: s.prompt
    };
    store.set(LS_SYS, sys);
    toast(`🧭 已装载场景提示词「${s.title}」，AI 将扮演该角色`);
  }

  function openSysModal() {
    const mask = $('#sysMask');
    const sel = $('#sysSelect');
    sel.innerHTML = `<option value="">— 自定义 —</option>` +
      SCENARIOS.map(s => `<option value="${s.id}">${s.no} ${s.title}</option>`).join('');
    sel.value = '';
    const ta = $('#sysTextarea');
    ta.value = sys.content || '';
    $('#sysName2').textContent = sys.title;
    mask.hidden = false;

    sel.onchange = () => {
      if (!sel.value) { ta.value = sys.content || ''; return; }
      const s = SCENARIOS.find(x => x.id === +sel.value);
      if (s) ta.value = s.prompt;
    };
    $('#sysSaveBtn').onclick = () => {
      const val = ta.value.trim();
      const sid = sel.value;
      const s = sid ? SCENARIOS.find(x => x.id === +sid) : null;
      sys = {
        title: s ? `场景 ${s.no} · ${s.title}` : (val ? '自定义提示词' : '通用教育助手'),
        content: val || DEFAULT_SYS.content
      };
      store.set(LS_SYS, sys);
      mask.hidden = true;
      render();
      toast('✅ 场景提示词已应用');
    };
    $('#sysCancelBtn').onclick = () => { mask.hidden = true; };
    $('#sysClose').onclick = () => { mask.hidden = true; };
    mask.onclick = e => { if (e.target === mask) mask.hidden = true; };
  }

  /* ---------- 模型设置 ---------- */
  function openSettings() {
    const mask = $('#aiSettingsMask');
    const sel = $('#providerSel');
    sel.innerHTML = PROVIDERS.map((p, i) =>
      `<option value="${p.key}" ${(p.base === settings.baseUrl || (i === 0 && !settings.baseUrl)) ? 'selected' : ''}>${p.name}</option>`).join('');
    // 依据当前配置选中对应预设
    const match = PROVIDERS.find(p => p.base === settings.baseUrl);
    if (match) sel.value = match.key;
    else sel.value = settings.baseUrl ? 'custom' : 'deepseek';

    $('#baseUrlInput').value = settings.baseUrl || '';
    $('#apiKeyInput').value = settings.apiKey || '';
    $('#modelInput').value = settings.model || '';
    $('#tempRange').value = settings.temperature ?? 0.7;
    $('#tempVal').textContent = settings.temperature ?? 0.7;
    $('#maxTokInput').value = settings.maxTokens || 4096;
    $('#testConnStatus').textContent = '';
    mask.hidden = false;

    const applyPreset = () => {
      const p = PROVIDERS.find(x => x.key === sel.value);
      if (!p) return;
      $('#baseUrlInput').value = p.base;
      if (p.model) $('#modelInput').value = p.model;
    };
    sel.onchange = applyPreset;
    $('#tempRange').oninput = e => { $('#tempVal').textContent = e.target.value; };

    let showKey = false;
    $('#toggleKeyBtn').onclick = () => {
      showKey = !showKey;
      const k = $('#apiKeyInput');
      k.type = showKey ? 'text' : 'password';
      $('#toggleKeyBtn').textContent = showKey ? '隐藏' : '显示';
    };

    $('#testConnBtn').onclick = async () => {
      const st = $('#testConnStatus');
      st.textContent = '⏳ 正在测试…';
      st.style.color = '';
      const t0 = Date.now();
      try {
        const base = $('#baseUrlInput').value.trim().replace(/\/+$/, '');
        const key = $('#apiKeyInput').value.trim();
        const model = $('#modelInput').value.trim();
        if (!base || !model) throw new Error('接口地址与模型名称不能为空');
        const resp = await fetch(base + '/chat/completions', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { 'Authorization': 'Bearer ' + key } : {}),
          body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false })
        });
        if (!resp.ok) throw await readErr(resp);
        st.textContent = `✅ 连接成功：${model}（${Date.now() - t0}ms）`;
        st.style.color = '#10b981';
      } catch (err) {
        st.textContent = `❌ 连接失败：${err.message}（可尝试本地 Ollama 或兼容网关）`;
        st.style.color = '#e11d48';
      }
    };

    $('#saveSettingsBtn').onclick = () => {
      settings = {
        baseUrl: $('#baseUrlInput').value.trim(),
        apiKey: $('#apiKeyInput').value.trim(),
        model: $('#modelInput').value.trim(),
        temperature: +$('#tempRange').value,
        maxTokens: +$('#maxTokInput').value || 4096
      };
      store.set(LS_SETTINGS, settings);
      mask.hidden = true;
      render();
      toast(hasConfig() ? '✅ 已保存并连接模型' : 'ℹ️ 已保存设置，请填写接口地址与 Key');
    };
    $('#cancelSettingsBtn').onclick = () => { mask.hidden = true; };
    $('#aiSettingsClose').onclick = () => { mask.hidden = true; };
    mask.onclick = e => { if (e.target === mask) mask.hidden = true; };
  }

  function saveHistory() {
    store.set(LS_HISTORY, history.slice(-40));
  }

  return {
    render,
    startWithScenario,
    openSettings,
    openSysModal,
    hasConfig
  };
})();
