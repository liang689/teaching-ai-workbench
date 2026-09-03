/* ============================================================
 * 教学智能工作台 · 简洁版交互逻辑
 * 布局：左侧选择工作台（教师/教研员/班主任），右侧显示各项工作
 * ============================================================ */
(() => {
  'use strict';

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  /* ---------- 状态 ---------- */
  const state = { view: 'home', role: null, query: '' };
  // view: home | role | chat | favorites | about | search(由 query 触发)

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

  const roleInfo = r => ROLES.find(x => x.key === r) || null;
  const roleName = r => { const x = roleInfo(r); return x ? x.name : ''; };
  const roleIcon = r => { const x = roleInfo(r); return x ? x.icon : ''; };
  const roleScen = r => SCENARIOS.filter(s => s.roles.includes(r));

  /* ---------- 角色 → 工作分组规划 ---------- */
  // 教师 / 教研员按教学维度分组；班主任按日常事务分组
  const ROLE_DIMS = {
    teacher: [['赛', '备赛评比'], ['教', '课堂教学'], ['评', '教学评价'], ['研', '教研协作'], ['班', '过关记录']],
    researcher: [['训', '精准培训'], ['研', '教研活动'], ['评', '赛事评课'], ['管', '队伍管理']]
  };
  const HT_GROUPS = [
    { name: '每日班务', ids: [21, 22, 29] },
    { name: '名单与成绩分析', ids: [23, 24] },
    { name: '考勤 · 家校 · 家长会', ids: [25, 26, 32] },
    { name: '值日 · 座位 · 班干部', ids: [27, 28, 30] },
    { name: '学生档案', ids: [31] }
  ];

  function buildGroups(role) {
    if (role === 'headteacher') {
      return HT_GROUPS.map(g => ({
        name: g.name,
        list: g.ids.map(scenarioOf).filter(Boolean)
      })).filter(g => g.list.length);
    }
    return (ROLE_DIMS[role] || [])
      .map(([dk, label]) => ({
        name: label,
        list: SCENARIOS.filter(s => s.dim === dk && s.roles.includes(role))
      }))
      .filter(g => g.list.length);
  }

  /* ---------- 场景卡片模板 ---------- */
  function cardHTML(s) {
    const d = dimOf(s.dim);
    const fav = favs().includes(s.id);
    return `
    <article class="card" data-id="${s.id}">
      <div class="card-top">
        <span class="card-no">${s.no}</span>
        <span class="card-dim" style="background:${d.color}">${d.key} · ${d.short}</span>
        <button class="card-fav ${fav ? 'on' : ''}" data-fav="${s.id}" title="${fav ? '取消收藏' : '收藏'}">${fav ? '★' : '☆'}</button>
      </div>
      <h3>${esc(s.title)}</h3>
      <div class="line"><b>👥 适合谁：</b>${esc(s.audience)}</div>
      <div class="line"><b>⚡ 干什么：</b>${esc(s.action)}</div>
      <div class="mats">${s.materials.slice(0, 2).map(m => `<span class="mat-chip">${esc(m)}</span>`).join('')}</div>
      <button class="open-btn">查看提示词 →</button>
    </article>`;
  }

  function cardsGrid(list) {
    if (!list.length) {
      return `<div class="empty-state"><div class="e-icon">🔍</div><p>没有匹配的工作，换个关键词试试</p></div>`;
    }
    return `<div class="cards-grid">${list.map(cardHTML).join('')}</div>`;
  }

  /* ---------- 首页：选择工作台 ---------- */
  function renderHome() {
    $('#main').innerHTML = `
      <div class="view-head">
        <h2>🏠 总览首页</h2>
        <div class="sub">共 ${SCENARIOS.length} 项 AI 教学工作 · 选择你的角色，右侧展示对应工作</div>
      </div>
      <div class="home-roles">
        ${ROLES.map(r => {
          const set = roleScen(r.key);
          const chips = set.slice(0, 4);
          return `
          <div class="home-role" data-go-role="${r.key}" style="--c:${r.color}">
            <div class="hr-icon">${r.icon}</div>
            <h3>${r.name}工作台</h3>
            <p>${r.desc}</p>
            <div class="hr-nums"><b style="color:${r.color}">${set.length}</b> 项工作</div>
            <div class="hr-tags">${chips.map(s => `<span>${esc(s.title)}</span>`).join('')}</div>
            <div class="hr-go" style="background:${r.color}">进入 →</div>
          </div>`;
        }).join('')}
      </div>
      <div class="home-tip">💬 想直接开干？点左侧 <b>🤖 AI 智能对话</b> 连接你的大模型；要找某件事，用顶部 🔍 搜索。</div>`;
  }

  /* ---------- 角色工作台：右侧显示该角色分组后的各项工作 ---------- */
  function renderRole() {
    const r = roleInfo(state.role);
    if (!r) return renderHome();
    const groups = buildGroups(r.key);
    const cnt = roleScen(r.key).length;
    $('#main').innerHTML = `
      <div class="view-head role-head">
        <div>
          <h2><span class="role-head-icon" style="background:${r.color}">${r.icon}</span> ${r.name}工作台
            <span class="role-count" style="color:${r.color}">${cnt} 项工作</span></h2>
          <div class="sub">${r.desc} · 点卡片查看提示词，可一键复制，或「用此场景开始 AI 对话」</div>
        </div>
        <div class="role-tabs">
          ${ROLES.map(x => `<button class="chip-btn ${x.key === r.key ? 'on' : ''}" data-go-role="${x.key}">${x.icon} ${x.name}</button>`).join('')}
        </div>
      </div>
      ${groups.map(g => `
        <div class="group-sec">
          <div class="group-label">${esc(g.name)}<span>${g.list.length}</span></div>
          <div class="cards-grid">${g.list.map(cardHTML).join('')}</div>
        </div>`).join('')}
      <p class="dim-note">💡 每个场景可直接点「用此场景开始 AI 对话」连上大模型干活；📎 可上传 Excel / Word / PPT 材料。收集常用场景点卡片右上角 ☆。</p>
    `;
  }

  /* ---------- 收藏夹 ---------- */
  function renderFavorites() {
    const list = SCENARIOS.filter(s => favs().includes(s.id));
    $('#main').innerHTML = `
      <div class="view-head">
        <h2>⭐ 我的收藏</h2>
        <div class="sub">${list.length ? `已收藏 ${list.length} 项工作` : '还没有收藏任何工作'}</div>
      </div>
      ${list.length ? `<div class="cards-grid">${list.map(cardHTML).join('')}</div>`
        : `<div class="empty-state"><div class="e-icon">⭐</div><p>在任一工作卡片右上角点 ☆ 收藏，方便快速找到</p></div>`}`;
  }

  /* ---------- 使用说明 ---------- */
  function renderAbout() {
    const cnt = k => roleScen(k).length;
    $('#main').innerHTML = `
      <div class="view-head"><h2>💡 使用说明</h2></div>
      <div class="about-grid">
        <div class="about-card">
          <h3>🧩 这是什么</h3>
          <p>教学 AI 工作台，内容源自公众号文章《从备课到评课，20个WorkBuddy场景帮你搞定教学全链路》与《教师工作台》。
          共 ${SCENARIOS.length} 项工作，按三种角色组织成三套工作台，左侧选择角色，右侧即显示该角色要做的各项工作。</p>
        </div>
        <div class="about-card">
          <h3>🪜 怎么用（三步）</h3>
          <ol>
            <li><b>选角色</b>：左侧点 👩‍🏫 教师 / 🔬 教研员 / 📋 班主任工作台；</li>
            <li><b>点工作卡</b>：查看提示词并「复制」，或「用此场景开始 AI 对话」；</li>
            <li><b>交给 AI</b>：直连大模型或粘贴到对话式 AI，附上材料（教案、成绩表、名单、记录等）即可。</li>
          </ol>
        </div>
        <div class="about-card">
          <h3>👩‍🏫 教师工作台 · ${cnt('teacher')} 项</h3>
          <p>磨课备赛、学情分析、教学设计、课堂复盘、教学反思、自评自检、过关记录整理。</p>
        </div>
        <div class="about-card">
          <h3>🔬 教研员工作台 · ${cnt('researcher')} 项</h3>
          <p>培训诊断与定制、同课异构、资源推送、赛事评课、教师成长画像、数据大屏。</p>
        </div>
        <div class="about-card">
          <h3>📋 班主任工作台 · ${cnt('headteacher')} 项</h3>
          <p>每日班务、过关记录、成绩分析（无排名版）、考勤请假、家校沟通、值日排班、排座位、学生档案、家长会材料。</p>
        </div>
        <div class="about-card">
          <h3>⚠️ 使用边界</h3>
          <p>AI 输出仅供参考，需人工审核；不做横向排名、不贴负面标签；家长联系方式等敏感信息不进汇总与打印；真实学生资料请勿公开分享。</p>
        </div>
        <div class="about-card">
          <h3>📦 导出</h3>
          <p>一键导出全部 ${SCENARIOS.length} 个提示词为 Markdown 文件存档。</p>
          <p style="margin-top:12px"><button class="btn" id="exportBtn">⬇️ 导出全部提示词（.md）</button></p>
        </div>
      </div>`;
    $('#exportBtn').addEventListener('click', exportAll);
  }

  /* ---------- 搜索 ---------- */
  function visibleScenarios() {
    const q = state.query.toLowerCase();
    if (!q) return SCENARIOS;
    return SCENARIOS.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.audience.toLowerCase().includes(q) ||
      s.action.toLowerCase().includes(q) ||
      s.prompt.toLowerCase().includes(q) ||
      s.materials.some(m => m.toLowerCase().includes(q)) ||
      roleName(s.roles[0]).includes(q)
    );
  }

  function renderSearch() {
    const list = visibleScenarios();
    $('#main').innerHTML = `
      <div class="view-head">
        <h2>🔍 搜索结果</h2>
        <div class="sub">关键词「${esc(state.query)}」· 共 ${list.length} 项</div>
      </div>
      ${cardsGrid(list)}`;
  }

  /* ---------- 渲染入口 ---------- */
  function goView(view) {
    state.view = view;
    state.query = '';
    $('#searchInput').value = '';
    render();
  }
  window.goView = goView;

  function goRole(role) {
    state.role = role;
    state.view = 'role';
    state.query = '';
    $('#searchInput').value = '';
    render();
    const r = roleInfo(role);
    toast(`已进入「${r.icon} ${r.name}工作台」`);
  }

  function render() {
    updateNav();
    $('#main').classList.toggle('chat-mode', state.view === 'chat');
    if (state.query) return renderSearch();
    if (state.view === 'role') return renderRole();
    if (state.view === 'chat') return window.Chat && window.Chat.render();
    if (state.view === 'favorites') return renderFavorites();
    if (state.view === 'about') return renderAbout();
    renderHome();
  }

  function updateNav() {
    $$('#sideNav a').forEach(a => {
      const v = a.dataset.view;
      let active = false;
      if (state.query) active = false;
      else if (v === 'home') active = state.view === 'home';
      else if (v === 'role') active = state.view === 'role' && a.dataset.role === state.role;
      else active = state.view === v;
      a.classList.toggle('active', active);
    });
    $$('[data-role-count]').forEach(el => {
      el.textContent = roleScen(el.dataset.roleCount).length;
    });
    $('#favCount').textContent = favs().length;
  }

  /* ---------- 详情弹窗 ---------- */
  function openModal(id) {
    const s = scenarioOf(id);
    if (!s) return;
    const d = dimOf(s.dim);
    const fav = favs().includes(s.id);

    const r = recents().filter(x => x !== s.id);
    r.unshift(s.id);
    store.set('wb_recents', r.slice(0, 10));

    const body = $('#modalBody');
    body.innerHTML = `
      <div class="m-head">
        <span class="card-no" style="font-size:12.5px">工作 ${s.no}</span>
        <span class="m-dim-tag" style="background:${d.color}">${d.icon} ${d.name}</span>
        <span class="role-tags">${s.roles.map(r => `<span class="role-tag">${roleIcon(r)} ${roleName(r)}</span>`).join('')}</span>
        <button class="card-fav" data-fav="${s.id}" title="${fav ? '取消收藏' : '收藏'}" style="margin-left:auto;font-size:20px;color:${fav ? '#f5b301' : '#c3cbdb'}">${fav ? '★' : '☆'}</button>
      </div>
      <h2 class="m-title">${esc(s.title)}</h2>
      <div class="m-aud"><b>👥 适合谁：</b>${esc(s.audience)}</div>
      <div class="m-aud"><b>⚡ 干什么：</b>${esc(s.action)}</div>

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
        <span style="font-size:12px;color:var(--text-3)">连上大模型后，AI 立即扮演「${esc(s.title)}」，粘贴材料即可开工</span>
      </div>

      <div class="m-block">
        <h4>🪜 使用步骤</h4>
        <ol class="steps">
          <li><b>准备材料</b>：按清单准备好原始文档（教案、数据表、名单、记录等）。</li>
          <li><b>复制提示词</b>或点「用此场景开始 AI 对话」。</li>
          <li><b>按提示词对话</b>：把材料作为附件或粘贴进对话，逐步完成。</li>
          <li><b>人工审核</b>：AI 输出仅供参考，关键结论结合实际人工确认。</li>
        </ol>
      </div>

      <div class="note-box">⚠️ <b>使用边界：</b>${esc(s.note)}</div>
    `;

    $('#modalMask').hidden = false;
    document.body.style.overflow = 'hidden';

    $('#copyPromptBtn').addEventListener('click', () => {
      copyText(s.prompt).then(ok => toast(ok ? '✅ 提示词已复制' : '❌ 复制失败，请手动选择'));
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
    let md = `# 教学智能工作台 · ${SCENARIOS.length} 个 AI 提示词\n\n> 内容源自公众号文章《从备课到评课，20个WorkBuddy场景帮你搞定教学全链路》与《教师工作台》\n\n`;
    for (const r of ROLES) {
      md += `\n## ${r.icon} ${r.name}工作台（${roleScen(r.key).length} 项）\n\n`;
      const groups = buildGroups(r.key);
      for (const g of groups) {
        md += `\n### ${g.name}\n\n`;
        for (const s of g.list) {
          md += `**${s.no} ${s.title}**（${s.roles.map(roleName).join('、')}）\n\n`;
          md += `- 适合谁：${s.audience}\n- 干什么：${s.action}\n- 材料：${s.materials.join('、')}\n- 边界：${s.note}\n\n`;
          md += `提示词：\n\n\`\`\`\n${s.prompt}\n\`\`\`\n\n---\n\n`;
        }
      }
    }
    const blob = new Blob(['\ufeff' + md], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '教学智能工作台提示词库.md';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('📦 已导出 Markdown 文件');
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    // 品牌区点击回首页
    $('.brand').addEventListener('click', () => goView('home'));

    // 侧边栏导航
    $('#sideNav').addEventListener('click', e => {
      const a = e.target.closest('a');
      if (!a) return;
      if (a.dataset.view === 'role' && a.dataset.role) goRole(a.dataset.role);
      else goView(a.dataset.view);
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

    // 主内容区事件委托
    $('#main').addEventListener('click', e => {
      const gor = e.target.closest('[data-go-role]');
      if (gor) { goRole(gor.dataset.goRole); return; }
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
