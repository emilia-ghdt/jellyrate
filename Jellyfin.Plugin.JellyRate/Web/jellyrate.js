/* JellyRate: rating section on the movie/series detail page, plus rating badges on title cards. Plain JS, no build step. */
(function () {
  'use strict';
  if (window.__jellyrate) { return; }
  window.__jellyrate = true;

  // All user-visible English strings live here.
  var T = {
    title: 'JellyRate',
    yourRating: 'Your rating',
    clear: 'Remove rating',
    rate: 'Rate',
    rateN: function (n) { return 'Rate ' + n + ' out of 10'; },
    yourScore: function (n) { return 'Your rating: ' + n + ' out of 10. Change rating'; },
    pendingScore: function (n) { return 'Pending rating: ' + n + ' out of 10, not saved. Change rating'; },
    unsaved: 'unsaved',
    reviewPlaceholder: 'Write a review (optional)',
    save: 'Save review',
    edited: 'edited',
    average: 'Average',
    ratings: function (n) { return n === 1 ? '1 rating' : n + ' ratings'; },
    none: 'No ratings yet.',
    error: 'JellyRate request failed.',
    me: ' (you)',
    badgeText: function (avg, n) { return 'JellyRate average ' + avg + ' out of 10, ' + T.ratings(n); }
  };

  var CSS =
    '.jellyrate{padding:0 3.3%;margin:1.5em 0;max-width:60em}' +
    '.jellyrate h2{margin:0 0 .5em}' +
    '.jellyrate .jr-row{display:flex;flex-wrap:wrap;align-items:center;gap:.3em;margin:.4em 0}' +
    '.jellyrate .jr-pop{position:relative;display:inline-block}' +
    '.jellyrate .jr-pill{display:inline-flex;align-items:center;gap:.5em;background:rgba(128,128,128,.25);color:inherit;border:0;border-radius:99em;padding:.55em 1.1em .55em .8em;font:inherit;font-weight:600;cursor:pointer}' +
    '.jellyrate .jr-pill small{font-weight:400;opacity:.7}' +
    '.jellyrate .jr-pill.empty .jr-ico{opacity:.7}' +
    '.jellyrate .jr-pill.unsaved{outline:1px dashed #9b5cf6;outline-offset:-1px}' +
    '.jellyrate .jr-pill .jr-unsaved{font-style:italic;opacity:.8}' +
    '.jellyrate .jr-btn[hidden]{display:none}' +
    '.jellyrate .jr-panel{position:absolute;z-index:5;left:0;top:100%;margin-top:.5em;display:flex;gap:2px;padding:.5em .6em;background:#202020;border:1px solid rgba(128,128,128,.4);border-radius:.5em;box-shadow:0 4px 16px rgba(0,0,0,.5)}' +
    '.jellyrate .jr-panel[hidden]{display:none}' +
    '.jellyrate .jr-star{background:none;border:0;padding:0;cursor:pointer;width:clamp(22px,7vw,30px);height:clamp(22px,7vw,30px);border-radius:.2em}' +
    '.jellyrate .jr-star .jr-ico{display:block;font-size:clamp(22px,7vw,30px);color:rgba(128,128,128,.35);background:none;-webkit-text-fill-color:currentColor}' +
    '.jellyrate .jr-star.on .jr-ico,.jellyrate .jr-star.peek .jr-ico{background:var(--jr-grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}' +
    '.jellyrate .jr-star.peek .jr-ico{opacity:.65}' +
    '.jellyrate .jr-pill:focus-visible,.jellyrate .jr-star:focus-visible{outline:2px solid #9b5cf6;outline-offset:2px}' +
    '.jellyrate .jr-btn{background:rgba(128,128,128,.25);color:inherit;border:0;border-radius:.3em;padding:.5em 1em;cursor:pointer;font:inherit}' +
    '.jellyrate textarea{width:100%;min-height:5em;box-sizing:border-box;margin:.4em 0;padding:.6em;background:rgba(128,128,128,.15);color:inherit;border:1px solid rgba(128,128,128,.5);border-radius:.3em;font:inherit}' +
    '.jellyrate .jr-entry{padding:.7em 0;border-top:1px solid rgba(128,128,128,.3)}' +
    '.jellyrate .jr-score{font-weight:bold;margin-left:.6em}' +
    '.jellyrate .jr-review{white-space:pre-wrap;margin:.3em 0}' +
    '.jellyrate .jr-muted{opacity:.7;font-size:.9em;margin-left:.6em}' +
    '.jellyrate .jr-err{color:#e55}' +
    // Stars reuse the web client's icon font (same as the community rating star), so they follow the theme
    // (Material Icons, or ElegantFin's Material Symbols). Filled stars get a purple-blue gradient via the
    // glyph; .jr-out is the outlined variant; the detail badge also takes .starIcon for the theme's alignment tweaks. The doubled class beats the theme's .starIcon rules.
    '.jr-ico.jr-ico{--jr-grad:linear-gradient(90deg,#4f8cf5,#7a6af3 35%,#9b5cf6 75%);font-size:1.4em;line-height:1;color:inherit;background:var(--jr-grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;flex:none}' +
    '.jr-ico.jr-out{background:none;-webkit-text-fill-color:currentColor;font-variation-settings:"FILL" 0,"wght" 400,"GRAD" 0,"opsz" 30}' +
    '.jr-badge{display:inline-flex;align-items:center;gap:0}' +
    '.jr-badge small{font-size:inherit;opacity:.7}' +
    '.jr-card{position:absolute;z-index:2;top:.4em;left:.4em;display:inline-flex;align-items:center;gap:.25em;padding:.15em .5em .15em .35em;border-radius:99em;background:rgba(0,0,0,.72);color:#fff;font-size:.85em;font-weight:600;line-height:1.3;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.4)}' +
    '.jr-card small{font-size:inherit;font-weight:400;opacity:.75}' +
    '.jr-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}';

  // The server may send PascalCase or camelCase.
  function pick(o, name) {
    if (!o) { return undefined; }
    var v = o[name.charAt(0).toLowerCase() + name.slice(1)];
    return v !== undefined ? v : o[name];
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; } // never innerHTML
    return e;
  }

  function url(id) { return window.ApiClient.getUrl('JellyRate/Items/' + id); }

  function call(type, id, body) {
    var opts = { type: type, url: url(id), dataType: 'json' };
    if (body) { opts.data = JSON.stringify(body); opts.contentType = 'application/json'; }
    return window.ApiClient.ajax(opts);
  }

  // A star from the web client's icon font. `outline` is the outlined variant (unrated state).
  function starIcon(outline, cls) {
    var s = el('span', 'material-icons jr-ico' + (cls ? ' ' + cls : '') + (outline ? ' jr-out' : ''), outline ? 'star_border' : 'star');
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  // Close every open star panel except the one containing `keep`.
  function closePops(keep) {
    var pops = document.querySelectorAll('.jellyrate .jr-pop');
    for (var i = 0; i < pops.length; i++) {
      if (pops[i]._close && !(keep && pops[i].contains(keep))) { pops[i]._close(); }
    }
  }
  document.addEventListener('click', function (e) { closePops(e.target); });

  function render(box, id, data, state) {
    var mine = pick(data, 'Mine');
    var entries = pick(data, 'Entries') || [];
    var avg = pick(data, 'Average');
    var count = pick(data, 'Count') || 0;
    var myScore = mine ? pick(mine, 'Score') : 0;
    var myReview = (mine ? pick(mine, 'Review') : null) || '';
    box._stat = { avg: avg, count: count };
    setSummary(id, avg, count);
    box.textContent = '';
    box.appendChild(el('h2', null, T.title));

    // Only the saved data is ever sent; a clicked star is pending (state.pending) until "Save review".
    function shown() { return state.pending || myScore; }
    function run(promise) {
      promise.then(function (d) { state.pending = 0; render(box, id, d, state); },
        function () { if (!box.querySelector('.jr-err')) { box.appendChild(el('div', 'jr-err', T.error)); } });
    }

    // Rating row: a pill that opens a panel of ten stars
    box.appendChild(el('div', null, T.yourRating));
    var row = el('div', 'jr-row');
    var pop = el('div', 'jr-pop');
    var pill = el('button', 'jr-pill');
    pill.type = 'button';
    pill.setAttribute('aria-expanded', 'false');
    pill.setAttribute('aria-haspopup', 'true');
    var panel = el('div', 'jr-panel');
    panel.hidden = true;
    var stars = [];
    var ta = el('textarea');
    var save = el('button', 'jr-btn', T.save);
    save.type = 'button';

    function paintPill() {
      var s = shown();
      var unsaved = !!state.pending && state.pending !== myScore;
      pill.className = 'jr-pill' + (s ? '' : ' empty') + (unsaved ? ' unsaved' : '');
      pill.setAttribute('aria-label', !s ? T.rate : unsaved ? T.pendingScore(s) : T.yourScore(s));
      pill.textContent = '';
      pill.appendChild(starIcon(!s));
      if (s) {
        pill.appendChild(document.createTextNode(String(s)));
        pill.appendChild(el('small', null, '/10'));
        if (unsaved) { pill.appendChild(el('small', 'jr-unsaved', T.unsaved)); }
      } else {
        pill.appendChild(document.createTextNode(T.rate));
      }
    }
    // The button is live only when the pending score or the review text differs from what is stored.
    function paintSave() {
      var dirty = (!!state.pending && state.pending !== myScore) || ta.value !== myReview;
      save.hidden = !dirty;
      save.disabled = !dirty || !shown();
    }
    function preview(h) {
      var cur = shown();
      stars.forEach(function (b, k) {
        var on = h ? k < h : k < cur;
        b.className = 'jr-star' + (on ? (h && h !== cur ? ' peek' : ' on') : '');
      });
    }
    pop._close = function () {
      panel.hidden = true;
      pill.setAttribute('aria-expanded', 'false');
      preview(0);
    };
    for (var i = 1; i <= 10; i++) {
      (function (n) {
        var b = el('button', 'jr-star');
        b.type = 'button';
        b.setAttribute('aria-label', T.rateN(n));
        b.appendChild(starIcon());
        b.onmouseenter = b.onfocus = function () { preview(n); };
        b.onmouseleave = b.onblur = function () { preview(0); };
        // Nothing is sent here. Picking the saved score again drops the pending change.
        b.onclick = function () {
          state.pending = n === myScore ? 0 : n;
          paintPill();
          paintSave();
          preview(0);
        };
        stars.push(b);
        panel.appendChild(b);
      })(i);
    }
    pill.onclick = function () {
      var wasClosed = panel.hidden;
      closePops();
      if (wasClosed) {
        panel.hidden = false;
        pill.setAttribute('aria-expanded', 'true');
        stars[Math.max(shown(), 1) - 1].focus();
      }
    };
    pop.onkeydown = function (e) {
      if (e.key === 'Escape' && !panel.hidden) { pop._close(); pill.focus(); e.stopPropagation(); }
    };
    pop.appendChild(pill);
    pop.appendChild(panel);
    row.appendChild(pop);
    if (mine) {
      var clear = el('button', 'jr-btn', T.clear);
      clear.type = 'button';
      clear.onclick = function () { run(call('DELETE', id)); };
      row.appendChild(clear);
    }
    box.appendChild(row);

    // Review editor, always shown; the score and the review are stored together by "Save review"
    ta.placeholder = T.reviewPlaceholder;
    ta.value = myReview;
    ta.oninput = paintSave;
    save.onclick = function () { run(call('PUT', id, { score: shown(), review: ta.value })); };
    box.appendChild(ta);
    box.appendChild(save);
    paintPill();
    paintSave();
    preview(0);

    // Average
    var summary = el('div', null, avg === null || avg === undefined ? T.none :
      T.average + ': ' + (Math.round(avg * 10) / 10) + ' / 10 (' + T.ratings(count) + ')');
    summary.style.margin = '1em 0 .3em';
    box.appendChild(summary);

    // Per-user list
    entries.forEach(function (e) {
      var isMine = mine && pick(e, 'UserId') === pick(mine, 'UserId');
      var item = el('div', 'jr-entry');
      var head = el('div');
      head.appendChild(el('strong', null, (pick(e, 'UserName') || '?') + (isMine ? T.me : '')));
      head.appendChild(el('span', 'jr-score', pick(e, 'Score') + ' / 10'));
      var when = pick(e, 'UpdatedAt');
      if (when) { head.appendChild(el('span', 'jr-muted', new Date(when).toLocaleString())); }
      if (pick(e, 'Edited')) { head.appendChild(el('span', 'jr-muted', '(' + T.edited + ')')); }
      item.appendChild(head);
      var review = pick(e, 'Review');
      if (review) { item.appendChild(el('div', 'jr-review', review)); }
      box.appendChild(item);
    });
    syncBadge(box);
  }

  // Average badge in the title row, right after the community rating. The web client rebuilds that row
  // on its own, so this is idempotent and also called from sync().
  function syncBadge(box) {
    var page = box.closest('#itemDetailPage');
    var row = page && page.querySelector('.itemMiscInfo-primary');
    if (!row) { return; }
    var st = box._stat;
    var b = row.querySelector('.jr-badge');
    if (!st || !st.count || st.avg === null || st.avg === undefined) { if (b) { b.remove(); } return; }
    var avg = (Math.round(st.avg * 10) / 10).toFixed(1);
    // Anchor: the community rating, else the first item (year). Never the badge itself, or every pass
    // would see a "wrong" position, re-insert it and trigger the next pass (visible flicker).
    var anchor = row.querySelector('.starRatingContainer') || row.querySelector(':scope > .mediaInfoItem:not(.jr-badge)');
    if (b && b.getAttribute('data-v') === avg + '/' + st.count && b.previousElementSibling === anchor) { return; }
    if (b) { b.remove(); }
    b = el('div', 'mediaInfoItem jr-badge');
    b.setAttribute('data-v', avg + '/' + st.count);
    b.title = T.badgeText(avg, st.count);
    b.appendChild(starIcon(false, 'starIcon'));
    var vis = el('span', null, avg + ' ');
    vis.setAttribute('aria-hidden', 'true');
    vis.appendChild(el('small', null, '(' + st.count + ')'));
    b.appendChild(vis);
    b.appendChild(el('span', 'jr-sr', T.badgeText(avg, st.count)));
    if (anchor) { anchor.after(b); } else { row.insertBefore(b, row.firstChild); }
  }

  // ---- Badges on title cards (home rows, grids, search) ----
  // Summaries come from one bulk request per scan and are cached for a minute. The web client rebuilds
  // cards on its own, so painting is idempotent and driven by a debounced DOM observer.
  var TTL = 60000;
  var RETRY = 10000;
  var BATCH = 100; // server cap
  var summaries = {}; // id -> { avg, count, exp }
  var inflight = {};
  var cardTimer = null;

  function paintCard(card, s) {
    var host = card.querySelector('.cardScalable');
    if (!host) { return; }
    var b = host.querySelector(':scope > .jr-card');
    if (!s || !s.count || s.avg === null || s.avg === undefined) { if (b) { b.remove(); } return; }
    var avg = (Math.round(s.avg * 10) / 10).toFixed(1);
    var key = avg + '/' + s.count;
    if (b && b.getAttribute('data-v') === key) { return; }
    if (b) { b.remove(); }
    b = el('div', 'jr-card');
    b.setAttribute('data-v', key);
    b.title = T.badgeText(avg, s.count);
    b.appendChild(starIcon());
    var vis = el('span', null, avg + ' ');
    vis.setAttribute('aria-hidden', 'true');
    vis.appendChild(el('small', null, '(' + s.count + ')'));
    b.appendChild(vis);
    b.appendChild(el('span', 'jr-sr', T.badgeText(avg, s.count)));
    host.appendChild(b);
  }

  // Called with fresh data (e.g. after rating on the detail page): update the cache and any cards in the DOM.
  function setSummary(id, avg, count) {
    summaries[id] = { avg: avg, count: count, exp: Date.now() + TTL };
    var cards = document.querySelectorAll('.card[data-id="' + id + '"]');
    for (var i = 0; i < cards.length; i++) { paintCard(cards[i], summaries[id]); }
  }

  function fetchSummaries(ids) {
    ids.forEach(function (id) { inflight[id] = true; });
    window.ApiClient.ajax({ type: 'GET', url: window.ApiClient.getUrl('JellyRate/Summaries', { ids: ids.join(',') }), dataType: 'json' })
      .then(function (data) {
        data = data || {};
        ids.forEach(function (id) {
          var s = data[id];
          setSummary(id, s ? pick(s, 'Average') : null, s ? pick(s, 'Count') : 0);
        });
      }, function () {
        ids.forEach(function (id) {
          var old = summaries[id];
          summaries[id] = { avg: old ? old.avg : null, count: old ? old.count : 0, exp: Date.now() + RETRY };
        });
      })
      .then(function () { ids.forEach(function (id) { delete inflight[id]; }); });
  }

  function scanCards() {
    if (!window.ApiClient || document.hidden) { return; }
    var cards = document.querySelectorAll('.card[data-type="Movie"],.card[data-type="Series"]');
    var now = Date.now();
    var need = [];
    var seen = {};
    for (var i = 0; i < cards.length; i++) {
      var id = cards[i].getAttribute('data-id');
      if (!id) { continue; }
      id = id.replace(/-/g, '').toLowerCase();
      var s = summaries[id];
      if (s) { paintCard(cards[i], s); } // stale data is shown while refreshing: no flicker
      if ((!s || s.exp <= now) && !inflight[id] && !seen[id]) { seen[id] = true; need.push(id); }
    }
    for (var j = 0; j < need.length; j += BATCH) { fetchSummaries(need.slice(j, j + BATCH)); }
  }

  function cardLater() { clearTimeout(cardTimer); cardTimer = setTimeout(scanCards, 60); }

  // Only react to mutations that can add cards, not to our own badges.
  function onMutations(list) {
    for (var i = 0; i < list.length; i++) {
      var added = list[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType === 1 && !(n.classList && n.classList.contains('jr-card'))) { cardLater(); return; }
      }
    }
  }

  var pending = null;
  var force = false; // set on navigation events: refetch even if the same item is shown (cached views)

  function sync() {
    var m = /[?&]id=([0-9a-fA-F-]{32,36})/.exec(location.hash);
    var isDetails = m && /details/.test(location.hash);
    var pages = document.querySelectorAll('#itemDetailPage');
    var page = null;
    for (var i = 0; i < pages.length; i++) {
      if (!pages[i].classList.contains('hide')) { page = pages[i]; }
    }
    var old = document.querySelectorAll('.jellyrate');
    if (!isDetails || !page || !window.ApiClient) {
      // Left the detail page: drop stale sections.
      for (var j = 0; j < old.length; j++) { if (!page || !page.contains(old[j])) { old[j].remove(); } }
      return;
    }
    var id = m[1].replace(/-/g, '').toLowerCase();
    var cur = page.querySelector('.jellyrate');
    if (cur && cur.getAttribute('data-id') === id && !force) { syncBadge(cur); return; }
    force = false;
    if (cur && cur.getAttribute('data-id') !== id) {
      cur.remove();
      var stale0 = page.querySelector('.jr-badge');
      if (stale0) { stale0.remove(); }
    }
    if (pending === id) { return; }
    pending = id;
    call('GET', id).then(function (data) {
      pending = null;
      // The user may have navigated away meanwhile.
      var now = /[?&]id=([0-9a-fA-F-]{32,36})/.exec(location.hash);
      if (!now || now[1].replace(/-/g, '').toLowerCase() !== id) { return; }
      var stale = page.querySelector('.jellyrate');
      if (stale) { stale.remove(); }
      var box = el('div', 'jellyrate');
      box.setAttribute('data-id', id);
      render(box, id, data, { pending: 0 });
      var host = page.querySelector('.detailPageSecondaryContainer') || page;
      host.insertBefore(box, host.firstChild);
      syncBadge(box);
    }, function () { pending = null; /* 404: not a movie/series or not visible */ });
  }

  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  var timer = null;
  function later(f) { if (f === true) { force = true; } clearTimeout(timer); timer = setTimeout(sync, 150); }
  window.addEventListener('hashchange', function () { later(true); });
  document.addEventListener('viewshow', function () { later(true); });
  // The detail page is built asynchronously, so also watch DOM changes.
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', cardLater);
  later();
  cardLater();
})();
