/* BGP Monitor — Dashboard Script */

const COLORS = {
  A: '#00D4AA', B: '#FF6B6B', C: '#FBBF24',
  D: '#A78BFA', P: '#60A5FA'
};
const TYPE_LABELS = {
  A: '单对等体撤回', B: '全网故障',
  C: '路由振荡', D: '永久消失', P: '部分断连'
};

let dailyChart = null, typeChart = null;
let eventsCache = null;

async function loadEvents() {
  try {
    const res = await fetch('data/events_summary.json');
    if (res.ok) eventsCache = await res.json();
  } catch(e) {}
}

async function loadData() {
  try {
    const res = await fetch('data/report.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch(e) {
    console.error('加载数据失败:', e);
    document.body.innerHTML = `<div style="max-width:600px;margin:120px auto;text-align:center;padding:40px;background:#131A2B;border-radius:12px;border:1px solid #1F2937;">
      <div style="font-size:48px;margin-bottom:16px;">⚠</div>
      <h2 style="margin-bottom:8px;">数据加载失败</h2>
      <p style="color:#6B7280;">请确保 data/report.json 文件存在，并已推送到 GitHub Pages。</p>
      <p style="color:#6B7280;font-size:13px;margin-top:8px;">${e.message}</p>
    </div>`;
    return null;
  }
}

function renderStats(data) {
  const byType = data.by_type || {};
  document.getElementById('statEvents').textContent = data.summary.total_events.toLocaleString();
  document.getElementById('statFullOutage').textContent = (byType.B || 0).toLocaleString();
  document.getElementById('statFlapping').textContent = (byType.C || 0).toLocaleString();
  document.getElementById('statPermanent').textContent = (byType.D || 0).toLocaleString();
}

function renderDailyChart(data) {
  const ctx = document.getElementById('dailyChart').getContext('2d');
  const trend = data.daily_trend || [];
  
  if (dailyChart) { dailyChart.destroy(); }
  
  dailyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.map(d => d.date.slice(5)),
      datasets: [{
        label: '事件数',
        data: trend.map(d => d.count),
        borderColor: '#00D4AA',
        backgroundColor: 'rgba(0,212,170,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 6,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6B7280', font: { size: 11, family: 'JetBrains Mono' } },
             grid: { color: 'rgba(31,41,55,0.5)' } },
        y: { ticks: { color: '#6B7280', font: { size: 11, family: 'JetBrains Mono' } },
             grid: { color: 'rgba(31,41,55,0.5)' },
             beginAtZero: true }
      },
      interaction: { mode: 'index', intersect: false }
    }
  });
}

function renderTypeChart(data) {
  const ctx = document.getElementById('typeChart').getContext('2d');
  const byType = data.by_type || {};
  const labels = Object.keys(byType).map(k => TYPE_LABELS[k] || k);
  const values = Object.values(byType);
  const colors = Object.keys(byType).map(k => COLORS[k] || '#6B7280');
  
  if (typeChart) { typeChart.destroy(); }
  
  typeChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#E5E7EB', font: { size: 11 }, padding: 12, usePointStyle: true }
        }
      }
    }
  });
}

function renderTopPrefixes(data) {
  const tbody = document.getElementById('prefixBody');
  tbody.innerHTML = '';
  
  const prefixes = data.top_prefixes || [];
  if (prefixes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#6B7280;">暂无数据</td></tr>';
    return;
  }
  
  prefixes.slice(0, 50).forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td>
      <td class="prefix-link" data-prefix="${p.prefix}">${p.prefix}</td>
      <td>${(p.count || 0).toLocaleString()}</td>`;
    tr.querySelector('.prefix-link').addEventListener('click', () => {
      document.getElementById('searchInput').value = p.prefix;
      doSearch();
    });
    tbody.appendChild(tr);
  });
}

function renderEventCards(eventsCache) {
  const container = document.getElementById('eventsContainer');
  if (!container || !eventsCache) return;
  
  // 取最新的 B/C/D 类型事件，最多 10 个
  const filtered = (eventsCache.events || [])
    .filter(e => ['B','C','D'].includes(e.type))
    .slice(0, 10);
  
  container.innerHTML = '';
  
  filtered.forEach(ev => {
    const start = ev.start ? new Date(ev.start * 1000).toISOString().slice(5, 16).replace('T', ' ') : '?';
    const duration = ev.end && ev.start ? Math.round((ev.end - ev.start) / 60) : '?';
    const typeNames = {B:'全网故障', C:'路由振荡', D:'永久消失'};
    
    const card = document.createElement('div');
    card.className = 'event-card';
    
    const prefixColor = ev.type === 'B' ? '#FF6B6B' : ev.type === 'C' ? '#FBBF24' : '#A78BFA';
    
    card.innerHTML = `
      <div class="event-card-header">
        <span class="event-card-prefix" style="color:${prefixColor}">${ev.prefix}</span>
        <span class="event-type-badge event-type-${ev.type}">${ev.type} ${typeNames[ev.type] || ''}</span>
      </div>
      <div class="event-card-reason">${ev.reason || ''}</div>
      <div class="event-card-meta">
        <span>${start}</span>
        <span>${duration}m</span>
        <span>${ev.peers || '?'} 对等体</span>
      </div>
    `;
    
    card.addEventListener('click', () => {
      document.getElementById('searchInput').value = ev.prefix;
      doSearch();
      document.getElementById('searchSection').scrollIntoView({behavior:'smooth'});
    });
    
    container.appendChild(card);
  });
}

async function doSearch() {
  const input = document.getElementById('searchInput').value.trim();
  const resultDiv = document.getElementById('searchResult');
  
  if (!input) {
    resultDiv.innerHTML = '<div class="search-empty">输入前缀后点击查询</div>';
    return;
  }
  
  resultDiv.innerHTML = '<div class="search-empty">查询中...</div>';
  
  // 根据 hash 找到对应 VPS
  const prefix = input;
  // 将前缀转为文件名格式
  const filePrefix = prefix.replace('/', '_');
  
  try {
    const res = await fetch(`data/prefixes/${filePrefix}.json`);
    if (!res.ok) throw new Error('未找到');
    const data = await res.json();
    
    const events = data.events || [];
    if (events.length === 0) {
      resultDiv.innerHTML = '<div class="search-empty">该前缀没有记录事件</div>';
      return;
    }
    
    resultDiv.innerHTML = `<div style="font-weight:600;margin-bottom:8px;font-family:JetBrains Mono;color:var(--accent);">${prefix} — ${events.length} 条事件</div>`;
    
    events.slice(0, 20).forEach(ev => {
      const div = document.createElement('div');
      div.className = 'event-item';
      div.innerHTML = `<span class="event-time">${ev.time || ''}</span>
        <span class="event-reason">${ev.reason || ''}</span>`;
      resultDiv.appendChild(div);
    });
    
    if (events.length > 20) {
      resultDiv.innerHTML += `<div class="search-empty" style="margin-top:8px;">...还有 ${events.length - 20} 条</div>`;
    }
  } catch(e) {
    resultDiv.innerHTML = `<div class="search-empty">未找到前缀"${prefix}"的相关记录</div>`;
  }
}

function showEventList(events, typeFilter) {
  const resultDiv = document.getElementById('searchResult');
  const title = typeFilter ? `类型 ${typeFilter} 事件 (前 ${events.length} 条)` : '最新事件 (前 50 条)';
  
  let html = `<div style="font-weight:600;margin-bottom:8px;">${title}</div>`;
  
  events.forEach((ev, i) => {
    const start = ev.start ? new Date(ev.start * 1000).toISOString().slice(5, 16).replace('T', ' ') : '?';
    const badge = `<span class="event-type-badge event-type-${ev.type}">${ev.type}</span>`;
    html += `<div class="event-item">
      <span class="event-time">${start}</span>
      ${badge}
      <span class="event-reason">${ev.prefix}</span>
      <span style="font-family:JetBrains Mono;font-size:11px;color:#6B7280;">${ev.reason ? ev.reason.slice(0, 30) : ''}</span>
    </div>`;
  });
  
  resultDiv.innerHTML = html;
}

async function init() {
  const data = await loadData();
  if (!data) return;
  
  document.getElementById('updateTime').textContent = 
    '更新于 ' + (data.generated_at || '—');
  
  renderStats(data);
  try { renderDailyChart(data); } catch(e) { console.log('图表不可用:', e.message); }
  try { renderTypeChart(data); } catch(e) { console.log('图表不可用:', e.message); }
  renderTopPrefixes(data);
  
  // 加载 events 概要
  try { await loadEvents(); } catch(e) {}
  try { renderEventCards(eventsCache); } catch(e) { console.log(e); }
  
  // 点击统计卡片，显示对应类型的事件
  document.querySelectorAll('.stat-card').forEach((card, i) => {
    card.style.cursor = 'pointer';
    card.title = '点击查看详情';
    card.addEventListener('click', () => {
      const types = ['events', 'B', 'C', 'D'];
      const et = types[i];
      if (et === 'events' && eventsCache) {
        showEventList(eventsCache.events.slice(0, 50));
      } else if (eventsCache) {
        const filtered = eventsCache.events.filter(e => e.type === et).slice(0, 50);
        showEventList(filtered, et);
      }
    });
  });
  
  document.getElementById('searchBtn').addEventListener('click', doSearch);
  document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });
  
  // 页面就绪动画
  document.querySelectorAll('.stat-card').forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(12px)';
    setTimeout(() => {
      el.style.transition = 'all 0.4s ease';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, i * 80);
  });
}

document.addEventListener('DOMContentLoaded', init);
