/**
 * dashboard.js – Load entries from localStorage and render charts + stats
 */

(function () {
  const STORAGE_KEY = 'mindjournal_entries';

  /* ── Emotion colours ── */
  const EMOTION_COLORS = {
    joy:     '#FCD34D',
    sadness: '#60A5FA',
    anger:   '#F87171',
    fear:    '#A78BFA',
    disgust: '#6EE7B7'
  };

  const EMOTIONS = ['joy', 'sadness', 'anger', 'fear', 'disgust'];

  /* ── Load entries ── */
  function loadEntries() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  /* ── Dominant emotion ── */
  function dominantEmotion(emotions) {
    if (!emotions || Object.keys(emotions).length === 0) return 'neutral';
    let best = null, bestVal = -1;
    for (const [k, v] of Object.entries(emotions)) {
      if (v > bestVal) { bestVal = v; best = k; }
    }
    return best || 'neutral';
  }

  /* ── Format date ── */
  function formatDate(isoString) {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function formatDateShort(isoString) {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /* ── Average of array ── */
  function avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /* ── Compute stats ── */
  function computeStats(entries) {
    const total = entries.length;
    const joyValues     = entries.map(e => e.emotion?.joy     || 0);
    const sadnessValues = entries.map(e => e.emotion?.sadness || 0);
    const avgJoy     = avg(joyValues);
    const avgSadness = avg(sadnessValues);

    // Most common dominant emotion
    const counts = {};
    for (const e of entries) {
      const dom = dominantEmotion(e.emotion);
      counts[dom] = (counts[dom] || 0) + 1;
    }
    let mostCommon = '—';
    let maxCount = 0;
    for (const [em, cnt] of Object.entries(counts)) {
      if (cnt > maxCount) { maxCount = cnt; mostCommon = em; }
    }

    return { total, avgJoy, avgSadness, mostCommon };
  }

  /* ── Render stats cards ── */
  function renderStats(stats) {
    const el = (id) => document.getElementById(id);
    const statTotal      = el('statTotal');
    const statAvgJoy     = el('statAvgJoy');
    const statAvgSadness = el('statAvgSadness');
    const statMostCommon = el('statMostCommon');

    if (statTotal)      statTotal.textContent      = stats.total;
    if (statAvgJoy)     statAvgJoy.textContent      = Math.round(stats.avgJoy * 100) + '%';
    if (statAvgSadness) statAvgSadness.textContent  = Math.round(stats.avgSadness * 100) + '%';
    if (statMostCommon) statMostCommon.textContent  = stats.mostCommon;
  }

  /* ── Render line chart (last 14 entries) ── */
  function renderLineChart(entries) {
    const ctx = document.getElementById('lineChart');
    if (!ctx) return;

    const slice  = entries.slice(-14);
    const labels = slice.map(e => formatDateShort(e.date));

    const datasets = EMOTIONS.map(em => ({
      label:           em.charAt(0).toUpperCase() + em.slice(1),
      data:            slice.map(e => parseFloat(((e.emotion?.[em] || 0) * 100).toFixed(1))),
      borderColor:     EMOTION_COLORS[em],
      backgroundColor: EMOTION_COLORS[em] + '22',
      borderWidth:     2,
      pointRadius:     3,
      tension:         0.4,
      fill:            false
    }));

    new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}%`
            }
          }
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: { callback: v => v + '%', font: { size: 11 } },
            grid: { color: '#F3F4F6' }
          },
          x: {
            ticks: { font: { size: 11 } },
            grid: { display: false }
          }
        }
      }
    });
  }

  /* ── Render bar chart (averages across all entries) ── */
  function renderBarChart(entries) {
    const ctx = document.getElementById('barChart');
    if (!ctx) return;

    const avgs = EMOTIONS.map(em => parseFloat((avg(entries.map(e => e.emotion?.[em] || 0)) * 100).toFixed(1)));

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: EMOTIONS.map(e => e.charAt(0).toUpperCase() + e.slice(1)),
        datasets: [{
          label: 'Average %',
          data:  avgs,
          backgroundColor: EMOTIONS.map(e => EMOTION_COLORS[e] + 'CC'),
          borderColor:     EMOTIONS.map(e => EMOTION_COLORS[e]),
          borderWidth:     1.5,
          borderRadius:    6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.parsed.y}%`
            }
          }
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: { callback: v => v + '%', font: { size: 11 } },
            grid: { color: '#F3F4F6' }
          },
          x: {
            ticks: { font: { size: 12 } },
            grid: { display: false }
          }
        }
      }
    });
  }

  /* ── Render recent entries (last 5) ── */
  function renderRecentEntries(entries) {
    const container = document.getElementById('recentEntries');
    if (!container) return;

    const recent = [...entries].reverse().slice(0, 5);
    if (recent.length === 0) {
      container.innerHTML = '<p style="color:#9CA3AF; font-size:0.9rem;">No entries yet.</p>';
      return;
    }

    container.innerHTML = recent.map(entry => {
      const dom         = dominantEmotion(entry.emotion);
      const sentLabel   = entry.sentiment?.label || 'neutral';
      const textPreview = (entry.text || '').slice(0, 100) + ((entry.text || '').length > 100 ? '…' : '');
      const dateStr     = formatDate(entry.date);

      return `
        <div class="entry-card">
          <div>
            <div class="entry-date">${dateStr}</div>
            <div class="entry-text">${escapeHtml(textPreview)}</div>
          </div>
          <div class="entry-badges">
            <span class="emotion-badge ${dom}">${dom}</span>
            <span class="sentiment-badge ${sentLabel}">${sentLabel}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ── Escape HTML to prevent XSS ── */
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* ── Clear All Data ── */
  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to delete all journal entries? This cannot be undone.')) {
        localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
      }
    });
  }

  /* ── Main init ── */
  function init() {
    const entries = loadEntries();
    const noDataMsg    = document.getElementById('noDataMsg');
    const chartsSection = document.getElementById('chartsSection');

    if (entries.length === 0) {
      if (noDataMsg)    noDataMsg.style.display    = 'block';
      if (chartsSection) chartsSection.style.display = 'none';
      return;
    }

    if (noDataMsg)    noDataMsg.style.display    = 'none';
    if (chartsSection) chartsSection.style.display = 'block';

    const stats = computeStats(entries);
    renderStats(stats);
    renderLineChart(entries);
    renderBarChart(entries);
    renderRecentEntries(entries);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
