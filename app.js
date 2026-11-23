// 对抗时间引力 · 纯前端渲染
// 数据全部来自同目录的 data.json（飞书「生命森林」多维表格的真实记录）。
// 没有数据的日子显示「待记录」，静息心率和步数显示「待同步」，不编数、不写 0。

let DATA = null;
let selectedDate = null;

const $ = (id) => document.getElementById(id);
const fmtDate = (d) => d ? d.slice(5).replace('-', '月') + '日' : '—';
const num = (v, digits) => (v === null || v === undefined) ? '待记录' : Number(v).toFixed(digits);
const pending = '<span class="pending">待记录</span>';
const pendingSync = '<span class="pending">待同步</span>';
// 有数就显示数 + 单位，没数就显示待记录（不显示 null、不编数）。
const hnum = (v, suffix) => (v === null || v === undefined) ? pending : v + suffix;

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
    if (r.missing) {
      // 没数据的日子：虚线框占位，顶上写待记录，不画 0.0h（0 小时和没记是两回事）。
      ctx.strokeStyle = '#1f4d36';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - bw / 2, padT + ih - 24, bw, 24);
      ctx.setLineDash([]);
      ctx.fillStyle = '#7fa08d';
      ctx.fillText('待记录', cx - 16, padT - 4);
      ctx.fillText(fmtDate(r.label), cx - 16, h - 8);
      return;
    }
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

function drawDeficitBars(canvas, rows) {
  // 每日缺口条形图：rows [{label, deficit}]，deficit>0 已缺（绿，向上）、
  // deficit<0 已超（红，向下）、null 待记录。零线在中间。
  const { ctx, w, h } = setupCanvas(canvas);
  const padL = 10, padR = 10, padT = 24, padB = 26;
  const iw = w - padL - padR, ih = h - padT - padB;
  const maxAbs = Math.max(...rows.map(r => Math.abs(r.deficit || 0)), 400);
  const zeroY = padT + ih / 2;
  const bw = Math.min(64, iw / rows.length * 0.55);
  ctx.font = '11px sans-serif';
  ctx.strokeStyle = '#1f4d36';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(w - padR, zeroY); ctx.stroke();
  rows.forEach((r, i) => {
    const cx = padL + (iw * (i + 0.5)) / rows.length;
    if (r.deficit === null || r.deficit === undefined) {
      ctx.fillStyle = '#7fa08d';
      ctx.fillText('待记录', cx - 16, zeroY - 6);
      ctx.fillText(fmtDate(r.label), cx - 16, h - 8);
      return;
    }
    const bh = (Math.abs(r.deficit) / maxAbs) * (ih / 2);
    if (r.deficit > 0) {
      ctx.fillStyle = '#8fd6a8';
      ctx.fillRect(cx - bw / 2, zeroY - bh, bw, bh);
      ctx.fillStyle = '#e8f2ea';
      ctx.fillText('+' + r.deficit, cx - 14, zeroY - bh - 6);
    } else if (r.deficit < 0) {
      ctx.fillStyle = '#e88a7a';
      ctx.fillRect(cx - bw / 2, zeroY, bw, bh);
      ctx.fillStyle = '#e8f2ea';
      ctx.fillText(String(r.deficit), cx - 14, zeroY + bh + 12);
    } else {
      ctx.fillStyle = '#e8f2ea';
      ctx.fillText('0', cx - 4, zeroY - 6);
    }
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
    stats.push(['下次称重', fmtDate(meta.nextWeighIn), '']);
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
    '下次称重：' + fmtDate(DATA.meta.nextWeighIn) + '。';
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
  const dy = byDate(DATA.daily, selectedDate)[0];
  const bedWake = (sel.bedTime && sel.wakeTime)
    ? `${sel.date} · ${sel.bedTime} 入睡 — ${sel.wakeTime} 起床`
    : `${sel.date} · 入睡 / 起床时间待记录`;
  $('sleepLatest').innerHTML =
    `<div class="faint">${bedWake}</div>` +
    `<div class="kv"><span class="k">总时长</span><span class="v">${sel.hours} 小时</span></div>` +
    `<div class="kv"><span class="k">深睡</span><span class="v">${hnum(sel.deepHours, ' 小时')}</span></div>` +
    `<div class="kv"><span class="k">浅睡</span><span class="v">${hnum(sel.lightHours, ' 小时')}</span></div>` +
    `<div class="kv"><span class="k">REM</span><span class="v">${hnum(sel.remHours, ' 小时')}</span></div>` +
    `<div class="kv"><span class="k">静息心率</span><span class="v">${(dy && dy.restingHeartRate !== null && dy.restingHeartRate !== undefined) ? dy.restingHeartRate + ' 次/分' : pendingSync}</span></div>` +
    `<div class="kv"><span class="k">步数</span><span class="v">待更新</span></div>` +
    `<div class="faint" style="margin-top:6px">睡眠时长来自手表自动同步（Intervals.icu）；深浅 / REM 接口里没有，之前按华为运动健康截图手填。</div>`;
  drawStackedBars($('sleepChart'), weekDates().map(ds => {
    const s = byDate(rows, ds)[0];
    if (!s) return { label: ds, deep: 0, light: 0, rem: 0, missing: true };
    return { label: ds, deep: s.deepHours || 0, light: s.lightHours || 0, rem: s.remHours || 0 };
  }), [
    { key: 'deep', color: '#5b8dd9' },
    { key: 'light', color: '#8fd6a8' },
    { key: 'rem', color: '#c9a7e8' },
  ]);
  // 周视图数字表：本周 7 天，每天睡几小时（深/浅/REM），没数据的日子待记录。
  $('sleepWeekTable').innerHTML =
    '<h3>本周</h3><table><tr><th>日期</th><th class="num">总时长</th><th class="num">深睡</th><th class="num">浅睡</th><th class="num">REM</th></tr>' +
    weekDates().map(ds => {
      const s = byDate(rows, ds)[0];
      if (!s) return `<tr><td>${weekDayLabel(ds)}</td><td class="num" colspan="4">${pending}</td></tr>`;
      return `<tr><td>${weekDayLabel(ds)}</td><td class="num">${s.hours}h</td><td class="num">${hnum(s.deepHours, 'h')}</td><td class="num">${hnum(s.lightHours, 'h')}</td><td class="num">${hnum(s.remHours, 'h')}</td></tr>`;
    }).join('') + '</table>';
}

function renderEnergy() {
  const rows = [...(DATA.daily || [])].sort((a, b) => b.date.localeCompare(a.date));
  const cell = (v, d = 0) => (v === null || v === undefined) ? '<span class="pending">待记录</span>' : Number(v).toFixed(d);
  // 摄入为空，盈余就显示待记录，别拿 0 去减（11-11/11-12/11-13 三天就是这么错的）。
  const surplusCell = (r) => (r.intakeKcal === null || r.intakeKcal === undefined)
    ? '<span class="pending">待记录</span>'
    : cell(r.surplusKcal);
  // 合计：只算摄入和消耗都有的日子，盈余总数 = 摄入合计 − 消耗合计（负数就是累计缺口）。
  const valid = rows.filter(r => r.intakeKcal !== null && r.intakeKcal !== undefined && r.expenditureKcal !== null && r.expenditureKcal !== undefined);
  const totIn = valid.reduce((a, r) => a + (r.intakeKcal || 0), 0);
  const totOut = valid.reduce((a, r) => a + (r.expenditureKcal || 0), 0);
  const totSur = totIn - totOut;
  const totSurCell = totSur <= 0 ? '已缺 ' + Math.abs(totSur) + ' 千卡' : '已超 ' + totSur + ' 千卡';
  $('energyTable').innerHTML =
    '<table><tr><th>日期</th><th class="num">摄入</th><th class="num">消耗</th><th class="num">盈余（到现在为止）</th></tr>' +
    rows.map(r =>
      `<tr><td>${fmtDate(r.date)}</td><td class="num">${cell(r.intakeKcal)}</td>` +
      `<td class="num">${cell(r.expenditureKcal)}</td><td class="num">${surplusCell(r)}</td></tr>`).join('') +
    `<tr><td><b>合计</b></td><td class="num"><b>${totIn} 千卡</b></td><td class="num"><b>${totOut} 千卡</b></td><td class="num"><b>${totSurCell}</b></td></tr>` +
    '</table>';
  $('energyNote').textContent = '';
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
  html += `<div class="faint">要减约 ${fl.fatToLoseKg || '1.04'} kg 脂肪（约 ${fl.fatToLoseKcal || 8000} 千卡）；${fl.startDate ? fl.startDate.slice(5).replace('-', '月') + '日' : ''}开始，共 ${fl.totalDays || 21} 天，${fl.targetDate ? fl.targetDate.slice(5).replace('-', '月') + '日' : ''}完成；已缺 ${fl.weeklyDeficitSoFarKcal || 0} 千卡，还剩 ${fl.estDaysRemaining || '18'} 天，每天约 ${fl.dailyDeficitTargetKcal || 350} 千卡。</div>`;

  // --- 2. 今天吃了什么：分顿表格 + 合计 + 与目标差 + 目标 ---
  html += `<h3>今天吃了什么（${t.date || selectedDate}）</h3>`;
  const meals = (dy && dy.meals) ? dy.meals : null;
  const intakeTarget = fl.singleDayIntakeKcal || '1600–1800';
  const proteinTarget = fl.dailyProteinTargetG || 120;
  let totalKcal = 0, totalProtein = 0;
  // 与目标差：热量按 1800 千卡以内算（少了是好事，绿；超了红），蛋白按 120 克算；负红正绿
  const diffCells = (kcal, protein) => {
    const dk = kcal - 1800, dp = protein - proteinTarget;
    const kcalCell = dk <= 0 ? `<span class="pos">−${Math.abs(dk)} 千卡</span>` : `<span class="neg">+${dk} 千卡</span>`;
    const pCell = dp < 0 ? `<span class="neg">−${Math.abs(dp)} 克</span>` : `<span class="pos">+${dp} 克</span>`;
    return { kcalCell, pCell };
  };
  if (meals && meals.length) {
    totalKcal = meals.reduce((a, m) => a + (m.kcal || 0), 0);
    totalProtein = meals.reduce((a, m) => a + (m.proteinG || 0), 0);
    const d = diffCells(totalKcal, totalProtein);
    // 固定四行：早、午、晚、其他（加餐/零食都归到其他里），没吃的那行空着。
    const byName = {};
    meals.forEach(m => {
      const key = (m.name === '早餐' || m.name === '午餐' || m.name === '晚餐') ? m.name : '其他';
      byName[key] = byName[key] || { kcal: 0, proteinG: 0, desc: [] };
      byName[key].kcal += m.kcal || 0;
      byName[key].proteinG += m.proteinG || 0;
      byName[key].desc.push(m.desc);
    });
    const fixedRows = ['早餐', '午餐', '晚餐', '其他'].map(name => {
      const r = byName[name];
      if (!r) return `<tr><td>${name}</td><td></td><td class="num"></td><td class="num"></td></tr>`;
      return `<tr><td>${name}</td><td>${r.desc.join('；')}</td><td class="num">${r.kcal} 千卡</td><td class="num">${r.proteinG} 克</td></tr>`;
    }).join('');
    html += '<table><tr><th>这一顿</th><th>吃了什么</th><th class="num">热量</th><th class="num">蛋白</th></tr>' +
      fixedRows +
      `<tr><td><b>合计</b></td><td></td><td class="num"><b>${totalKcal} 千卡</b></td><td class="num"><b>${totalProtein} 克</b></td></tr>` +
      `<tr><td>与目标差</td><td></td><td class="num">${d.kcalCell}</td><td class="num">${d.pCell}</td></tr>` +
      `<tr><td><b>目标</b></td><td></td><td class="num">${intakeTarget} 千卡以内</td><td class="num">${proteinTarget} 克以上</td></tr>` +
      '</table>';
  } else if (dy && dy.intakeKcal !== null && dy.intakeKcal !== undefined) {
    totalKcal = dy.intakeKcal;
    totalProtein = dy.proteinG || 0;
    const d = diffCells(totalKcal, totalProtein);
    html += `<div class="kv"><span class="k">全天摄入</span><span class="v">约 ${dy.intakeKcal} 千卡、蛋白约 ${dy.proteinG || '—'} 克</span></div>`;
    html += `<div class="faint">这天的分顿明细还没记，只留了总数。</div>`;
    html += `<div class="kv"><span class="k">与目标差</span><span class="v">${d.kcalCell}、${d.pCell}</span></div>`;
    html += `<div class="kv"><span class="k">目标</span><span class="v">${intakeTarget} 千卡以内、蛋白 ${proteinTarget} 克以上</span></div>`;
  } else {
    html += `<div class="pending">今天还没记吃的</div>`;
  }

  // --- 3. 消耗账：基础代谢、日常活动、运动、总消耗、热量缺口 ---
  html += `<h3>消耗账</h3>`;
  const ex = dy && dy.exercise ? dy.exercise : null;
  const bmr = b ? b.bmrKcal : null;
  let expend = dy ? dy.expenditureKcal : null;
  let deficit = dy ? dy.surplusKcal : null;
  const exKcal = ex ? ex.kcal : 0;
  const activityEst = dy ? dy.activityKcal : null;
  // 公式：总消耗 = 基础代谢 + 日常活动 + 运动；缺口 = 总消耗 − 今天已吃
  if ((expend === null || expend === undefined) && bmr !== null && bmr !== undefined && activityEst !== null && activityEst !== undefined) {
    expend = bmr + activityEst + exKcal;
  }
  // 日常活动优先显示手表实测值（activityKcal），只有没手表数时才从总消耗反推
  const dailyActivity = (activityEst !== null && activityEst !== undefined)
    ? activityEst
    : ((expend !== null && expend !== undefined && bmr !== null && bmr !== undefined)
      ? Math.round(expend - bmr - exKcal)
      : null);
  if ((deficit === null || deficit === undefined) && expend !== null && expend !== undefined && totalKcal > 0) {
    deficit = totalKcal - expend;
  }
  html += `<div class="kv"><span class="k">基础代谢</span><span class="v">${bmr === null || bmr === undefined ? '待记录' : bmr + ' 千卡'}</span></div>`;
  html += `<div class="kv"><span class="k">日常活动</span><span class="v">${dailyActivity === null ? '待记录' : '约 ' + dailyActivity + ' 千卡'}</span></div>`;
  let exLabel;
  if (ex) {
    exLabel = `约 ${ex.kcal} 千卡（${ex.type} · 约 ${ex.durationMin} 分钟）`;
  } else {
    const tr = byDate(DATA.training, selectedDate).filter(r => r.source === '手动');
    exLabel = tr.length ? `${tr.map(x => x.type).join('、')}（详情在下面的运动综合里）` : '待记录';
  }
  html += `<div class="kv"><span class="k">运动</span><span class="v">${exLabel}</span></div>`;
  html += `<div class="kv"><span class="k">总消耗</span><span class="v">${expend === null || expend === undefined ? '待记录' : '约 ' + expend + ' 千卡'}</span></div>`;
  const deficitCell = deficit === null || deficit === undefined ? '待记录' : (deficit <= 0 ? '已缺 ' + Math.abs(deficit) + ' 千卡' : '已超 ' + deficit + ' 千卡');
  html += `<div class="kv"><span class="k">热量缺口</span><span class="v">${deficitCell}</span></div>`;

  // --- 4. 总体任务 / 任务进度：本周累计缺口、目标 ---
  html += `<h3>任务进度</h3>`;
  html += `<div class="kv"><span class="k">本周累计缺口</span><span class="v">${fl.weeklyDeficitSoFarKcal || 0} 千卡</span></div>`;
  html += `<div class="kv"><span class="k">本周目标</span><span class="v">${fl.weeklyDeficitTargetKcal || '2400'} 千卡</span></div>`;

  html += `<div class="faint" style="margin-top:8px">热量按周算总账（今天多、明天少可以）；蛋白按天算，不能攒，今天不够明天吃双倍也补不回来。数字都是估算，不是称重数。</div>`;
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
    html += `<div class="faint" style="margin-top:8px">手表自动记的运动 ${watchCount} 条（详情在飞书训练记录表里）。</div>`;
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


// ---------- 每周回顾：周一到周日，一天一行，图表＋数字 ----------
// 本周 = 最新一条数据所在的那一周（周一到周日）。没数据的格子显示待记录，不编数。
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const diff = (d.getDay() + 6) % 7; // 距周一的天数
  d.setDate(d.getDate() - diff);
  return d;
}
function fmtISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function weekDates() {
  const dates = allDates();
  const latest = dates[dates.length - 1];
  const mon = mondayOf(latest);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    out.push(fmtISO(d));
  }
  return out;
}

// 各面板周视图共用的小帮手。
function weekDayLabel(ds) {
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return wd[new Date(ds + 'T12:00:00').getDay()] + ' ' + fmtDate(ds);
}
// 补剂周视图的口子：飞书每日补剂打卡表目前没有记录，显示待同步，不编数。
// 以后 data.json 的 daily 里有了 suppCheckedCount 字段，这里自动显示“已打 x / 13”。
function suppCell(dy) {
  if (dy && dy.suppCheckedCount !== null && dy.suppCheckedCount !== undefined) {
    return '已打 ' + dy.suppCheckedCount + ' / 13';
  }
  return '<span class="pending">待同步</span>';
}

function renderSuppWeek() {
  $('suppWeek').innerHTML =
    '<h3>本周</h3><table><tr><th>日期</th><th>打卡</th></tr>' +
    weekDates().map(ds => {
      const dy = byDate(DATA.daily, ds)[0];
      return `<tr><td>${weekDayLabel(ds)}</td><td>${suppCell(dy)}</td></tr>`;
    }).join('') + '</table>';
}

function renderTrainingWeek() {
  // 每天做了什么运动、消耗多少卡（daily[].exercise）；有记录但没运动写“无”，没记录写待记录。
  $('trainingWeek').innerHTML =
    '<h3>本周</h3><table><tr><th>日期</th><th>运动</th><th class="num">消耗</th></tr>' +
    weekDates().map(ds => {
      const dy = byDate(DATA.daily, ds)[0];
      if (!dy) return `<tr><td>${weekDayLabel(ds)}</td><td colspan="2">${pending}</td></tr>`;
      if (!dy.exercise) return `<tr><td>${weekDayLabel(ds)}</td><td>无</td><td class="num">—</td></tr>`;
      return `<tr><td>${weekDayLabel(ds)}</td><td>${dy.exercise.type}</td><td class="num">${dy.exercise.kcal} 千卡</td></tr>`;
    }).join('') + '</table>';
}

function renderWeeklyReview() {
  const week = weekDates();
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const dayLabel = (ds) => wd[new Date(ds + 'T12:00:00').getDay()] + ' ' + fmtDate(ds);
  const rows = week.map(ds => {
    const dy = byDate(DATA.daily, ds)[0];
    const sl = byDate(DATA.sleep, ds)[0];
    // 缺口 = 消耗 − 摄入 = −surplusKcal；正数是已缺（越大越好），负数是已超。
    const deficit = (dy && dy.surplusKcal !== null && dy.surplusKcal !== undefined)
      ? -dy.surplusKcal : null;
    return { date: ds, dy, sl, deficit };
  });

  $('weeklyTag').textContent = fmtDate(week[0]) + '–' + fmtDate(week[6]);
  const fl = DATA.fatLoss || {};
  const defSoFar = rows.reduce((a, r) => a + (r.deficit || 0), 0);
  const protSoFar = rows.reduce((a, r) => a + ((r.dy && r.dy.proteinG) || 0), 0);
  $('weeklySummary').innerHTML =
    `<div style="font-size:15px;margin:2px 0 8px">本周已缺 <b class="pos">${defSoFar}</b> / ${fl.weeklyDeficitTargetKcal || '2400'} 千卡 · 蛋白 <b>${protSoFar}</b> / ${fl.weeklyProteinTargetG || 840} 克</div>`;

  drawDeficitBars($('weekDeficitChart'), rows.map(r => ({ label: r.date, deficit: r.deficit })));

  const cellNum = (v) => (v === null || v === undefined)
    ? '<span class="pending">待记录</span>' : v;
  const cellDeficit = (d) => {
    if (d === null || d === undefined) return '<span class="pending">待记录</span>';
    if (d > 0) return `<span class="pos">+${d}</span>`;
    if (d < 0) return `<span class="neg">${d}</span>`;
    return '0';
  };
  const cellExercise = (dy) => {
    if (!dy) return '<span class="pending">待记录</span>';
    if (dy.exercise) return `${dy.exercise.type} ${dy.exercise.kcal}`;
    return '无';
  };
  const cellSleep = (sl) => {
    if (!sl) return '<span class="pending">待记录</span>';
    if (sl.deepHours === null || sl.deepHours === undefined) return `${sl.hours}h`;
    return `${sl.hours}h <span class="faint">深${sl.deepHours} 浅${sl.lightHours} REM${sl.remHours}</span>`;
  };
  // 补剂打卡：飞书每日补剂打卡表目前没有记录，显示待同步，不编数。
  // 以后 data.json 的 daily 里有了 suppCheckedCount 字段，这里会自动显示“已打 x / 13”。
  const cellSupp = (dy) => {
    if (dy && dy.suppCheckedCount !== null && dy.suppCheckedCount !== undefined) {
      return dy.suppCheckedCount + ' / 13';
    }
    return '<span class="pending">待同步</span>';
  };
  $('weeklyTable').innerHTML =
    '<table><tr><th>日期</th><th class="num">摄入</th><th class="num">蛋白</th><th class="num">缺口</th><th>运动</th><th class="num">睡眠</th><th>补剂</th></tr>' +
    rows.map(r =>
      `<tr><td>${dayLabel(r.date)}</td>` +
      `<td class="num">${cellNum(r.dy ? r.dy.intakeKcal : null)}</td>` +
      `<td class="num">${cellNum(r.dy ? r.dy.proteinG : null)}</td>` +
      `<td class="num">${cellDeficit(r.deficit)}</td>` +
      `<td>${cellExercise(r.dy)}</td>` +
      `<td class="num">${cellSleep(r.sl)}</td>` +
      `<td>${cellSupp(r.dy)}</td></tr>`).join('') +
    '</table>';

  drawStackedBars($('weekSleepChart'), week.map(ds => {
    const sl = byDate(DATA.sleep, ds)[0];
    if (!sl) return { label: ds, deep: 0, light: 0, rem: 0, missing: true };
    return { label: ds, deep: sl.deepHours || 0, light: sl.lightHours || 0, rem: sl.remHours || 0 };
  }), [
    { key: 'deep', color: '#5b8dd9' },
    { key: 'light', color: '#8fd6a8' },
    { key: 'rem', color: '#c9a7e8' },
  ]);
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
    (meta.lastWatchSync ? '<br>手表上次成功同步到 ' + fmtDate(meta.lastWatchSync) + '。' : '') +
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
  renderSuppWeek();
  renderTrainingWeek();
  renderWeeklyReview();
  renderReview();
  renderCheckup();
  renderFooter();
}

function init() {
  fetch('data.json?v=81')
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
      window.addEventListener('resize', () => { renderBody(); renderSleep(); renderWeeklyReview(); });
    })
    .catch(() => { $('loadError').style.display = ''; });
}

document.addEventListener('DOMContentLoaded', init);
