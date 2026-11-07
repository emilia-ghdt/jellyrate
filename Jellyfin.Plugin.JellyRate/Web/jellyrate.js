/*
 * JellyRate browser script. Runs in every user's browser inside the Jellyfin web client, loaded by the
 * <script src="../JellyRate/ui.js" defer> tag the server adds to index.html. Plain ES5, no build step,
 * no dependencies.
 *
 * Network: only these four calls, all to the same Jellyfin server through the web client's own
 * window.ApiClient (which adds the logged-in user's auth header):
 *   GET    JellyRate/Items/{id}           when a movie/series detail page opens
 *   PUT    JellyRate/Items/{id}           "Save review", body { score, review }
 *   DELETE JellyRate/Items/{id}           "Remove rating"
 *   GET    JellyRate/Summaries?ids=a,b    card badges; at most 100 ids per call, cached for 60 s
 * Nothing else: no third-party URLs, no cookies or localStorage.
 *
 * DOM: never uses innerHTML; all text (including user names and reviews) is set with textContent.
 * It adds one <style> to <head>, the rating section (.jellyrate) at the top of the detail page's
 * .detailPageSecondaryContainer, an average badge (.jr-badge) in the detail page's .itemMiscInfo-primary
 * row, and a badge (.jr-card) inside each movie/series card's .cardScalable.
 *
 * Sections: 1 strings, 2 styles, 3 helpers, 4 API calls, 5 rating section, 6 badges (detail + cards),
 * 7 detail page sync, 8 boot.
 */
(function () {
  'use strict';
  if (window.__jellyrate) { return; } // run once, even if the tag ends up in the page twice
  window.__jellyrate = true;

  // ---- 1. Strings: every user-visible text ----
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

  // ---- 2. Styles: one rule per line, joined into a single <style> ----
  var CSS = [
    // Rating section
    '.jellyrate{padding:0 3.3%;margin:1.5em 0;max-width:60em}',
    '.jellyrate h2{margin:0 0 .5em}',
    '.jellyrate .jr-row{display:flex;flex-wrap:wrap;align-items:center;gap:.3em;margin:.4em 0}',
    '.jellyrate .jr-btn{background:rgba(128,128,128,.25);color:inherit;border:0;border-radius:.3em;padding:.5em 1em;cursor:pointer;font:inherit}',
    '.jellyrate .jr-btn[hidden]{display:none}',
    '.jellyrate textarea{width:100%;min-height:5em;box-sizing:border-box;margin:.4em 0;padding:.6em;background:rgba(128,128,128,.15);color:inherit;border:1px solid rgba(128,128,128,.5);border-radius:.3em;font:inherit}',
    '.jellyrate .jr-avg{margin:1em 0 .3em}',
    '.jellyrate .jr-entry{padding:.7em 0;border-top:1px solid rgba(128,128,128,.3)}',
    '.jellyrate .jr-score{font-weight:bold;margin-left:.6em}',
    '.jellyrate .jr-review{white-space:pre-wrap;margin:.3em 0}',
    '.jellyrate .jr-muted{opacity:.7;font-size:.9em;margin-left:.6em}',
    '.jellyrate .jr-err{color:#e55}',
    // Picker: a pill button that opens a panel of ten star buttons
    '.jellyrate .jr-pop{position:relative;display:inline-block}',
    '.jellyrate .jr-pill{display:inline-flex;align-items:center;gap:.5em;background:rgba(128,128,128,.25);color:inherit;border:0;border-radius:99em;padding:.55em 1.1em .55em .8em;font:inherit;font-weight:600;cursor:pointer}',
    '.jellyrate .jr-pill small{font-weight:400;opacity:.7}',
    '.jellyrate .jr-pill.empty .jr-ico{opacity:.7}',
    '.jellyrate .jr-pill.unsaved{outline:1px dashed #9b5cf6;outline-offset:-1px}',
    '.jellyrate .jr-pill .jr-unsaved{font-style:italic;opacity:.8}',
    '.jellyrate .jr-panel{position:absolute;z-index:5;left:0;top:100%;margin-top:.5em;display:flex;gap:2px;padding:.5em .6em;background:#202020;border:1px solid rgba(128,128,128,.4);border-radius:.5em;box-shadow:0 4px 16px rgba(0,0,0,.5)}',
    '.jellyrate .jr-panel[hidden]{display:none}',
    '.jellyrate .jr-star{background:none;border:0;padding:0;cursor:pointer;width:clamp(22px,7vw,30px);height:clamp(22px,7vw,30px);border-radius:.2em}',
    '.jellyrate .jr-star .jr-ico{display:block;font-size:clamp(22px,7vw,30px);color:rgba(128,128,128,.35);background:none;-webkit-text-fill-color:currentColor}',
    '.jellyrate .jr-star.on .jr-ico,.jellyrate .jr-star.peek .jr-ico{background:var(--jr-grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}',
    '.jellyrate .jr-star.peek .jr-ico{opacity:.65}',
    '.jellyrate .jr-pill:focus-visible,.jellyrate .jr-star:focus-visible{outline:2px solid #9b5cf6;outline-offset:2px}',
    // Star glyph: the web client's own icon font (like the community rating star), so it follows the theme
    // (Material Icons, or ElegantFin's Material Symbols), filled with a purple-blue gradient. .jr-out is the
    // outlined variant. The doubled class beats the theme's .starIcon rules, which the detail badge also gets.
    '.jr-ico.jr-ico{--jr-grad:linear-gradient(90deg,#4f8cf5,#7a6af3 35%,#9b5cf6 75%);font-size:1.4em;line-height:1;color:inherit;background:var(--jr-grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;flex:none}',
    '.jr-ico.jr-out{background:none;-webkit-text-fill-color:currentColor;font-variation-settings:"FILL" 0,"wght" 400,"GRAD" 0,"opsz" 30}',
    // Badges: detail page row and title cards
    '.jr-badge{display:inline-flex;align-items:center;gap:0}',
    '.jr-badge small{font-size:inherit;opacity:.7}',
    '.jr-card{position:absolute;z-index:2;top:.4em;left:.4em;display:inline-flex;align-items:center;gap:.25em;padding:.15em .5em .15em .35em;border-radius:99em;background:rgba(0,0,0,.72);color:#fff;font-size:.85em;font-weight:600;line-height:1.3;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.4)}',
    '.jr-card small{font-size:inherit;font-weight:400;opacity:.75}',
    // Screen-reader-only text
    '.jr-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}'
  ].join('');

  // ---- 3. Helpers ----
  // Jellyfin may serialize the response in PascalCase or camelCase.
  function pick(o, name) {
    if (!o) { return undefined; }
    var v = o[name.charAt(0).toLowerCase() + name.slice(1)];
    return v !== undefined ? v : o[name];
  }

  // The only way this script creates elements: text always goes through textContent, never innerHTML.
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
  }

  // A star glyph from the web client's icon font; `outline` is the unrated variant.
  function starIcon(outline, cls) {
    var s = el('span', 'material-icons jr-ico' + (cls ? ' ' + cls : '') + (outline ? ' jr-out' : ''), outline ? 'star_border' : 'star');
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  // Item IDs are compared in the server's "N" format: 32 lowercase hex digits.
  function normalizeId(id) { return id.replace(/-/g, '').toLowerCase(); }

  // The item ID in the URL hash (#/details?id=...), or null.
  function hashItemId() {
    var m = /[?&]id=([0-9a-fA-F-]{32,36})/.exec(location.hash);
    return m ? normalizeId(m[1]) : null;
  }

  function hasRatings(s) { return !!s && !!s.count && s.avg !== null && s.avg !== undefined; }

  // ---- 4. API calls: the only network requests (see the header) ----
  function api(type, path, query, body) {
    var opts = { type: type, url: window.ApiClient.getUrl(path, query), dataType: 'json' };
    if (body) { opts.data = JSON.stringify(body); opts.contentType = 'application/json'; }
    return window.ApiClient.ajax(opts);
  }
  function getRatings(id) { return api('GET', 'JellyRate/Items/' + id); }
  function saveRating(id, score, review) { return api('PUT', 'JellyRate/Items/' + id, null, { score: score, review: review }); }
  function removeRating(id) { return api('DELETE', 'JellyRate/Items/' + id); }
  function getSummaries(ids) { return api('GET', 'JellyRate/Summaries', { ids: ids.join(',') }); }

  // ---- 5. Rating section on the detail page ----
  // Rebuilt from scratch from every server response.
  function renderSection(box, id, data, state) {
    var mine = pick(data, 'Mine');
    var avg = pick(data, 'Average');
    var count = pick(data, 'Count') || 0;
    box._stat = { avg: avg, count: count };
    setSummary(id, avg, count); // keep card badges in step
    box.textContent = '';
    box.appendChild(el('h2', null, T.title));
    renderEditor(box, id, mine, state);
    box.appendChild(el('div', 'jr-avg', avg === null || avg === undefined ? T.none :
      T.average + ': ' + (Math.round(avg * 10) / 10) + ' / 10 (' + T.ratings(count) + ')'));
    (pick(data, 'Entries') || []).forEach(function (e) { box.appendChild(entryRow(e, mine)); });
    syncDetailBadge(box);
  }

  // Score picker + review editor. A clicked star is only pending (state.pending, survives re-renders)
  // until "Save review" sends score and review together; star clicks send nothing.
  function renderEditor(box, id, mine, state) {
    var myScore = mine ? pick(mine, 'Score') : 0;
    var myReview = (mine ? pick(mine, 'Review') : null) || '';
    var pop = el('div', 'jr-pop');
    var pill = el('button', 'jr-pill');
    var panel = el('div', 'jr-panel');
    var stars = [];
    var ta = el('textarea');
    var save = el('button', 'jr-btn', T.save);

    function shown() { return state.pending || myScore; }
    function run(promise) {
      promise.then(function (d) { state.pending = 0; renderSection(box, id, d, state); },
        function () { if (!box.querySelector('.jr-err')) { box.appendChild(el('div', 'jr-err', T.error)); } });
    }
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
    // The save button is live only when the pending score or the review text differs from what is stored.
    function paintSave() {
      var dirty = (!!state.pending && state.pending !== myScore) || ta.value !== myReview;
      save.hidden = !dirty;
      save.disabled = !dirty || !shown();
    }
    // Light up stars up to the hovered/focused one (h), else up to the shown score.
    function preview(h) {
      var cur = shown();
      stars.forEach(function (b, k) {
        var on = h ? k < h : k < cur;
        b.className = 'jr-star' + (on ? (h && h !== cur ? ' peek' : ' on') : '');
      });
    }
    function starButton(n) {
      var b = el('button', 'jr-star');
      b.type = 'button';
      b.setAttribute('aria-label', T.rateN(n));
      b.appendChild(starIcon());
      b.onmouseenter = b.onfocus = function () { preview(n); };
      b.onmouseleave = b.onblur = function () { preview(0); };
      // Picking the saved score again drops the pending change.
      b.onclick = function () {
        state.pending = n === myScore ? 0 : n;
        paintPill();
        paintSave();
        preview(0);
      };
      return b;
    }

    pill.type = 'button';
    pill.setAttribute('aria-expanded', 'false');
    pill.setAttribute('aria-haspopup', 'true');
    panel.hidden = true;
    for (var n = 1; n <= 10; n++) {
      stars.push(starButton(n));
      panel.appendChild(stars[n - 1]);
    }
    pop._close = function () { // also called by closePops()
      panel.hidden = true;
      pill.setAttribute('aria-expanded', 'false');
      preview(0);
    };
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

    box.appendChild(el('div', null, T.yourRating));
    var row = el('div', 'jr-row');
    row.appendChild(pop);
    if (mine) {
      var clear = el('button', 'jr-btn', T.clear);
      clear.type = 'button';
      clear.onclick = function () { run(removeRating(id)); };
      row.appendChild(clear);
    }
    box.appendChild(row);

    ta.placeholder = T.reviewPlaceholder;
    ta.value = myReview;
    ta.oninput = paintSave;
    save.type = 'button';
    save.onclick = function () { run(saveRating(id, shown(), ta.value)); };
    box.appendChild(ta);
    box.appendChild(save);
    paintPill();
    paintSave();
    preview(0);
  }

  // One user's entry in the list. User name and review are user-supplied: textContent only (via el).
  function entryRow(e, mine) {
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
    return item;
  }

  // Close every open star panel except the one containing `keep`.
  function closePops(keep) {
    var pops = document.querySelectorAll('.jellyrate .jr-pop');
    for (var i = 0; i < pops.length; i++) {
      if (pops[i]._close && !(keep && pops[i].contains(keep))) { pops[i]._close(); }
    }
  }

  // ---- 6. Badges "★ 7.8 (3)": detail page and title cards ----
  // The web client rebuilds both on its own, so painting is idempotent: data-v holds what is shown, and a
  // badge is only replaced when that changes.
  function badgeKey(s) { return (Math.round(s.avg * 10) / 10).toFixed(1) + '/' + s.count; }

  function fillBadge(b, s, starCls) {
    var avg = (Math.round(s.avg * 10) / 10).toFixed(1);
    b.setAttribute('data-v', badgeKey(s));
    b.title = T.badgeText(avg, s.count);
    b.appendChild(starIcon(false, starCls));
    var vis = el('span', null, avg + ' ');
    vis.setAttribute('aria-hidden', 'true');
    vis.appendChild(el('small', null, '(' + s.count + ')'));
    b.appendChild(vis);
    b.appendChild(el('span', 'jr-sr', T.badgeText(avg, s.count)));
    return b;
  }

  // Detail page: right after the community rating in the title row. Also called from sync().
  function syncDetailBadge(box) {
    var page = box.closest('#itemDetailPage');
    var row = page && page.querySelector('.itemMiscInfo-primary');
    if (!row) { return; }
    var b = row.querySelector('.jr-badge');
    if (!hasRatings(box._stat)) { if (b) { b.remove(); } return; }
    // Anchor: the community rating, else the first item (year). Never the badge itself, or every pass
    // would see a "wrong" position, re-insert it and trigger the next pass (visible flicker).
    var anchor = row.querySelector('.starRatingContainer') || row.querySelector(':scope > .mediaInfoItem:not(.jr-badge)');
    if (b && b.getAttribute('data-v') === badgeKey(box._stat) && b.previousElementSibling === anchor) { return; }
    if (b) { b.remove(); }
    b = fillBadge(el('div', 'mediaInfoItem jr-badge'), box._stat, 'starIcon');
    if (anchor) { anchor.after(b); } else { row.insertBefore(b, row.firstChild); }
  }

  // Cards (home rows, grids, search): one bulk request per scan, results cached for TTL.
  var TTL = 60000;
  var RETRY = 10000; // after a failed request
  var BATCH = 100; // server cap
  var summaries = {}; // id -> { avg, count, exp }
  var inflight = {};
  var cardTimer = null;

  function paintCard(card, s) {
    var host = card.querySelector('.cardScalable');
    if (!host) { return; }
    var b = host.querySelector(':scope > .jr-card');
    if (!hasRatings(s)) { if (b) { b.remove(); } return; }
    if (b && b.getAttribute('data-v') === badgeKey(s)) { return; }
    if (b) { b.remove(); }
    host.appendChild(fillBadge(el('div', 'jr-card'), s));
  }

  // Fresh data (bulk response, or the detail page after rating): update the cache and the cards in the DOM.
  function setSummary(id, avg, count) {
    summaries[id] = { avg: avg, count: count, exp: Date.now() + TTL };
    var cards = document.querySelectorAll('.card[data-id="' + id + '"]');
    for (var i = 0; i < cards.length; i++) { paintCard(cards[i], summaries[id]); }
  }

  function fetchSummaries(ids) {
    ids.forEach(function (id) { inflight[id] = true; });
    getSummaries(ids)
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
      id = normalizeId(id);
      var s = summaries[id];
      if (s) { paintCard(cards[i], s); } // stale data is shown while refreshing: no flicker
      if ((!s || s.exp <= now) && !inflight[id] && !seen[id]) { seen[id] = true; need.push(id); }
    }
    for (var j = 0; j < need.length; j += BATCH) { fetchSummaries(need.slice(j, j + BATCH)); }
  }

  function scheduleCardScan() { clearTimeout(cardTimer); cardTimer = setTimeout(scanCards, 60); }

  // Only react to mutations that can add cards, not to our own badges.
  function onCardMutations(list) {
    for (var i = 0; i < list.length; i++) {
      var added = list[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType === 1 && !(n.classList && n.classList.contains('jr-card'))) { scheduleCardScan(); return; }
      }
    }
  }

  // ---- 7. Detail page sync: attach the section to the visible movie/series page ----
  var loadingId = null; // item whose GET is in flight
  var force = false; // set on navigation: refetch even if the same item is still shown (cached views)

  function sync() {
    var id = hashItemId();
    var isDetails = id && /details/.test(location.hash);
    // The web client keeps earlier pages in the DOM, hidden with .hide; use the visible one.
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
    var cur = page.querySelector('.jellyrate');
    if (cur && cur.getAttribute('data-id') === id && !force) { syncDetailBadge(cur); return; }
    force = false;
    if (cur && cur.getAttribute('data-id') !== id) {
      cur.remove();
      var oldBadge = page.querySelector('.jr-badge');
      if (oldBadge) { oldBadge.remove(); }
    }
    if (loadingId === id) { return; }
    loadingId = id;
    getRatings(id).then(function (data) {
      loadingId = null;
      if (hashItemId() !== id) { return; } // navigated away meanwhile
      var stale = page.querySelector('.jellyrate');
      if (stale) { stale.remove(); }
      var box = el('div', 'jellyrate');
      box.setAttribute('data-id', id);
      renderSection(box, id, data, { pending: 0 });
      var host = page.querySelector('.detailPageSecondaryContainer') || page;
      host.insertBefore(box, host.firstChild);
      syncDetailBadge(box);
    }, function () { loadingId = null; /* 404: not a movie/series, or not visible to this user */ });
  }

  // ---- 8. Boot ----
  document.head.appendChild(el('style', null, CSS));
  document.addEventListener('click', function (e) { closePops(e.target); });

  var syncTimer = null;
  function scheduleSync(navigated) {
    if (navigated) { force = true; }
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, 150);
  }
  window.addEventListener('hashchange', function () { scheduleSync(true); });
  document.addEventListener('viewshow', function () { scheduleSync(true); });
  document.addEventListener('visibilitychange', scheduleCardScan);
  // The web client builds pages and cards asynchronously and rebuilds them on its own: watch the DOM.
  new MutationObserver(function (list) {
    scheduleSync(false);
    onCardMutations(list);
  }).observe(document.body, { childList: true, subtree: true });
  scheduleSync(false);
  scheduleCardScan();
})();
