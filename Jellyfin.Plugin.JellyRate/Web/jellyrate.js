/* JellyRate: rating section on the movie/series detail page. Plain JS, no build step. */
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
    rate: 'Rate',
    rateN: function (n) { return 'Rate ' + n + ' out of 10'; },
    yourScore: function (n) { return 'Your rating: ' + n + ' out of 10. Change rating'; },
    reviewPlaceholder: 'Write a review (optional)',
    save: 'Save review',
    edit: 'Edit review',
    cancel: 'Cancel',
    edited: 'edited',
    average: 'Average',
    ratings: function (n) { return n === 1 ? '1 rating' : n + ' ratings'; },
    none: 'No ratings yet.',
    error: 'JellyRate request failed.',
    me: ' (you)'
  };

  var CSS =
    '.jellyrate{padding:0 3.3%;margin:1.5em 0;max-width:60em}' +
    '.jellyrate h2{margin:0 0 .5em}' +
    '.jellyrate .jr-row{display:flex;flex-wrap:wrap;align-items:center;gap:.3em;margin:.4em 0}' +
    '.jellyrate .jr-pop{position:relative;display:inline-block}' +
    '.jellyrate .jr-pill{display:inline-flex;align-items:center;gap:.5em;background:rgba(128,128,128,.25);color:inherit;border:0;border-radius:99em;padding:.55em 1.1em .55em .8em;font:inherit;font-weight:600;cursor:pointer}' +
    '.jellyrate .jr-pill small{font-weight:400;opacity:.7}' +
    '.jellyrate .jr-pill svg{width:1.3em;height:1.3em;fill:url(#jellyrate-grad)}' +
    '.jellyrate .jr-pill.empty svg{fill:none;stroke:currentColor;stroke-width:1.6;opacity:.7}' +
    '.jellyrate .jr-panel{position:absolute;z-index:5;left:0;top:100%;margin-top:.5em;display:flex;gap:2px;padding:.5em .6em;background:#202020;border:1px solid rgba(128,128,128,.4);border-radius:.5em;box-shadow:0 4px 16px rgba(0,0,0,.5)}' +
    '.jellyrate .jr-panel[hidden]{display:none}' +
    '.jellyrate .jr-star{background:none;border:0;padding:0;cursor:pointer;width:clamp(22px,7vw,30px);height:clamp(22px,7vw,30px);border-radius:.2em}' +
    '.jellyrate .jr-star svg{width:100%;height:100%;display:block;fill:rgba(128,128,128,.35);transition:fill .1s}' +
    '.jellyrate .jr-star.on svg,.jellyrate .jr-star.peek svg{fill:url(#jellyrate-grad)}' +
    '.jellyrate .jr-star.peek svg{opacity:.65}' +
    '.jellyrate .jr-pill:focus-visible,.jellyrate .jr-star:focus-visible{outline:2px solid #9b5cf6;outline-offset:2px}' +
    '.jellyrate .jr-btn{background:rgba(128,128,128,.25);color:inherit;border:0;border-radius:.3em;padding:.5em 1em;cursor:pointer;font:inherit}' +
    '.jellyrate textarea{width:100%;min-height:5em;box-sizing:border-box;margin:.4em 0;padding:.6em;background:rgba(128,128,128,.15);color:inherit;border:1px solid rgba(128,128,128,.5);border-radius:.3em;font:inherit}' +
    '.jellyrate .jr-entry{padding:.7em 0;border-top:1px solid rgba(128,128,128,.3)}' +
    '.jellyrate .jr-score{font-weight:bold;margin-left:.6em}' +
    '.jellyrate .jr-review{white-space:pre-wrap;margin:.3em 0}' +
    '.jellyrate .jr-muted{opacity:.7;font-size:.9em;margin-left:.6em}' +
    '.jellyrate .jr-err{color:#e55}';

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

  var SVGNS = 'http://www.w3.org/2000/svg';

  function starSvg() {
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z');
    p.setAttribute('stroke-linejoin', 'round');
    s.appendChild(p);
    return s;
  }

  // One gradient (purple with a hint of blue) shared by all stars.
  function ensureGradient() {
    if (document.getElementById('jellyrate-grad')) { return; }
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
    var g = document.createElementNS(SVGNS, 'linearGradient');
    g.id = 'jellyrate-grad';
    g.setAttribute('x1', '0'); g.setAttribute('y1', '0'); g.setAttribute('x2', '1'); g.setAttribute('y2', '1');
    [['0', '#9b5cf6'], ['0.55', '#8a63f0'], ['1', '#4f8cf5']].forEach(function (c) {
      var st = document.createElementNS(SVGNS, 'stop');
      st.setAttribute('offset', c[0]); st.setAttribute('stop-color', c[1]);
      g.appendChild(st);
    });
    s.appendChild(g);
    document.body.appendChild(s);
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
    var myReview = mine ? pick(mine, 'Review') : null;
    box.textContent = '';
    box.appendChild(el('h2', null, T.title));

    function run(promise) {
      promise.then(function (d) { state.editing = false; render(box, id, d, state); },
        function () { box.appendChild(el('div', 'jr-err', T.error)); });
    }

    // Rating row: a pill that opens a panel of ten stars
    box.appendChild(el('div', null, T.yourRating));
    var row = el('div', 'jr-row');
    var pop = el('div', 'jr-pop');
    var pill = el('button', 'jr-pill' + (myScore ? '' : ' empty'));
    pill.type = 'button';
    pill.setAttribute('aria-expanded', 'false');
    pill.setAttribute('aria-haspopup', 'true');
    pill.setAttribute('aria-label', myScore ? T.yourScore(myScore) : T.rate);
    pill.appendChild(starSvg());
    if (myScore) {
      pill.appendChild(document.createTextNode(String(myScore)));
      pill.appendChild(el('small', null, '/10'));
    } else {
      pill.appendChild(document.createTextNode(T.rate));
    }
    var panel = el('div', 'jr-panel');
    panel.hidden = true;
    var stars = [];
    function preview(h) {
      stars.forEach(function (b, k) {
        var on = h ? k < h : k < myScore;
        b.className = 'jr-star' + (on ? (h && h !== myScore ? ' peek' : ' on') : '');
      });
    }
    pop._close = function () {
      panel.hidden = true;
      pill.setAttribute('aria-expanded', 'false');
      preview(0);
    };
    for (var i = 1; i <= 10; i++) {
      (function (n) {
        var b = el('button', 'jr-star' + (n <= myScore ? ' on' : ''));
        b.type = 'button';
        b.setAttribute('aria-label', T.rateN(n));
        b.appendChild(starSvg());
        b.onmouseenter = b.onfocus = function () { preview(n); };
        b.onmouseleave = b.onblur = function () { preview(0); };
        // Keep the review that is being typed, if any. Clicking the current score removes the rating.
        b.onclick = function () {
          var ta = box.querySelector('textarea');
          run(n === myScore ? call('DELETE', id) : call('PUT', id, { score: n, review: ta ? ta.value : myReview }));
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
        stars[Math.max(myScore, 1) - 1].focus();
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

    // Review editor (only once a score exists; the API stores the review with the score)
    if (mine) {
      if (state.editing || !myReview) {
        var ta = el('textarea');
        ta.placeholder = T.reviewPlaceholder;
        ta.value = myReview || '';
        var save = el('button', 'jr-btn', T.save);
        save.type = 'button';
        save.onclick = function () { run(call('PUT', id, { score: myScore, review: ta.value })); };
        box.appendChild(ta);
        box.appendChild(save);
        if (state.editing && myReview) {
          var cancel = el('button', 'jr-btn', T.cancel);
          cancel.type = 'button';
          cancel.style.marginLeft = '.5em';
          cancel.onclick = function () { state.editing = false; render(box, id, data, state); };
          box.appendChild(cancel);
        }
      }
    }

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
      if (isMine && review && !state.editing) {
        var edit = el('button', 'jr-btn', T.edit);
        edit.type = 'button';
        edit.onclick = function () { state.editing = true; render(box, id, data, state); };
        item.appendChild(edit);
      }
      box.appendChild(item);
    });
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
    if (cur && cur.getAttribute('data-id') === id && !force) { return; }
    force = false;
    if (cur && cur.getAttribute('data-id') !== id) { cur.remove(); }
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
      render(box, id, data, { editing: false });
      var host = page.querySelector('.detailPageSecondaryContainer') || page;
      host.insertBefore(box, host.firstChild);
    }, function () { pending = null; /* 404: not a movie/series or not visible */ });
  }

  ensureGradient();
  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  var timer = null;
  function later(f) { if (f === true) { force = true; } clearTimeout(timer); timer = setTimeout(sync, 150); }
  window.addEventListener('hashchange', function () { later(true); });
  document.addEventListener('viewshow', function () { later(true); });
  // The detail page is built asynchronously, so also watch DOM changes.
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  later();
})();
