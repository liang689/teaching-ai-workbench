/* ============================================================
 * 教学全链路智能工作台 · 交互逻辑
 * ============================================================ */
(() => {
  'use strict';

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  /* ---------- 状态 ---------- */
  const state = {
    role: 'all',          // all | teacher | researcher
    view: 'dashboard',    // dashboard | dim | favorites | about | search
    dim: null,
    query: ''
  };

  const store = {
    get(key, def) { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } },
    set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
  };
  const favs = () => store.get('wb_favs', []);
  const recents = () => store.get('wb_recents', []);

  /* ---------- 工具 ---------- */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
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

  const roleName = r => (r === 'teacher' ? '教师' : r === 'researcher' ? '教研' : '');

  /* ---------- 筛选 ---------- */
  function visibleScenarios() {
    let list = SCENARIOS;
    if (state.role !== 'all') list = list.filter(s => s.roles.includes(state.role));
    if (state.query) {
      const q = state.query.toLowerCase();
      list = list.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.audience.toLowerCase().includes(q) ||
        s.action.toLowerCase().includes(q) ||
        s.prompt.toLowerCase().includes(q) ||
        s.materials.some(m => m.toLowerCase().includes(q)) ||
        (dimOf(s.dim).name.toLowerCase().includes(q))
      );
    }
    return list;
  }

  /* ---------- 场景卡片模板 ---------- */
  function cardHTML(s) {
    const d = dimOf(s.dim);
    const fav = favs().includes(s.id);
    const roleTxt = s.roles.map(roleName).join(' / ');
    return `
    <article class="card" data-id="${s.id}">
      <div class="card-top">
        <span class="card-no">${s.no}</span>
        <span class="card-dim" style="background:${d.color}">${d.key} · ${d.short}</span>
        <button class="card-fav ${fav ? 'on' : ''}" data-fav="${s.id}" title="${fav ? '取消收藏' : '收藏'}">${fav ? '★' : '☆'}</button>
      </div>
      <h3>${esc(s.title)}</h3>
      <div class="line"><b>👥 适合谁：</b>${esc(s.audience)}</div>
      <div class="line"><b>⚡ 能干什么：</b>${esc(s.action)}</div>
      <div class="line" style="color:var(--text-3)">🔑 视角：${roleTxt}</div>
      <div class="mats">${s.materials.slice(0, 3).map(m => `<span class="mat-chip">${esc(m)}</span>`).join('')}</div>
      <button class="open-btn">查看提示词 →</button>
    </article>`;
  }

  function cardsGrid(list) {
    if (!list.length) {
      return `<div class="empty-state"><div class="e-icon">🔍</div><p>没有匹配的场景，换个关键词试试吧</p></div>`;
    }
    return `<div class="cards-grid">${list.map(cardHTML).join('')}</div>`;
  }

  /* ---------- 仪表盘 ---------- */
  function renderDashboard() {
    const now = new Date();
    const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
    const roleTxt = state.role === 'all' ? '老师 & 教研员' : roleName(state.role);
    const myFavs = favs().length;

    const byDim = DIMENSIONS.map(d => {
      const n = SCENARIOS.filter(s => s.dim === d.key).length;
      return { d, n };
    });

    // 角色推荐
    let recommended = SCENARIOS;
    if (state.role !== 'all') recommended = recommended.filter(s => s.roles.includes(state.role));
    const topRec = recommended.slice(0, 6);
    const allRec = recommended.slice(6);

    const recentsList = recents().map(scenarioOf).filter(Boolean).slice(0, 6);

    const teacherCount = SCENARIOS.filter(s => s.roles.includes('teacher')).length;
    const researcherCount = SCENARIOS.filter(s => s.roles.includes('researcher')).length;

    $('#main').innerHTML = `
      <div class="hero">
        <div>
          <h2>👋 你好，${roleTxt}</h2>
          <p>这里是你的教学 AI 工作台 —— 覆盖「赛 · 训 · 教 · 研 · 评 · 管」全链路的 ${SCENARIOS.length} 个场景提示词，复制即用。</p>
        </div>
        <div class="hero-date">
          <div>${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日</div>
          <div class="big">星期${week}</div>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-card"><div class="s-icon" style="background:var(--primary-light)">🧩</div>
          <div><div class="s-num">${SCENARIOS.length}</div><div class="s-label">个 AI 场景</div></div></div>
        <div class="stat-card"><div class="s-icon" style="background:#fef3e2">🏆</div>
          <div><div class="s-num">6</div><div class="s-label">大维度</div></div></div>
        <div class="stat-card"><div class="s-icon" style="background:#e7f7f3">👩‍🏫</div>
          <div><div class="s-num">${teacherCount}</div><div class="s-label">教师场景</div></div></div>
        <div class="stat-card"><div class="s-icon" style="background:#f3ecff">🔬</div>
          <div><div class="s-num">${researcherCount}</div><div class="s-label">教研场景</div></div></div>
        <div class="stat-card"><div class="s-icon" style="background:#fff8dc">⭐</div>
          <div><div class="s-num">${myFavs}</div><div class="s-label">已收藏</div></div></div>
      </div>

      <div class="section-title">🗂️ 六大维度快捷入口<span class="more"></span></div>
      <div class="dim-grid">
        ${byDim.map(({ d, n }) => `
          <div class="dim-card" data-goto-dim="${d.key}">
            <div class="bar" style="background:${d.color}"></div>
            <div class="d-top">
              <div class="d-icon" style="--d-bg:${d.color}22">${d.icon}</div>
              <h3>${d.name}</h3>
            </div>
            <div class="d-desc">${d.desc}</div>
            <div class="d-foot"><span>${n} 个场景</span><span style="color:${d.color};font-weight:700">进入 →</span></div>
          </div>`).join('')}
      </div>

      ${recentsList.length ? `
      <div class="section-title">🕘 最近使用</div>
      <div class="cards-grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
        ${recentsList.map(s => {
          const d = dimOf(s.dim);
          return `<article class="card" data-id="${s.id}" style="padding:14px 16px">
            <div class="card-top" style="margin-bottom:6px"><span class="card-no">${s.no}</span>
            <span class="card-dim" style="background:${d.color}">${d.key}</span></div>
            <h3 style="font-size:14.5px;margin-bottom:4px">${esc(s.title)}</h3>
            <div class="line" style="font-size:11.5px">${esc(s.action)}</div>
          </article>`;
        }).join('')}
      </div>` : ''}

      <div class="section-title">⭐ 为你推荐<span class="more"></span></div>
      ${cardsGrid(topRec)}
      ${allRec.length ? `
      <div class="section-title">更多场景</div>
      ${cardsGrid(allRec)}` : ''}
    `;
  }

  /* ---------- 维度视图 ---------- */
  function renderDimView() {
    const d = dimOf(state.dim);
    const list = SCENARIOS.filter(s => s.dim === state.dim);
    const rel = list.filter(s => state.role === 'all' || s.roles.includes(state.role));
    $('#main').innerHTML = `
      <div class="view-head">
        <h2><span style="color:${d.color}">${d.icon}</span> ${d.name}</h2>
        <div class="sub">${d.desc} · 共 ${list.length} 个场景${state.role !== 'all' ? `（当前视角：${roleName(state.role)}，显示 ${rel.length} 个）` : ''}</div>
      </div>
      ${cardsGrid(rel)}`;
  }

  /* ---------- 收藏夹 ---------- */
  function renderFavorites() {
    const list = SCENARIOS.filter(s => favs().includes(s.id));
    $('#main').innerHTML = `
      <div class="view-head">
        <h2>⭐ 我的收藏</h2>
        <div class="sub">${list.length ? `已收藏 ${list.length} 个场景` : '还没有收藏任何场景'}</div>
      </div>
      ${list.length ? `<div class="cards-grid">${list.map(cardHTML).join('')}</div>`
        : `<div class="empty-state"><div class="e-icon">⭐</div><p>点击场景卡片右上角的 ☆ 即可收藏，方便下次快速找到</p></div>`}`;
  }

  /* ---------- 使用说明 ---------- */
  function renderAbout() {
    $('#main').innerHTML = `
      <div class="view-head"><h2>💡 使用说明</h2></div>
      <div class="about-grid">
        <div class="about-card">
          <h3>🧩 工作台是什么</h3>
          <p>本工作台依据公众号文章《从备课到评课，20个WorkBuddy场景帮你搞定教学全链路》整理而成，
          将 20 个可直接使用的 AI 提示词场景，按 <b>赛（评比备赛）、训（精准培训）、教（课堂教学）、研（教研活动）、评（教学评价）、管（队伍管理）</b>
          六个维度组织，教师与教研两条视角一键切换。</p>
        </div>
        <div class="about-card">
          <h3>🪜 怎么用（三步）</h3>
          <ol>
            <li><b>选场景</b>：按维度浏览或搜索，找到想省时间的任务；</li>
            <li><b>复制提示词</b>：打开场景详情，一键复制提示词；</li>
            <li><b>发给 AI</b>：粘贴到 WorkBuddy / DeepSeek / 文心一言 等任意对话式 AI，并附上材料（教案、成绩表、课堂实录等），按提示词对话即可。</li>
          </ol>
        </div>
        <div class="about-card">
          <h3>👩‍🏫 教师视角</h3>
          <p>覆盖 <b>${SCENARIOS.filter(s => s.roles.includes('teacher')).length} 个场景</b>：磨课备赛、学情分析、教学设计、课堂复盘、教学反思、自评自检。</p>
        </div>
        <div class="about-card">
          <h3>🔬 教研视角</h3>
          <p>覆盖 <b>${SCENARIOS.filter(s => s.roles.includes('researcher')).length} 个场景</b>：培训诊断与定制、同课异构、资源推送、赛事评课、成长画像、数据大屏。</p>
        </div>
        <div class="about-card">
          <h3>⚠️ 使用边界（重要）</h3>
          <p>每个场景均内置"使用边界"提醒：AI 输出仅供参考，需人工审核调整；不替代专家评审、教研组讨论或评委判定；
          注意保护学生与教师隐私，不做横向排名、不贴负面标签。请务必遵守。</p>
        </div>
        <div class="about-card">
          <h3>📦 导出提示词库</h3>
          <p>一键导出全部 20 个场景的提示词为 Markdown 文件，方便存档、打印或导入其他工具。</p>
          <p style="margin-top:12px"><button class="btn" id="exportBtn">⬇️ 导出全部提示词（.md）</button></p>
        </div>
      </div>`;
    $('#exportBtn').addEventListener('click', exportAll);
  }

  /* ---------- 搜索视图 ---------- */
  function renderSearch() {
    const list = visibleScenarios();
    $('#main').innerHTML = `
      <div class="view-head">
        <h2>🔍 搜索结果</h2>
        <div class="sub">关键词「${esc(state.query)}」· 共 ${list.length} 个匹配场景</div>
      </div>
      ${cardsGrid(list)}`;
  }

  /* ---------- 渲染入口 ---------- */
  function goView(view, dim) {
    state.view = view;
    state.dim = dim || null;
    state.query = '';
    $('#searchInput').value = '';
    render();
  }
  window.goView = goView;

  function render() {
    updateNav();
    $('#main').classList.toggle('chat-mode', state.view === 'chat');
    if (state.query) return renderSearch();
    if (state.view === 'chat') return window.Chat && window.Chat.render();
    if (state.view === 'dim' && state.dim) return renderDimView();
    if (state.view === 'favorites') return renderFavorites();
    if (state.view === 'about') return renderAbout();
    renderDashboard();
  }

  function updateNav() {
    $$('#sideNav a').forEach(a => {
      const v = a.dataset.view;
      let active = false;
      if (state.query) active = false;
      else if (v === 'dashboard') active = state.view === 'dashboard';
      else if (v === 'dim') active = state.view === 'dim' && a.dataset.dim === state.dim;
      else active = state.view === v;
      a.classList.toggle('active', active);
    });
    // 维度计数
    $$('[data-dim-count]').forEach(el => {
      const n = SCENARIOS.filter(s => s.dim === el.dataset.dimCount).length;
      el.textContent = n;
    });
    $('#favCount').textContent = favs().length;
  }

  /* ---------- 详情弹窗 ---------- */
  function openModal(id) {
    const s = scenarioOf(id);
    if (!s) return;
    const d = dimOf(s.dim);
    const fav = favs().includes(s.id);

    // 记录最近使用
    const r = recents().filter(x => x !== s.id);
    r.unshift(s.id);
    store.set('wb_recents', r.slice(0, 10));

    const body = $('#modalBody');
    body.innerHTML = `
      <div class="m-head">
        <span class="card-no" style="font-size:12.5px">场景 ${s.no}</span>
        <span class="m-dim-tag" style="background:${d.color}">${d.icon} ${d.name}</span>
        <span class="role-tags">${s.roles.map(r => `<span class="role-tag">${ROLES.find(x => x.key === r).icon} ${roleName(r)}</span>`).join('')}</span>
        <button class="card-fav" data-fav="${s.id}" title="${fav ? '取消收藏' : '收藏'}" style="margin-left:auto;font-size:20px;color:${fav ? '#f5b301' : '#c3cbdb'}">${fav ? '★' : '☆'}</button>
      </div>
      <h2 class="m-title">${esc(s.title)}</h2>
      <div class="m-aud"><b>👥 适合谁：</b>${esc(s.audience)}</div>
      <div class="m-aud"><b>⚡ 能干什么：</b>${esc(s.action)}</div>

      <div class="m-block">
        <h4>📎 需要准备的材料</h4>
        <div class="m-mats">${s.materials.map(m => `<span class="m-mat">${esc(m)}</span>`).join('')}</div>
      </div>

      <div class="m-block">
        <h4>🤖 提示词 <span style="color:var(--text-3);font-weight:400;font-size:12px">（复制后发给 AI）</span></h4>
        <div class="prompt-wrap">
          <pre class="prompt-box" id="promptText">${esc(s.prompt)}</pre>
          <button class="prompt-copy" id="copyPromptBtn">📋 复制提示词</button>
        </div>
      </div>

      <div class="m-block" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <button class="btn" id="chatWithBtn">🤖 用此场景开始 AI 对话</button>
        <span style="font-size:12px;color:var(--text-3)">直接连上大模型，AI 立即扮演「${esc(s.title)}」角色，粘贴材料即可开工</span>
      </div>

      <div class="m-block">
        <h4>🪜 使用步骤</h4>
        <ol class="steps">
          <li><b>准备材料</b>：按上方清单准备好原始文档（教案、数据表、实录转写等）。</li>
          <li><b>复制提示词</b>：点击"复制提示词"，粘贴到任意对话式 AI（WorkBuddy / DeepSeek / 文心一言等）。</li>
          <li><b>按提示词对话</b>：把材料作为附件或粘贴进对话，按提示词的要求逐步对话。</li>
          <li><b>人工审核</b>：AI 输出仅作参考，关键结论请结合实际情况人工确认后再使用。</li>
        </ol>
      </div>

      <div class="note-box">⚠️ <b>使用边界：</b>${esc(s.note)}</div>
    `;

    $('#modalMask').hidden = false;
    document.body.style.overflow = 'hidden';

    $('#copyPromptBtn').addEventListener('click', () => {
      copyText(s.prompt).then(ok => toast(ok ? '✅ 提示词已复制，去粘贴给 AI 吧' : '❌ 复制失败，请手动选择复制'));
    });
    const chatBtn = $('#chatWithBtn');
    if (chatBtn) chatBtn.addEventListener('click', () => {
      closeModal();
      if (window.Chat) {
        window.Chat.startWithScenario(s.id);
        goView('chat');
      } else {
        toast('⚠️ 对话模块未加载，请刷新页面');
      }
    });
    $('#modalBody .card-fav[data-fav]').addEventListener('click', e => { e.stopPropagation(); toggleFav(s.id); });
  }

  function closeModal() {
    $('#modalMask').hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------- 收藏 ---------- */
  function toggleFav(id) {
    let f = favs();
    const on = !f.includes(id);
    f = on ? [...f, id] : f.filter(x => x !== id);
    store.set('wb_favs', f);
    $$(`[data-fav="${id}"]`).forEach(btn => {
      btn.classList.toggle('on', on);
      btn.textContent = on ? '★' : '☆';
      btn.style.color = on ? '#f5b301' : '#c3cbdb';
      btn.title = on ? '取消收藏' : '收藏';
    });
    $('#favCount').textContent = f.length;
    toast(on ? '⭐ 已加入收藏' : '已取消收藏');
  }

  /* ---------- 导出 ---------- */
  function exportAll() {
    let md = `# 教学全链路 20 个 AI 场景提示词库\n\n> 依据公众号文章《从备课到评课，20个WorkBuddy场景帮你搞定教学全链路》整理\n\n`;
    for (const d of DIMENSIONS) {
      const list = SCENARIOS.filter(s => s.dim === d.key);
      md += `\n## ${d.icon} ${d.name}\n\n`;
      for (const s of list) {
        md += `### ${s.no} ${s.title}\n\n`;
        md += `- **适合谁**：${s.audience}\n- **能干什么**：${s.action}\n- **需要材料**：${s.materials.join('、')}\n- **使用边界**：${s.note}\n\n`;
        md += `**提示词：**\n\n\`\`\`\n${s.prompt}\n\`\`\`\n\n---\n\n`;
      }
    }
    const blob = new Blob(['\ufeff' + md], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '教学全链路20个AI场景提示词库.md';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('📦 已导出 Markdown 文件');
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    // 角色切换
    $('#roleSwitch').addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      state.role = btn.dataset.role;
      $$('#roleSwitch button').forEach(b => b.classList.toggle('active', b === btn));
      toast(`已切换为${state.role === 'all' ? '「全部」视角' : `「${roleName(state.role)}」视角`}`);
      render();
    });

    // 侧边栏导航
    $('#sideNav').addEventListener('click', e => {
      const a = e.target.closest('a');
      if (!a) return;
      goView(a.dataset.view, a.dataset.dim);
    });

    // 搜索
    let timer;
    $('#searchInput').addEventListener('input', e => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.query = e.target.value.trim();
        render();
      }, 200);
    });

    // 主内容区事件委托：打开卡片 / 收藏 / 维度跳转 / 导出
    $('#main').addEventListener('click', e => {
      const dimCard = e.target.closest('[data-goto-dim]');
      if (dimCard) {
        state.view = 'dim'; state.dim = dimCard.dataset.gotoDim; state.query = '';
        $('#searchInput').value = '';
        render();
        return;
      }
      const favBtn = e.target.closest('[data-fav]');
      if (favBtn) { e.stopPropagation(); toggleFav(+favBtn.dataset.fav); return; }
      const card = e.target.closest('.card[data-id]');
      if (card) openModal(+card.dataset.id);
    });

    // 弹窗关闭
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalMask').addEventListener('click', e => { if (e.target === $('#modalMask')) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modalMask').hidden) closeModal(); });
  }

  /* ---------- 启动 ---------- */
  bindEvents();
  render();
})();
