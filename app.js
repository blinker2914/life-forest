// 健康小石子 · 纯前端渲染
// 数据全部来自同目录的 data.json（飞书「生命森林」多维表格的真实记录）。
// 没有数据的日子显示「待记录」，静息心率和步数显示「待同步」，不编数、不写 0。

let DATA = null;
let selectedDate = null;

const $ = (id) => document.getElementById(id);
const fmtDate = (d) => d ? d.slice(5).replace('-', '月') + '日' : '—';
const num = (v, digits) => (v === null || v === undefined) ? '待记录' : Number(v).toFixed(digits);
const pending = '<span class="pending">待记录</span>';
const pendingSync = '<span class="pending">待同步</span>';

function allDates() {
  const s = new Set();
  (DATA.daily || []).forEach(r => s.add(r.date));
  (DATA.sleep || []).forEach(r => s.add(r.date));
  (DATA.training || []).forEach(r => s.add(r.date));
  // 板子永远默认停在今天：哪怕今天还没数据，也显示今天这一天（待记录），不再停在上一个有数据的日子。
  const now = new Date();
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  s.add(today);
  return [...s].sort();
}

function byDate(arr, date) {
  return (arr || []).filter(r => r.date === date);
}

function latestBody() {
  const m = DATA.bodyMetrics || [];
  return m.length ? m[m.length - 1] : null;
}

// ---------- canvas helpers (dependency-free) ----------
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = 180;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, w, h };
}

function drawLineChart(canvas, series) {
  // series: [{label, color, points:[{x(label), y(number|null)}], yMin, yMax}]
  const { ctx, w, h } = setupCanvas(canvas);
  const padL = 40, padR = 40, padT = 14, padB = 26;
  const iw = w - padL - padR, ih = h - padT - padB;
  const labels = series[0].points.map(p => p.x);
  const xAt = (i) => padL + (labels.length === 1 ? iw / 2 : (iw * i) / (labels.length - 1));
  const yAt = (s, v) => padT + ih - ((v - s.yMin) / (s.yMax - s.yMin)) * ih;

  ctx.strokeStyle = '#1f4d36';
  ctx.fillStyle = '#7fa08d';
  ctx.font = '11px sans-serif';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 3; g++) {
    const y = padT + (ih * g) / 3;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
  }
  labels.forEach((lb, i) => {
    ctx.fillText(fmtDate(lb), xAt(i) - 14, h - 8);
  });

  series.forEach((s) => {
    // axis labels
    ctx.fillStyle = s.color;
    ctx.fillText(s.yMax, s === series[0] ? 4 : w - 36, padT + 4);
    ctx.fillText(s.yMin, s === series[0] ? 4 : w - 36, padT + ih);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    s.points.forEach((p, i) => {
      if (p.y === null || p.y === undefined) { started = false; return; }
      const x = xAt(i), y = yAt(s, p.y);
      if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
    });
    ctx.stroke();
    s.points.forEach((p, i) => {
      if (p.y === null || p.y === undefined) return;
      const x = xAt(i), y = yAt(s, p.y);
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8f2ea';
      ctx.fillText(String(p.y), x - 8, y - 8);
    });
  });
}

function drawStackedBars(canvas, rows, keys) {
  // rows: [{label, deep, light, rem}], keys: [{key, color}]
  const { ctx, w, h } = setupCanvas(canvas);
  const padL = 8, padR = 8, padT = 16, padB = 26;
  const iw = w - padL - padR, ih = h - padT - padB;
  const maxV = Math.max(...rows.map(r => keys.reduce((a, k) => a + (r[k.key] || 0), 0)), 1);
  const bw = Math.min(64, iw / rows.length * 0.55);
  ctx.font = '11px sans-serif';
  rows.forEach((r, i) => {
    const cx = padL + (iw * (i + 0.5)) / rows.length;
    const total = keys.reduce((a, k) => a + (r[k.key] || 0), 0);
    let y = padT + ih;
    keys.forEach((k) => {
      const v = r[k.key] || 0;
      const bh = (v / maxV) * ih;
      y -= bh;
      ctx.fillStyle = k.color;
      ctx.fillRect(cx - bw / 2, y, bw, bh);
      if (v > 0) {
        ctx.fillStyle = '#0c2318';
        ctx.fillText(v.toFixed(1), cx - 8, y + bh / 2 + 4);
      }
    });
    ctx.fillStyle = '#e8f2ea';
    ctx.fillText(total.toFixed(1) + 'h', cx - 10, padT - 4);
    ctx.fillStyle = '#7fa08d';
    ctx.fillText(fmtDate(r.label), cx - 16, h - 8);
  });
}

// ---------- render ----------
function renderHeader() {
  const b = latestBody();
  const meta = DATA.meta || {};
  const fl = DATA.fatLoss || {};
  const stats = [];
  if (b) {
    // 头上只放现在多少、目标多少，不放“距目标多少个点”。
    stats.push(['体脂率目标', b.fatPct + '% → ' + (fl.targetFatPct || meta.fatTargetPct) + '%', '']);
    stats.push(['体重', b.weightKg ? b.weightKg + ' kg' : '待记录', '']);
    stats.push(['下次称重', fmtDate(meta.nextWeighIn), meta.weighInRule || '']);
  }
  $('headStats').innerHTML = stats.map(([k, v, s]) =>
    `<div class="hstat"><div class="k">${k}</div><div class="v">${v} <small>${s}</small></div></div>`).join('');
}

function renderBody() {
  const b = latestBody();
  if (!b) { $('bodyLatest').innerHTML = pending; return; }
  const rows = [
    ['体重', b.weightKg === null ? '待记录' : b.weightKg + ' kg'],
    ['体脂率', b.fatPct + '%'],
    ['肌肉量', b.muscleKg === null ? '待记录' : b.muscleKg + ' kg'],
    ['脂肪量', b.fatMassKg === null ? '待记录' : b.fatMassKg + ' kg'],
    ['骨骼肌', b.skeletalMuscleKg === null ? '待记录' : b.skeletalMuscleKg + ' kg'],
    ['基础代谢', b.bmrKcal === null ? '待记录' : b.bmrKcal + ' kcal'],
    ['BMI', b.bmi === null ? '待记录' : b.bmi],
    ['身体评分', b.score === null ? '待记录' : b.score + ' 分'],
  ];
  $('bodyLatest').innerHTML =
    `<div class="faint">${b.date} · ${b.note || ''}</div>` +
    rows.map(([k, v]) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
  $('weighInNote').textContent =
    '称重节奏：' + (DATA.meta.weighInRule || '') + '，下次约 ' + fmtDate(DATA.meta.nextWeighIn) + '。';
  $('bodyCheckupNote').textContent =
    '体检项目（2026-11-19 体检后）将加进本区。';

  const pts = DATA.bodyMetrics.map(m => ({ x: m.date, y: m.fatPct }));
  const ptsM = DATA.bodyMetrics.map(m => ({ x: m.date, y: m.muscleKg }));
  const fats = pts.map(p => p.y);
  const fMin = Math.floor(Math.min(...fats) - 1), fMax = Math.ceil(Math.max(...fats) + 1);
  const mus = ptsM.map(p => p.y).filter(v => v !== null);
  const mMin = Math.floor(Math.min(...mus) - 1), mMax = Math.ceil(Math.max(...mus) + 1);
  drawLineChart($('trendChart'), [
    { label: '体脂', color: '#8fd6a8', points: pts, yMin: fMin, yMax: fMax },
    { label: '肌肉', color: '#e8c97a', points: ptsM, yMin: mMin, yMax: mMax },
  ]);
}

function renderSleep() {
  const rows = DATA.sleep || [];
  const sel = byDate(rows, selectedDate)[0] || rows[rows.length - 1];
  if (!sel) { $('sleepLatest').innerHTML = pending; return; }
  $('sleepLatest').innerHTML =
    `<div class="faint">${sel.date} · ${sel.bedTime} 入睡 — ${sel.wakeTime} 起床</div>` +
    `<div class="kv"><span class="k">总时长</span><span class="v">${sel.hours} 小时</span></div>` +
    `<div class="kv"><span class="k">深睡</span><span class="v">${sel.deepHours} 小时</span></div>` +
    `<div class="kv"><span class="k">浅睡</span><span class="v">${sel.lightHours} 小时</span></div>` +
    `<div class="kv"><span class="k">REM</span><span class="v">${sel.remHours} 小时</span></div>` +
    `<div class="faint" style="margin-top:6px">睡眠只到 11-12：手表同步断了（Gadgetbridge 没收到新手表数据），等手表恢复再更新。</div>`;
  drawStackedBars($('sleepChart'), rows.map(r => ({
    label: r.date, deep: r.deepHours, light: r.lightHours, rem: r.remHours,
  })), [
    { key: 'deep', color: '#5b8dd9' },
    { key: 'light', color: '#8fd6a8' },
    { key: 'rem', color: '#c9a7e8' },
  ]);
}

function renderEnergy() {
  const rows = [...(DATA.daily || [])].sort((a, b) => b.date.localeCompare(a.date));
  const cell = (v, d = 0) => (v === null || v === undefined) ? '<span class="pending">待记录</span>' : Number(v).toFixed(d);
  // 摄入为空，盈余就显示待记录，别拿 0 去减（11-11/11-12/11-13 三天就是这么错的）。
  const surplusCell = (r) => (r.intakeKcal === null || r.intakeKcal === undefined)
    ? '<span class="pending">待记录</span>'
    : cell(r.surplusKcal);
  $('energyTable').innerHTML =
    '<table><tr><th>日期</th><th class="num">摄入</th><th class="num">消耗</th><th class="num">盈余（到现在为止）</th></tr>' +
    rows.map(r =>
      `<tr><td>${fmtDate(r.date)}</td><td class="num">${cell(r.intakeKcal)}</td>` +
      `<td class="num">${cell(r.expenditureKcal)}</td><td class="num">${surplusCell(r)}</td></tr>`).join('') +
    '</table>';
  $('energyNote').textContent =
    '盈余是“到现在为止”的数：今天的 5 顿还没吃完，摄入是到现在的数，消耗是全天估算。等 5 顿吃完，盈余才是全天缺口。摄入没填的日子，盈余显示待记录，不拿 0 去算。11 月 13 日是半天的数。';
}

function renderFatLoss() {
  const fl = DATA.fatLoss;
  if (!fl) { $('fatLossBoard').innerHTML = pending; return; }
  const t = fl.today || {};
  const dy = byDate(DATA.daily, selectedDate)[0];
  const b = latestBody();
  let html = '';

  // --- 1. 体脂率目标：现在 → 目标，已完成 7%（大字彩色突出） ---
  const curFat = fl.currentFatPct !== undefined ? fl.currentFatPct : (b ? b.fatPct : null);
  const tgtFat = fl.targetFatPct || 18;
  const progressPct = fl.todayProgressPct !== undefined ? fl.todayProgressPct : 0;
  html += `<div class="kv"><span class="k">体脂率目标</span><span class="v">现在 ${curFat}% → 目标 ${tgtFat}%</span></div>`;
  html += `<div style="font-size:28px;font-weight:800;color:#8fd6a8;margin:6px 0 2px">已完成 ${progressPct}%</div>`;
  html += `<div class="progress-bar"><div class="fill" style="width:${Math.min(100, Math.max(0, progressPct))}%"></div></div>`;
  html += `<div class="faint">要减约 ${fl.fatToLoseKg || '1.04'} kg 脂肪（约 ${fl.fatToLoseKcal || 8000} 千卡）；本周已缺 ${fl.weeklyDeficitSoFarKcal || 0} 千卡，${fl.estDaysRemaining || '20'} 天完成。</div>`;

  // --- 2. 今天吃了什么：5 顿表格 + 合计行 ---
  html += `<h3>今天吃了什么（${t.date || selectedDate}）</h3>`;
  const meals = (dy && dy.meals) ? dy.meals : null;
  let totalKcal = 0, totalProtein = 0;
  if (meals && meals.length) {
    totalKcal = meals.reduce((a, m) => a + (m.kcal || 0), 0);
    totalProtein = meals.reduce((a, m) => a + (m.proteinG || 0), 0);
    html += '<table><tr><th>这一顿</th><th>吃了什么</th><th class="num">热量</th><th class="num">蛋白</th></tr>' +
      meals.map(m =>
        `<tr><td>${m.name}</td><td>${m.desc}</td><td class="num">${m.kcal} 千卡</td><td class="num">${m.proteinG} 克</td></tr>`).join('') +
      `<tr><td><b>合计</b></td><td></td><td class="num"><b>${totalKcal} 千卡</b></td><td class="num"><b>${totalProtein} 克</b></td></tr>` +
      '</table>';
  } else if (dy && dy.intakeKcal !== null && dy.intakeKcal !== undefined) {
    totalKcal = dy.intakeKcal;
    totalProtein = dy.proteinG || 0;
    html += `<div class="kv"><span class="k">全天摄入</span><span class="v">约 ${dy.intakeKcal} 千卡、蛋白约 ${dy.proteinG || '—'} 克</span></div>`;
    html += `<div class="faint">这天的分顿明细还没记，只留了总数。</div>`;
  } else {
    html += `<div class="pending">今天还没记吃的</div>`;
  }

  // --- 3. 今天总计 + 目标 + 正/负 ---
  const intakeTarget = fl.singleDayIntakeKcal || '1600–1800';
  const proteinTarget = fl.dailyProteinTargetG || 120;
  html += `<h3>今天总计与目标</h3>`;
  if (totalKcal) {
    html += `<div class="kv"><span class="k">今天总千卡</span><span class="v">约 ${totalKcal} 千卡</span></div>`;
    html += `<div class="kv"><span class="k">今天总蛋白</span><span class="v">约 ${totalProtein} 克</span></div>`;
    html += `<div class="kv"><span class="k">热量目标</span><span class="v">控在 ${intakeTarget} 千卡内</span></div>`;
    html += `<div class="kv"><span class="k">蛋白目标</span><span class="v">${proteinTarget} 克以上</span></div>`;
    const diffKcal = totalKcal - 1600;
    const kcalNeg = diffKcal < 0;
    const kcalStatus = kcalNeg ? `负：比目标下限低 ${Math.abs(diffKcal)} 千卡，缺口更大` : (diffKcal <= 200 ? `正：在目标区间内` : `正：比目标上限高 ${diffKcal - 200} 千卡`);
    const diffP = totalProtein - proteinTarget;
    const proteinNeg = diffP < 0;
    const proteinStatus = proteinNeg ? `负：比目标少 ${Math.abs(diffP)} 克` : `正：比目标多 ${diffP} 克，达标`;
    html += `<div class="kv"><span class="k">目标情况（热量）</span><span class="v ${kcalNeg ? 'neg' : 'pos'}">${kcalStatus}</span></div>`;
    html += `<div class="kv"><span class="k">目标情况（蛋白）</span><span class="v ${proteinNeg ? 'neg' : 'pos'}">${proteinStatus}</span></div>`;
  } else {
    html += `<div class="pending">今天还没记吃的</div>`;
  }

  // --- 4. 今天运动：练腿，消耗多少 ---
  html += `<h3>今天运动</h3>`;
  const ex = dy && dy.exercise ? dy.exercise : null;
  if (ex) {
    html += `<div class="kv"><span class="k">${ex.type}</span><span class="v">${ex.place} · ${ex.kind} · 约 ${ex.durationMin} 分钟 · 消耗约 ${ex.kcal} 千卡</span></div>`;
  } else {
    const tr = byDate(DATA.training, selectedDate).filter(r => r.source === '手动');
    if (tr.length) {
      html += `<div class="kv"><span class="k">${tr.map(x => x.type).join('、')}</span><span class="v">详情在下面的运动细节里</span></div>`;
    } else {
      html += `<div class="pending">今天还没记运动</div>`;
    }
  }

  // --- 5. 消耗账：基础代谢、日常活动、运动、总消耗、热量缺口 ---
  html += `<h3>消耗账</h3>`;
  const bmr = b ? b.bmrKcal : null;
  const expend = dy ? dy.expenditureKcal : null;
  const deficit = dy ? dy.surplusKcal : null;
  const exKcal = ex ? ex.kcal : 0;
  const dailyActivity = (expend !== null && expend !== undefined && bmr !== null && bmr !== undefined)
    ? Math.round(expend - bmr - exKcal) : null;
  html += `<div class="kv"><span class="k">基础代谢</span><span class="v">${bmr === null || bmr === undefined ? '待记录' : bmr + ' 千卡'}</span></div>`;
  html += `<div class="kv"><span class="k">日常活动</span><span class="v">${dailyActivity === null ? '待记录' : '约 ' + dailyActivity + ' 千卡'}</span></div>`;
  html += `<div class="kv"><span class="k">运动消耗</span><span class="v">${ex ? '约 ' + ex.kcal + ' 千卡（' + ex.type + '）' : '待记录'}</span></div>`;
  html += `<div class="kv"><span class="k">总消耗</span><span class="v">${expend === null || expend === undefined ? '待记录' : '约 ' + expend + ' 千卡'}</span></div>`;
  html += `<div class="kv"><span class="k">热量缺口</span><span class="v">${deficit === null || deficit === undefined ? '待记录' : '已缺 ' + Math.abs(deficit) + ' 千卡'}</span></div>`;

  // --- 6. 总体任务 / 任务进度：本周累计缺口、目标 ---
  html += `<h3>任务进度</h3>`;
  html += `<div class="kv"><span class="k">本周累计缺口</span><span class="v">${fl.weeklyDeficitSoFarKcal || 0} 千卡</span></div>`;
  html += `<div class="kv"><span class="k">本周目标</span><span class="v">${fl.weeklyDeficitTargetKcal || '2400'} 千卡</span></div>`;

  // --- 7. 待买 ---
  const toBuy = fl.toBuy || [];
  if (toBuy.length) {
    html += `<h3>待买</h3>` +
      toBuy.map(x => `<div class="muted" style="font-size:13px">· ${x}</div>`).join('');
  }

  if (t.note) html += `<div class="faint" style="margin-top:8px">${t.note}</div>`;
  html += `<div class="faint" style="margin-top:8px">热量按周算总账（今天多、明天少可以）；蛋白按天算，不能攒，今天不够明天吃双倍也补不回来。数字都是估算，不是称重数。</div>`;
  if (fl.reportChannel) {
    html += `<div class="note" style="margin-top:8px">${fl.reportChannel}</div>`;
  }
  $('fatLossBoard').innerHTML = html;
}

function renderTraining() {
  const rows = [...(DATA.training || [])].sort((a, b) => b.date.localeCompare(a.date) || 0);
  const manual = rows.filter(r => r.source !== '手表');
  const latest = manual[0];
  const older = manual.slice(1, 4);
  let html = '';
  if (latest) {
    const pill = '<span class="pill manual">手动</span>';
    const note = latest.note ? `<p>备注：${latest.note}</p>` : '';
    html += `<div class="train"><div class="t-head"><span class="t-date">${fmtDate(latest.date)}</span>` +
      `<span class="t-type">${latest.type}</span>${pill}</div><p>${latest.content}</p>${note}</div>`;
  }
  if (older.length) {
    html += `<div class="faint" style="margin-top:6px">更早的训练（只留标题，详情在飞书训练记录表里）：</div>` +
      older.map(r => `<div class="kv"><span class="k">${fmtDate(r.date)}</span><span class="v">${r.type}</span></div>`).join('');
  }
  const watchCount = rows.filter(r => r.source === '手表').length;
  if (watchCount) {
    html += `<div class="faint" style="margin-top:8px">手表自动记的运动 ${watchCount} 条（卡路里/心率待回填）。</div>`;
  }
  $('trainingList').innerHTML = html || pending;
}

function takenNamesFor(date) {
  // supplementCheckins 目前是空数组；形状按飞书导出常见的几种都容着，
  // 没打卡就不勾，绝不编一个“已吃”。
  const names = new Set();
  (DATA.supplementCheckins || []).forEach(c => {
    if (!c || c.date !== date) return;
    if (Array.isArray(c.taken)) c.taken.forEach(n => names.add(n));
    if (Array.isArray(c.items)) c.items.forEach(it => {
      if (it && (it.taken === true || it.checked === true)) names.add(it.name);
    });
    if (c.name && (c.taken === true || c.checked === true)) names.add(c.name);
  });
  return names;
}

function renderSupplements() {
  const order = ['早', '午', '隔天', '晚'];
  const groups = {};
  (DATA.supplements || []).forEach(s => {
    (groups[s.timeOfDay] = groups[s.timeOfDay] || []).push(s);
  });
  // 清单只在打卡行里出一次（每项带 ☐/☑），不在上面再重复列一遍。
  $('suppList').innerHTML = '';
  const taken = takenNamesFor(selectedDate);
  const total = (DATA.supplements || []).length;
  $('suppToday').innerHTML =
    `<div class="faint" style="margin-bottom:4px">${fmtDate(selectedDate)} 打卡：` +
    (taken.size === 0
      ? '今天还没打卡（在飞书每日补剂打卡表里勾，同步后这里自动变 ☑）'
      : `已打 ${taken.size} / ${total}`) + '</div>' +
    order.filter(g => groups[g]).map(g =>
      `<div class="supp-group"><h3>${g}</h3>` +
      groups[g].map(s => {
        const done = taken.has(s.name);
        return `<div class="ck"><span class="box${done ? ' done' : ''}">${done ? '☑' : '☐'}</span>` +
          `<span><b>${s.name}</b> · ${s.dose}</span></div>`;
      }).join('') + '</div>').join('');
  const n = (DATA.supplementCheckins || []).length;
  $('suppCheckin').innerHTML = n === 0 ? '今天还没打卡（在飞书里勾）' : n + ' 条';
}

function renderTimeline() {
  const dates = allDates().slice().reverse();
  $('timeline').innerHTML = dates.map(d => {
    const tr = byDate(DATA.training, d).filter(r => r.source === '手动');
    const sl = byDate(DATA.sleep, d)[0];
    const dy = byDate(DATA.daily, d)[0];
    const bits = [];
    if (tr.length) bits.push('训练：' + tr.map(t => t.type).join('、'));
    if (sl) bits.push('睡眠 ' + sl.hours + ' 小时（深睡 ' + sl.deepHours + '、浅睡 ' + sl.lightHours + '、REM ' + sl.remHours + '）');
    // “总卡路里”是手表的消耗，不是摄入，写清楚；半天的日子加个（半天）。
    if (dy && dy.totalKcal !== null) {
      const halfDay = dy.note && dy.note.indexOf('半天') !== -1 ? '（半天）' : '';
      const srcTag = (dy.activityKcal !== null && dy.activityKcal !== undefined) ? '（手表）' : '（估算）';
      bits.push('消耗约 ' + Math.round(dy.totalKcal) + ' kcal' + srcTag + halfDay);
    }
    if (!bits.length) bits.push('待记录');
    return `<div class="timeline-item"><div class="d">${d}（${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(d + 'T12:00:00').getDay()]}）</div><p>${bits.join('；')}</p></div>`;
  }).join('');
}

function renderReview() {
  const w = (DATA.weekly || [])[0];
  if (!w) { $('review').innerHTML = pending; return; }
  $('review').innerHTML =
    `<div class="kv"><span class="k">周期</span><span class="v">${w.week}</span></div>` +
    `<div class="kv"><span class="k">体重</span><span class="v">${w.weightStartKg} → ${w.weightEndKg} kg</span></div>` +
    `<div class="kv"><span class="k">体脂</span><span class="v">${w.fatStartPct}% → ${w.fatEndPct}%</span></div>` +
    `<div class="kv"><span class="k">肌肉</span><span class="v">${w.muscleStartKg} → ${w.muscleEndKg} kg</span></div>` +
    `<p class="muted" style="margin-top:10px">${w.summary}</p>`;
}

function renderCheckup() {
  const rows = DATA.checkup || [];
  if (!rows.length) {
    $('checkup').innerHTML =
      '<div class="pending">待体检</div>' +
      '<p class="muted" style="margin-top:6px">体检约在 2026-11-19（周四）8:00–10:00，爱康卓悦广州琶洲保利中悦分院。体检完把报告填进来，这里才会出数。</p>';
    return;
  }
  $('checkup').innerHTML = rows.map(r => `<div class="kv"><span class="k">${r.date}</span><span class="v">${r.summary || ''}</span></div>`).join('');
}

function renderFooter() {
  const meta = DATA.meta || {};
  $('footer').innerHTML =
    '数据来源：' + meta.source + '（<span>' + meta.sourceUrl + '</span>）<br>' +
    '数据更新于 ' + meta.updatedAt + '。' +
    (meta.notes || []).map(n => '<br>· ' + n).join('') +
    '<br>本页不存任何密钥，也不向任何地方发数据；要更新数据，替换同目录的 data.json 即可。';
}

function renderDateBar() {
  const dates = allDates();
  const idx = dates.indexOf(selectedDate);
  $('dateLabel').textContent = selectedDate + '（' +
    ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(selectedDate + 'T12:00:00').getDay()] + '）';
  $('dateNote').textContent = idx === dates.length - 1 ? '最新一天' : '';
  $('prevDay').disabled = idx <= 0;
  $('nextDay').disabled = idx >= dates.length - 1;
}

function render() {
  renderDateBar();
  renderHeader();
  renderFatLoss();
  renderBody();
  renderSleep();
  renderEnergy();
  renderTraining();
  renderSupplements();
  renderTimeline();
  renderReview();
  renderCheckup();
  renderFooter();
}

function init() {
  fetch('data.json?v=17')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(d => {
      DATA = d;
      const dates = allDates();
      selectedDate = dates[dates.length - 1];
      $('board').style.display = '';
      render();
      $('prevDay').addEventListener('click', () => {
        const dates = allDates();
        const i = dates.indexOf(selectedDate);
        if (i > 0) { selectedDate = dates[i - 1]; render(); }
      });
      $('nextDay').addEventListener('click', () => {
        const dates = allDates();
        const i = dates.indexOf(selectedDate);
        if (i < dates.length - 1) { selectedDate = dates[i + 1]; render(); }
      });
      window.addEventListener('resize', () => { renderBody(); renderSleep(); });
    })
    .catch(() => { $('loadError').style.display = ''; });
}

document.addEventListener('DOMContentLoaded', init);
