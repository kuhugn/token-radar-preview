// Token Launch Radar — a plain static dashboard. It reads window.RADAR (written beside dashboard/
// by main.ts from the same model run as board.json) and renders three views: the ranked Board with
// filters and a per-protocol detail drawer, the Live view of protocols whose token already trades,
// and the Methodology view that states the model and its calibration. No network, no framework.
(function () {
  'use strict';
  var D = window.RADAR;
  var app = document.getElementById('board');
  if (!D || !app) return;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) { return n === null || n === undefined ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function age(d) { return d === null ? 'unknown' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd'; }
  function x2(n) { return 'x' + n.toFixed(2); }

  var hash = {};
  location.hash.replace(/[#&]+([^=&]+)=([^&]*)/g, function (m, k, v) { hash[k] = decodeURIComponent(v); });
  var state = {
    tab: hash.tab || 'board', q: hash.q || '', cat: hash.cat || 'all', chain: hash.chain || 'all',
    wl: hash.wl === '1', minTvl: +(hash.tvl || 0), sort: 'imp', dir: -1, sel: hash.p || null,
  };

  var star = '<svg class="star" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-label="watchlist"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>';
  // A row's range spark: the implied value's floor and ceiling when relative growth runs to its
  // clamps, on a log scale, with the base value marked. Drawn only from the row's own figures.
  function spark(r) {
    var lo = Math.log(r.implied_floor), hi = Math.log(r.implied_ceiling), v = Math.log(r.implied_value_usd);
    var pos = hi > lo ? ((v - lo) / (hi - lo)) * 76 + 2 : 40;
    return '<svg class="spark" width="80" height="14" viewBox="0 0 80 14" role="img" aria-label="implied range ' + usd(r.implied_floor) + ' to ' + usd(r.implied_ceiling) + '">' +
      '<rect x="2" y="5" width="76" height="4" rx="2" fill="#27395c"/><circle cx="' + pos.toFixed(1) + '" cy="7" r="3.4" fill="#2dd4bf"/></svg>';
  }

  function header() {
    var tot = D.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
    return '<header class="top"><div class="brand"><h1>Token Launch <span class="rad">Radar</span></h1>' +
      '<p>Pre-token protocols ranked by the value their token would carry if it launched on today\'s record. ' +
      'Model <b>' + esc(D.model_version) + '</b> calibrates itself on this snapshot\'s own tokenised protocols; protocols whose token already trades sit in Live, never in the ranking.</p></div>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + D.board_size + '</b><span>ranked</span></div>' +
      '<div class="stat"><b>' + D.watchlist_size + '</b><span>watchlist</span></div>' +
      '<div class="stat"><b>' + usd(tot) + '</b><span>total implied</span></div>' +
      '<div class="stat"><b>' + D.global_median.toFixed(3) + '</b><span>median mcap/TVL</span></div>' +
      '</div></header>';
  }

  function tabs() {
    function b(id, label) { return '<button data-tab="' + id + '"' + (state.tab === id ? ' class="on"' : '') + '>' + label + '</button>'; }
    return '<nav class="tabs">' + b('board', 'Board') + b('live', 'Live tokens') + b('method', 'Methodology') + '</nav>';
  }

  function filtered() {
    var rows = D.rows.filter(function (r) {
      if (state.wl && !r.watchlist) return false;
      if (state.cat !== 'all' && (r.category || '(uncategorised)') !== state.cat) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (state.q && (r.name + ' ' + r.slug).toLowerCase().indexOf(state.q.toLowerCase()) < 0) return false;
      return true;
    });
    var key = { rank: 'rank', tvl: 'tvl_usd', chg: 'change_7d', age: 'age_days', mult: 'multiple', imp: 'implied_value_usd', p: 'p_launch' }[state.sort];
    rows.sort(function (a, b) {
      var va = a[key], vb = b[key];
      if (va === null) va = -Infinity; if (vb === null) vb = -Infinity;
      return (va - vb) * state.dir || a.rank - b.rank;
    });
    return rows;
  }

  function boardView() {
    var cats = [], chains = [], seenC = {}, seenH = {};
    D.rows.forEach(function (r) {
      var c = r.category || '(uncategorised)';
      if (!seenC[c]) { seenC[c] = 1; cats.push(c); }
      r.chains.forEach(function (h) { if (!seenH[h]) { seenH[h] = 1; chains.push(h); } });
    });
    cats.sort(); chains.sort();
    var rows = filtered();
    function opts(list, cur, allLabel) {
      return '<option value="all">' + allLabel + '</option>' + list.map(function (v) {
        return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>';
      }).join('');
    }
    var tvlOpts = [[0, 'Any TVL'], [1e7, '$10M+'], [5e7, '$50M+'], [2.5e8, '$250M+'], [1e9, '$1B+']].map(function (o) {
      return '<option value="' + o[0] + '"' + (state.minTvl === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');
    function th(id, label, cls) {
      var arrow = state.sort === id ? (state.dir === -1 ? ' ▾' : ' ▴') : '';
      return '<th class="sortable ' + (cls || '') + '" data-sort="' + id + '">' + label + arrow + '</th>';
    }
    var body = rows.map(function (r) {
      var chg = r.change_7d === null ? '<span class="dim">n/a</span>' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</span>';
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.sel === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="rank num">' + r.rank + '</td>' +
        '<td class="proto l"><span class="nm">' + esc(r.name) + '</span>' + (r.watchlist ? star : '') + '<span class="sl">' + esc(r.slug) + '</span></td>' +
        '<td class="l"><span class="cat">' + esc(r.category || 'Uncategorised') + '</span></td>' +
        '<td class="num">' + r.chains.length + '</td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td>' +
        '<td class="num">' + chg + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num">' + r.multiple.toFixed(2) + '</td>' +
        '<td class="num"><span class="pbar"><i style="width:' + r.p_launch + '%"></i></span>' + r.p_launch + '</td>' +
        '<td class="l">' + spark(r) + '</td>' +
        '<td class="num imp">' + usd(r.implied_value_usd) + '</td>' +
        '<td class="l"><span class="badge ' + (r.risk === 'high' ? 'hi' : r.risk === 'medium' ? 'md' : 'lo') + '">' + r.risk.toUpperCase() + '</span></td></tr>';
    }).join('');
    return '<div class="toolbar">' +
      '<input id="q" type="search" placeholder="Search name or slug" value="' + esc(state.q) + '">' +
      '<select id="cat">' + opts(cats, state.cat, 'All categories') + '</select>' +
      '<select id="chain">' + opts(chains, state.chain, 'All chains') + '</select>' +
      '<select id="tvl">' + tvlOpts + '</select>' +
      '<label class="chk"><input type="checkbox" id="wl"' + (state.wl ? ' checked' : '') + '> Watchlist only</label>' +
      '<span class="count">' + rows.length + ' of ' + D.board_size + ' protocols · click a row for its farm plan</span></div>' +
      '<div class="wrap"><table><thead><tr>' +
      th('rank', '#') + th('rank', 'Protocol', 'l') + '<th class="l">Category</th><th>Chains</th>' +
      th('tvl', 'TVL') + th('chg', '7d') + th('age', 'Age') + th('mult', 'Mult') + th('p', 'Launch') + '<th class="l">Range</th>' +
      th('imp', 'Implied value') + '<th class="l">Risk</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function detail(r) {
    var wf = [
      ['TVL (snapshot)', usd(r.tvl_usd)],
      ['x category multiple (' + r.peers + ' peers' + (r.risk_flags.indexOf('fallback multiple') >= 0 ? ', global fallback' : '') + ')', x2(r.multiple)],
      ['x relative growth (' + (r.growth_rel_pp > 0 ? '+' : '') + r.growth_rel_pp.toFixed(1) + 'pp vs category)', x2(r.growth_multiplier)],
      ['x maturity (' + age(r.age_days) + ' without a token)', x2(r.maturity_multiplier)],
      ['x breadth (' + r.chains.length + ' chains)', x2(r.breadth_multiplier)],
      ['x scale', x2(r.scale_multiplier)],
    ].map(function (row) { return '<tr><td class="l">' + row[0] + '</td><td class="num">' + row[1] + '</td></tr>'; }).join('') +
      '<tr class="tot"><td class="l">Implied value</td><td class="num">' + usd(r.implied_value_usd) + '</td></tr>' +
      '<tr><td class="l">If relative growth ran to -30pp / +30pp</td><td class="num">' + usd(r.implied_floor) + ' / ' + usd(r.implied_ceiling) + '</td></tr>';
    var flags = r.risk_flags.length
      ? r.risk_flags.map(function (f) { return '<span class="flag">' + esc(f) + '</span>'; }).join('')
      : '<span class="flag ok">no model flags</span>';
    return '<h2>' + esc(r.name) + (r.watchlist ? star : '') + '</h2><div class="sub">' + esc(r.slug) + ' · rank #' + r.rank + ' of ' + D.board_size + (r.watchlist ? ' · on the snapshot watchlist' : ' · early, below the watchlist floor') + '</div>' +
      '<div class="kv">' +
      '<div><span>Implied value</span><b>' + usd(r.implied_value_usd) + '</b></div>' +
      '<div><span>TVL</span><b>' + usd(r.tvl_usd) + '</b></div>' +
      '<div><span>7d TVL change</span><b>' + pct(r.change_7d) + '</b></div>' +
      '<div><span>Launch priority</span><b>' + r.p_launch + ' / 100</b></div></div>' +
      '<h3 class="sec">How the value is built</h3><table class="wf">' + wf + '</table>' +
      '<h3 class="sec">Model flags</h3><div class="flags">' + flags + '</div>' +
      '<h3 class="sec">Chains</h3><p class="mut">' + esc(r.chains.join(', ') || 'none recorded') + '</p>' +
      '<h3 class="sec">Farm plan</h3><ol class="farm">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="dim">The launch-priority score never affects rank: rank is implied value alone. The plan is generated from this protocol\'s category, TVL, age and first chain — the same playbook code scores every row.</p>';
  }

  function liveView() {
    var max = Math.max.apply(null, D.live.map(function (r) { return r.multiple || 0; }).concat([0.01]));
    var medPos = Math.min(100, (D.global_median / max) * 100);
    var body = D.live.map(function (r) {
      var w = r.multiple === null ? 0 : (r.multiple / max) * 100;
      return '<tr><td class="proto l"><span class="nm">' + esc(r.name) + '</span><span class="sl">' + esc(r.symbol || r.slug) + '</span></td>' +
        '<td class="l"><span class="cat">' + esc(r.category || 'Uncategorised') + '</span></td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td><td class="num">' + usd(r.mcap_usd) + '</td>' +
        '<td class="num">' + (r.multiple === null ? 'n/a' : r.multiple.toFixed(3)) + '</td>' +
        '<td class="l"><div class="mbar"><div class="track"><div class="fill" style="width:' + w.toFixed(1) + '%"></div><div class="med" style="left:' + medPos.toFixed(1) + '%"></div></div></div></td>' +
        '<td class="num">' + pct(r.change_7d) + '</td></tr>';
    }).join('');
    return '<div class="panelbox"><h2>Already trading — the market\'s own values</h2>' +
      '<p>These protocols record a token, so no model prices them: the bar is each one\'s realised market-cap/TVL against the field\'s median (amber tick, ' + D.global_median.toFixed(3) + '). ' +
      'Their ratios are the evidence the board\'s category multiples are calibrated from — and the reason a pre-token protocol is never ranked beside them.</p></div>' +
      '<div class="wrap"><table><thead><tr><th class="l">Protocol</th><th class="l">Category</th><th>TVL</th><th>Market cap</th><th>Realised mult</th><th class="l">vs median</th><th>7d</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function methodView() {
    var cats = D.categories.map(function (c) {
      return '<tr><td class="l">' + esc(c.category) + '</td><td class="num">' + c.peers + '</td><td class="num">' + (c.peers ? c.raw_median.toFixed(3) : '—') + '</td>' +
        '<td class="num">' + c.multiple.toFixed(3) + (c.fallback ? ' <span class="badge md">FALLBACK</span>' : '') + '</td>' +
        '<td class="num">' + c.tokenised + ' / ' + c.total + '</td><td class="num">' + (c.median_change_7d === null ? 'n/a' : pct(c.median_change_7d)) + '</td></tr>';
    }).join('');
    var screened = D.screened_category + D.screened_product_name + D.screened_exchange_name + D.screened_version;
    return '<div class="panelbox"><h2>The model — ' + esc(D.model_version) + '</h2>' +
      '<p>Every implied value is one multiplication, and every factor in it comes from the snapshot\'s own figures:</p>' +
      '<p class="formula">implied = TVL x category multiple x relative growth x maturity x breadth x scale</p>' +
      '<p><b>Category multiple.</b> The median market-cap/TVL of the tokenised protocols in the same category, shrunk toward the global median (' + D.global_median.toFixed(3) + ') in log space with weight k = ' + D.shrinkage_k + ', estimated from the data (within-category variance over between-category variance). Categories with fewer than 3 tokenised peers use the global median and their rows are flagged. Multiples are clamped to [0.03, 1.20].</p>' +
      '<p><b>Relative growth.</b> 1 + 0.50 x clamp(7d change minus the category\'s median 7d change, -30pp, +30pp) / 100 — momentum is scored against the protocol\'s own category, never raw: in a week when the whole field fell, holding flat is strength. A missing change scores as the category median.</p>' +
      '<p><b>Maturity.</b> 0.70 to 0.85 over the first 90 days without a token, then 0.85 to 1.00 on a log scale to 1095 days; an unknown listing date scores as 180 days and is flagged. <b>Breadth.</b> +3% for a second chain, +2% a third, +1% each a fourth and fifth. <b>Scale.</b> x0.90 above $1B TVL, x0.85 below $20M.</p>' +
      '<p><b>Launch priority (display only).</b> The category\'s tokenisation rate scaled by an age-overdue curve peaking at 400-1000 days without a token. It orders nobody: rank is implied value alone, so the board\'s implied values never rise with rank.</p></div>' +
      '<div class="panelbox"><h2>Category calibration</h2><div class="wrap" style="border:0"><table><thead><tr><th class="l">Category</th><th>Tokenised peers</th><th>Raw median</th><th>Multiple used</th><th>Tokenised / all</th><th>Median 7d</th></tr></thead><tbody>' + cats + '</tbody></table></div></div>' +
      '<div class="panelbox"><h2>Coverage and the screen</h2>' +
      '<p>The snapshot holds ' + (D.pre_token + D.tokenised) + ' protocols: ' + D.tokenised + ' record a token and ' + D.pre_token + ' record none. Of the pre-token set, ' + screened + ' are set aside by the genuineness screen the watchlist itself uses — ' +
      D.screened_category + ' in wrapped/bridged/staking or exchange categories, ' + D.screened_product_name + ' named as wrapped or staked products, ' + D.screened_exchange_name + ' fronted by an exchange\'s name, ' + D.screened_version + ' versioned pools of another protocol — leaving the ' + D.board_size + ' ranked rows, every one of the ' + D.watchlist_size + ' watchlist protocols among them and ' + D.early_size + ' early rows below the $' + (D.floor_usd / 1e6) + 'M floor.</p>' +
      '<p>Data: ' + esc(D.source) + ', as of ' + esc(D.as_of) + '. Snapshot sha256 <code>' + esc(D.snapshot_sha256.slice(0, 16)) + '…</code> — the sealed bytes every run of this program reads. The page recomputes nothing from the network; the board it shows is the board the program wrote.</p></div>';
  }

  function render() {
    var html = header() + tabs();
    if (state.tab === 'board') html += boardView();
    else if (state.tab === 'live') html += liveView();
    else html += methodView();
    html += '<footer>Implied values are this radar\'s own claim from the snapshot\'s record, not a prediction that a token will launch. Farm plans are checklists, not financial advice.</footer>';
    var sel = state.sel ? D.rows.filter(function (r) { return r.slug === state.sel; })[0] : null;
    html += '<div class="scrim' + (sel ? ' on' : '') + '" id="scrim"></div><aside class="detail' + (sel ? ' on' : '') + '" id="detail">' +
      (sel ? '<button class="x" id="x" aria-label="Close">×</button>' + detail(sel) : '') + '</aside>';
    app.innerHTML = html;
    app.setAttribute('aria-busy', 'false');
    bind();
  }

  function bind() {
    Array.prototype.forEach.call(app.querySelectorAll('[data-tab]'), function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); render(); });
    });
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; refreshBody(); });
    var cat = document.getElementById('cat'); if (cat) cat.addEventListener('change', function () { state.cat = cat.value; refreshBody(); });
    var ch = document.getElementById('chain'); if (ch) ch.addEventListener('change', function () { state.chain = ch.value; refreshBody(); });
    var tv = document.getElementById('tvl'); if (tv) tv.addEventListener('change', function () { state.minTvl = +tv.value; refreshBody(); });
    var wl = document.getElementById('wl'); if (wl) wl.addEventListener('change', function () { state.wl = wl.checked; refreshBody(); });
    bindRows();
    var x = document.getElementById('x'); if (x) x.addEventListener('click', closeDetail);
    var sc = document.getElementById('scrim'); if (sc) sc.addEventListener('click', closeDetail);
  }
  function bindRows() {
    Array.prototype.forEach.call(app.querySelectorAll('th.sortable'), function (t) {
      t.addEventListener('click', function () {
        var s = t.getAttribute('data-sort');
        if (state.sort === s) state.dir = -state.dir; else { state.sort = s; state.dir = s === 'rank' ? 1 : -1; }
        render();
      });
    });
    Array.prototype.forEach.call(app.querySelectorAll('tbody tr[data-slug]'), function (tr) {
      tr.addEventListener('click', function () { state.sel = tr.getAttribute('data-slug'); render(); });
    });
  }
  // Re-render only the board view (keeps the search box focused while typing).
  function refreshBody() { render(); var q = document.getElementById('q'); if (q && state.tab === 'board') { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  function closeDetail() { state.sel = null; render(); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

  render();
})();
