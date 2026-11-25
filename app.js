(function () {
  'use strict';
  var S = window.SURVEY, L = window.SurveyLogic, CFG = window.SURVEY_CONFIG || {};
  var URL_ = (CFG.SCRIPT_URL || '').trim();
  var STORE = 'survey_state_' + S.version, TEXTS = 'survey_texts_' + S.version;
  var app = document.getElementById('app');
  var params = new URLSearchParams(location.search);

  var defaults = {};
  L.textItems(S).forEach(function (it) { defaults[it.key] = it.obj[it.prop]; });

  var st = { A: {}, page: -1, t0: Date.now(), rid: newId(), key: '' };
  var showErr = false, sending = false, sendError = '';

  function newId() {
    var b = new Uint8Array(12);
    crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경은 무시 */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } }
  function save() { lsSet(STORE, st); }

  function post(body) {
    return fetch(URL_, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  // ---------- 응답 화면: 한 화면에 한 문항 ----------
  function pages() {
    var out = [];
    S.sections.forEach(function (sec) {
      if (!L.sectionVisible(sec, st.A)) return;
      var first = true;
      sec.questions.forEach(function (q) {
        if (!L.qVisible(q, st.A)) return;
        out.push({ sec: sec, q: q, first: first });
        first = false;
      });
    });
    return out;
  }

  function figure(img, cap) {
    if (!img || !CFG.SHOW_IMAGES) return '';
    var list = Array.isArray(img) ? img : [img];
    return list.map(function (f, i) {
      var c = cap && i === list.length - 1 ? '<figcaption>' + esc(cap) + '</figcaption>' : '';
      return '<figure class="fig"><img src="images/' + esc(f) + '" alt="' + esc(cap || '참고 그림') +
        '" onerror="this.parentNode.remove()">' + c + '</figure>';
    }).join('');
  }

  function optHtml(type, q, o, checked, disabled, row) {
    var name = row === undefined ? q.id : q.id + '__' + row;
    return '<label class="opt' + (checked ? ' on' : '') + (disabled ? ' off' : '') + '">' +
      '<input type="' + type + '" name="' + name + '" value="' + o.c + '" data-q="' + q.id + '"' +
      (row === undefined ? '' : ' data-r="' + row + '"') +
      (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span>' + esc(o.t) + '</span></label>';
  }

  function ruleText(q) {
    if (q.type === 'multi') return q.max ? '최대 ' + q.max + '개 선택' : '해당하는 것 모두 선택';
    return q.type === 'single' ? '한 개 선택' : '항목마다 한 개 선택';
  }

  function answerHtml(q) {
    var A = st.A;
    if (q.type === 'single') {
      var sv = L.singleValue(q, A);
      return '<div class="opts">' + L.options(q, A).map(function (o) {
        return optHtml('radio', q, o, sv === o.c, false);
      }).join('') + '</div>';
    }
    if (q.type === 'multi') {
      var mv = L.multiValue(q, A);
      var exOn = L.options(q, A).some(function (o) { return o.ex && mv.indexOf(o.c) >= 0; });
      var full = q.max && !exOn && mv.length >= q.max;
      return '<div class="opts">' + L.options(q, A).map(function (o) {
        var on = mv.indexOf(o.c) >= 0;
        var s = optHtml('checkbox', q, o, on, full && !on && !o.ex);
        if (o.other && on) {
          s += '<input class="etc" type="text" maxlength="200" placeholder="내용을 적어 주세요(선택)" data-q="' +
            q.id + '" data-etc="1" value="' + esc(A[q.id + '_etc'] || '') + '">';
        }
        return s;
      }).join('') + '</div>';
    }
    var gv = A[q.id] || {};
    return L.rows(q, A).map(function (r) {
      return '<div class="row' + (showErr && !gv[r.c] ? ' missing' : '') + '"><div class="row-title">' + esc(r.t) + '</div>' +
        '<div class="chips' + (q.cols.length % 3 === 0 ? ' c3' : '') + '">' + q.cols.map(function (c) {
          return optHtml('radio', q, c, gv[r.c] === c.c, false, r.c);
        }).join('') + '</div></div>';
    }).join('');
  }

  function render() {
    var ps = pages(), h = '';
    if (st.page >= ps.length) st.page = ps.length - 1;

    if (st.page < 0) {
      app.innerHTML = '<div class="wrap"><div class="panel"><h1>' + esc(S.intro.title) + '</h1><p>' + esc(S.intro.body) + '</p>' +
        (URL_ ? '' : '<p class="note">미리보기 상태입니다. 응답은 저장되지 않습니다.</p>') +
        '<button class="btn" data-act="start">시작하기</button></div></div>';
      return;
    }
    var p = ps[st.page], q = p.q, last = st.page === ps.length - 1;
    var bad = showErr && !L.answered(q, st.A);
    h += '<header class="head"><div class="head-sec">' + esc(p.sec.title) + '</div>' +
      '<h2 class="q-title">' + esc(q.title) + '</h2>' +
      '<div class="head-meta"><span class="q-rule">' + ruleText(q) + '</span>' +
      '<span class="count"><b>' + (st.page + 1) + '</b> / ' + ps.length + '</span></div></header>' +
      '<div class="bar"><i style="width:' + ((st.page + 1) / ps.length * 100).toFixed(1) + '%"></i></div>';
    h += '<div class="body">';
    if (p.first && (p.sec.desc || p.sec.img)) {
      h += '<div class="sec-desc">' + (p.sec.desc ? '<p>' + esc(p.sec.desc) + '</p>' : '') + '</div>' + figure(p.sec.img);
    }
    if (bad) h += '<p class="q-err">' + (q.type === 'grid' ? '모든 항목에 답해 주세요.' : '답을 골라 주세요.') + '</p>';
    if (q.help) h += '<p class="q-help">' + esc(q.help).replace(/\n/g, '<br>') + '</p>';
    h += figure(q.img, q.cap) + answerHtml(q);
    if (sendError) h += '<p class="note">' + esc(sendError) + '</p>';
    h += '<button class="link" data-act="reset">처음부터 다시 하기</button></div>';
    h += '<div class="nav"><div class="nav-in"><button class="btn ghost" data-act="prev">이전</button>' +
      '<button class="btn" data-act="' + (last ? 'submit' : 'next') + '"' + (sending ? ' disabled' : '') + '>' +
      (last ? (sending ? '보내는 중…' : '제출하기') : '다음') + '</button></div></div>';
    app.innerHTML = h;
  }
  function rerender() { var y = window.scrollY; render(); window.scrollTo(0, y); }
  function go(p) { st.page = p; showErr = false; sendError = ''; save(); render(); window.scrollTo(0, 0); }
  function findQ(id) {
    for (var i = 0; i < S.sections.length; i++) {
      for (var j = 0; j < S.sections[i].questions.length; j++) {
        if (S.sections[i].questions[j].id === id) return S.sections[i].questions[j];
      }
    }
  }

  function onChange(e) {
    var el = e.target, id = el.dataset.q;
    if (!id || el.dataset.etc) return;
    var q = findQ(id), A = st.A, c = Number(el.value);
    if (q.type === 'single') A[id] = c;
    else if (q.type === 'grid') { A[id] = Object.assign({}, A[id]); A[id][Number(el.dataset.r)] = c; }
    else {
      var cur = L.multiValue(q, A), opt = q.options.filter(function (o) { return o.c === c; })[0];
      if (!el.checked) cur = cur.filter(function (x) { return x !== c; });
      else if (opt.ex) cur = [c];
      else {
        var ex = q.options.filter(function (o) { return o.ex; }).map(function (o) { return o.c; });
        cur = cur.filter(function (x) { return ex.indexOf(x) < 0; });
        if (!q.max || cur.length < q.max) cur.push(c);
      }
      A[id] = cur;
    }
    save(); rerender();
  }
  function onInput(e) {
    var el = e.target;
    if (el.dataset.etc) { st.A[el.dataset.q + '_etc'] = el.value; save(); }
  }

  function submit() {
    var ps = pages();
    for (var i = 0; i < ps.length; i++) {
      if (!L.answered(ps[i].q, st.A)) { st.page = i; showErr = true; render(); window.scrollTo(0, 0); return; }
    }
    var payload = {
      action: 'submit', key: st.key, website: (document.getElementById('website') || {}).value || '',
      seconds: Math.round((Date.now() - st.t0) / 1000), rid: st.rid, version: S.version,
      answers: L.flatten(S, st.A)
    };
    if (!URL_) {
      app.innerHTML = '<div class="wrap"><div class="panel"><h1>미리보기 완료</h1><p>응답 저장 주소가 아직 설정되지 않아 저장하지 않았습니다. 실제로 전송될 내용은 아래와 같습니다.</p><pre>' +
        esc(JSON.stringify(payload, null, 1)) + '</pre><button class="btn" data-act="reset">처음으로</button></div></div>';
      window.scrollTo(0, 0);
      return;
    }
    sending = true; sendError = ''; rerender();
    post(payload).then(function (res) {
      sending = false;
      if (!res || !res.ok) throw new Error('rejected');
      lsDel(STORE);
      app.innerHTML = '<div class="wrap"><div class="panel"><h1>제출되었습니다</h1><p>설문에 참여해 주셔서 감사합니다. 이 창은 닫으셔도 됩니다.</p></div></div>';
      window.scrollTo(0, 0);
    }).catch(function () {
      sending = false;
      sendError = '전송하지 못했습니다. 응답은 이 휴대폰에 보관되어 있습니다. 통신 상태를 확인한 뒤 제출하기를 다시 눌러 주세요.';
      rerender();
    });
  }

  function onClick(e) {
    var act = e.target.dataset && e.target.dataset.act;
    if (!act) return;
    if (act === 'start') go(0);
    else if (act === 'prev') go(st.page - 1);
    else if (act === 'next') {
      if (!L.answered(pages()[st.page].q, st.A)) { showErr = true; render(); window.scrollTo(0, 0); }
      else go(st.page + 1);
    }
    else if (act === 'submit') submit();
    else if (act === 'reset') {
      if (st.page >= 0 && !confirm('지금까지 고른 답이 모두 지워집니다. 처음부터 다시 하시겠습니까?')) return;
      st = { A: {}, page: -1, t0: Date.now(), rid: newId(), key: st.key };
      save(); showErr = false; sendError = ''; render(); window.scrollTo(0, 0);
    }
  }

  // ---------- 관리 화면(?edit=1): 응답 보기 / 문구 편집 ----------
  var edPw = '', edMsg = '', edBusy = false, edTab = 'resp';
  var resp = null, rIdx = 0, rFilter = '';

  function editorLogin(msg) {
    app.innerHTML = '<div class="wrap"><div class="panel"><h1>관리자 로그인</h1>' +
      (URL_ ? '<p>응답을 보거나 문구를 고치려면 비밀번호를 입력하세요.</p><input class="etc" id="pw" type="password" autocomplete="current-password" style="margin-top:14px">' +
        (msg ? '<p class="note">' + esc(msg) + '</p>' : '') + '<button class="btn" id="login">들어가기</button>'
        : '<p class="note">응답 저장 주소(config.js의 SCRIPT_URL)가 설정되어야 사용할 수 있습니다.</p>') + '</div></div>';
    var b = document.getElementById('login');
    if (!b) return;
    function tryLogin() {
      var pw = document.getElementById('pw').value;
      if (!pw) return;
      b.disabled = true; b.textContent = '확인 중…';
      post({ action: 'login', pw: pw }).then(function (r) {
        if (r && r.ok) { edPw = pw; adminRender(); loadResponses(); }
        else editorLogin(r && r.error === 'locked' ? '여러 번 틀려 잠겼습니다. 10분 뒤에 다시 시도하세요.' : '비밀번호가 맞지 않습니다.');
      }).catch(function () { editorLogin('서버에 연결하지 못했습니다.'); });
    }
    b.addEventListener('click', tryLogin);
    document.getElementById('pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryLogin(); });
  }

  function loadResponses() {
    resp = null;
    post({ action: 'responses', pw: edPw }).then(function (r) {
      resp = r && r.ok ? r : { headers: [], rows: [], error: true };
    }).catch(function () { resp = { headers: [], rows: [], error: true }; })
      .then(function () { if (edTab !== 'text') adminRender(); });
  }

  function tabsHtml() {
    return '<div class="tabs"><button class="tab' + (edTab === 'resp' ? ' on' : '') + '" data-tab="resp">응답 보기</button>' +
      '<button class="tab' + (edTab === 'stat' ? ' on' : '') + '" data-tab="stat">통계</button>' +
      '<button class="tab' + (edTab === 'text' ? ' on' : '') + '" data-tab="text">문구 편집</button></div>';
  }

  // 응답 한 건을 질문 → 고른 답 형태로 보여 준다.
  function answerText(q, rec) {
    function val(k) { return rec[k] === undefined ? 'NA' : String(rec[k]); }
    function text(list, code) {
      var o = list.filter(function (x) { return String(x.c) === code; })[0];
      return o ? o.t : code;
    }
    if (q.type === 'single') return val(q.id) === 'NA' ? null : [text(q.options, val(q.id))];
    if (q.type === 'multi') {
      if (q.options.every(function (o) { return val(q.id + '_' + o.c) === 'NA'; })) return null;
      return q.options.filter(function (o) { return val(q.id + '_' + o.c) === '1'; }).map(function (o) {
        var etc = o.other ? String(rec[q.id + '_etc'] || '') : '';
        return o.t + (etc ? ': ' + etc : '');
      });
    }
    var out = q.rows.filter(function (r) { return val(q.id + '_' + r.c) !== 'NA'; }).map(function (r) {
      return r.t + ' → ' + text(q.cols, val(q.id + '_' + r.c));
    });
    return out.length ? out : null;
  }

  function filteredRows() {
    var pi = resp.headers.indexOf('배포경로');
    return resp.rows.filter(function (r) { return !rFilter || r[pi] === rFilter; });
  }
  function filterBarHtml() {
    var pi = resp.headers.indexOf('배포경로'), paths = [];
    resp.rows.forEach(function (r) { if (paths.indexOf(r[pi]) < 0) paths.push(r[pi]); });
    return '<div class="resp-bar"><label>배포 경로 <select id="r-filter"><option value="">전체 (' + resp.rows.length + '건)</option>' +
      paths.map(function (p) {
        return '<option value="' + esc(p) + '"' + (p === rFilter ? ' selected' : '') + '>' + esc(p) + '</option>';
      }).join('') + '</select></label><button class="link" data-reload="1" style="margin:0">새로 고침</button></div>';
  }

  // 문항별 집계. 비율의 분모는 그 문항을 실제로 본(건너뛰지 않은) 응답자 수.
  function barsHtml(list, counts, n) {
    return list.map(function (o) {
      var c = counts[o.c] || 0, pct = n ? Math.round(c / n * 100) : 0;
      return '<div class="st-row"><div class="st-label">' + esc(o.t) + '</div><div class="st-line"><div class="st-bar"><i style="width:' +
        pct + '%"></i></div><span class="st-num"><b>' + c + '</b>명 · ' + pct + '%</span></div></div>';
    }).join('');
  }
  function statsHtml() {
    if (!resp) return '<p style="margin-top:20px">응답을 불러오는 중…</p>';
    if (resp.error) return '<p class="note">응답을 불러오지 못했습니다.</p>';
    var hd = resp.headers, rows = filteredRows(), h = filterBarHtml();
    if (!rows.length) return h + '<p style="margin-top:20px">아직 응답이 없습니다.</p>';
    function col(k) { var i = hd.indexOf(k); return rows.map(function (r) { return i < 0 ? 'NA' : String(r[i]); }); }
    function tally(vals) {
      var m = {}, n = 0;
      vals.forEach(function (v) { if (v !== 'NA' && v !== '') { n++; m[v] = (m[v] || 0) + 1; } });
      return { m: m, n: n };
    }
    h += '<div class="resp-meta">응답 <b>' + rows.length + '</b>건 · 비율은 각 문항에 답한 사람 기준입니다.</div>';
    S.sections.forEach(function (sec) {
      h += '<div class="ed-group"><h2>' + esc(sec.title) + '</h2></div>';
      sec.questions.forEach(function (q) {
        var body = '', n = 0;
        if (q.type === 'single') {
          var t = tally(col(q.id)); n = t.n; body = barsHtml(q.options, t.m, n);
        } else if (q.type === 'multi') {
          var cols = q.options.map(function (o) { return col(q.id + '_' + o.c); }), counts = {};
          rows.forEach(function (r, i) { if (cols.some(function (c) { return c[i] !== 'NA' && c[i] !== ''; })) n++; });
          q.options.forEach(function (o, j) { counts[o.c] = cols[j].filter(function (v) { return v === '1'; }).length; });
          body = barsHtml(q.options, counts, n);
          var etc = q.options.some(function (o) { return o.other; }) ? col(q.id + '_etc').filter(function (v) { return v && v !== 'NA'; }) : [];
          if (etc.length) body += '<div class="st-etc">기타 내용: ' + etc.map(esc).join(' / ') + '</div>';
        } else {
          q.rows.forEach(function (r) {
            var t = tally(col(q.id + '_' + r.c));
            n = Math.max(n, t.n);
            body += '<div class="st-sub">' + esc(r.t) + ' <span>(' + t.n + '명)</span></div>' + barsHtml(q.cols, t.m, t.n);
          });
        }
        h += '<div class="ed-item"><label>' + esc(q.title) + '</label><div class="st-n">답한 사람 ' + n + '명' +
          (q.type === 'multi' ? ' · 복수 선택' : '') + '</div>' + body + '</div>';
      });
    });
    return h;
  }

  function responsesHtml() {
    if (!resp) return '<p style="margin-top:20px">응답을 불러오는 중…</p>';
    if (resp.error) return '<p class="note">응답을 불러오지 못했습니다.</p>';
    var hd = resp.headers, rows = filteredRows();
    var h = filterBarHtml();
    if (!rows.length) return h + '<p style="margin-top:20px">아직 응답이 없습니다.</p>';
    if (rIdx >= rows.length) rIdx = rows.length - 1;
    var rec = {};
    hd.forEach(function (k, i) { rec[k] = rows[rIdx][i]; });
    h += '<div class="resp-meta"><b>' + (rIdx + 1) + '</b> / ' + rows.length + '번째 응답<br>' +
      esc(rec['제출시각']) + ' · ' + esc(rec['배포경로']) + ' · ' + Math.round(Number(rec['소요초']) / 60) + '분 소요</div>';
    S.sections.forEach(function (sec) {
      h += '<div class="ed-group"><h2>' + esc(sec.title) + '</h2></div>';
      sec.questions.forEach(function (q) {
        var ans = answerText(q, rec);
        h += '<div class="ed-item"><label>' + esc(q.title) + '</label>' + (ans === null
          ? '<div class="resp-skip">건너뜀(해당 없음)</div>'
          : '<ul class="resp-ans">' + ans.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>') + '</div>';
      });
    });
    return h;
  }

  function textsHtml() {
    var h = '<p style="margin-top:16px">문장을 고친 뒤 저장을 누르면 바로 설문에 반영됩니다. 칸을 비우고 저장하면 원래 문구로 돌아갑니다. 선지나 문항을 추가·삭제하는 것은 여기서 할 수 없습니다.</p>' +
      '<p class="note">응답을 받는 도중에 뜻이 달라지게 고치면, 고치기 전과 후의 응답을 같은 질문으로 볼 수 없게 됩니다.</p>', group = '';
    L.textItems(S).forEach(function (it) {
      if (!CFG.SHOW_IMAGES && /\.cap$/.test(it.key)) return;
      if (it.group !== group) { group = it.group; h += '<div class="ed-group"><h2>' + esc(group) + '</h2></div>'; }
      var cur = it.obj[it.prop], changed = cur !== defaults[it.key];
      h += '<div class="ed-item' + (changed ? ' changed' : '') + '"><label for="e-' + it.key + '">' + esc(it.label) + '</label>' +
        '<textarea id="e-' + it.key + '" data-key="' + it.key + '" rows="' + (cur.length > 40 ? 3 : 1) + '" maxlength="500">' + esc(cur) + '</textarea>' +
        (changed ? '<div class="ed-orig">원래 문구: ' + esc(defaults[it.key]) + '</div>' : '') + '</div>';
    });
    return h;
  }

  function adminRender(keepScroll) {
    var y = keepScroll ? window.scrollY : 0;
    var nav = edTab === 'resp'
      ? '<button class="btn ghost" style="flex:1" data-step="-1">이전 응답</button><button class="btn" data-step="1">다음 응답</button>'
      : (edMsg ? '<span class="ok" style="margin:0;flex:1">' + esc(edMsg) + '</span>' : '') +
        '<button class="btn" id="ed-save"' + (edBusy ? ' disabled' : '') + '>' + (edBusy ? '저장 중…' : '저장') + '</button>';
    app.innerHTML = '<div class="wrap"><h1>설문 관리</h1>' + tabsHtml() +
      (edTab === 'resp' ? responsesHtml() : edTab === 'stat' ? statsHtml() : textsHtml()) + '</div>' +
      (edTab === 'stat' ? '' : '<div class="nav"><div class="nav-in">' + nav + '</div></div>');
    window.scrollTo(0, y);
  }

  function saveTexts() {
    var texts = {};
    app.querySelectorAll('textarea[data-key]').forEach(function (t) {
      var v = t.value.trim();
      if (v && v !== defaults[t.dataset.key]) texts[t.dataset.key] = v;
    });
    edBusy = true; edMsg = ''; adminRender(true);
    post({ action: 'saveTexts', pw: edPw, texts: texts }).then(function (r) {
      edBusy = false;
      if (!r || !r.ok) throw new Error();
      L.applyTexts(S, Object.assign({}, defaults, texts)); lsSet(TEXTS, texts);
      edMsg = '저장했습니다.';
    }).catch(function () { edBusy = false; edMsg = '저장하지 못했습니다. 다시 시도하세요.'; })
      .then(function () { adminRender(true); });
  }

  function adminEvents() {
    app.addEventListener('click', function (e) {
      var d = e.target.dataset || {};
      if (d.tab) { edTab = d.tab; edMsg = ''; adminRender(); }
      else if (d.step) { rIdx = Math.max(0, rIdx + Number(d.step)); adminRender(); }
      else if (d.reload) { adminRender(); loadResponses(); }
      else if (e.target.id === 'ed-save') saveTexts();
    });
    app.addEventListener('change', function (e) {
      if (e.target.id === 'r-filter') { rFilter = e.target.value; rIdx = 0; adminRender(); }
    });
  }

  // ---------- 시작 ----------
  // 화면은 기본 문구(또는 지난번에 받아 둔 문구)로 바로 띄우고, 수정된 문구는 뒤에서 받아 반영한다.
  function setTexts(texts) {
    L.applyTexts(S, Object.assign({}, defaults, texts || {}));
    document.title = S.intro.title;
  }
  function refreshTexts() {
    if (!URL_) return;
    var before = JSON.stringify(lsGet(TEXTS) || {});
    fetch(URL_).then(function (r) { return r.json(); }).then(function (r) {
      if (!r || !r.ok || !r.texts) return;
      lsSet(TEXTS, r.texts);
      if (JSON.stringify(r.texts) === before) return;
      setTexts(r.texts);
      if (!params.get('edit')) rerender();
    }).catch(function () { /* 연결이 안 되면 받아 둔 문구로 계속 진행 */ });
  }

  setTexts(lsGet(TEXTS));
  if (params.get('edit')) { adminEvents(); editorLogin(); }
  else {
    var saved = lsGet(STORE);
    if (saved && saved.A && saved.rid) st = saved;
    if (params.get('k')) st.key = params.get('k');
    if (!URL_ && params.get('page')) st.page = Number(params.get('page')) - 1;
    save();
    app.addEventListener('change', onChange);
    app.addEventListener('input', onInput);
    app.addEventListener('click', onClick);
    render();
  }
  refreshTexts();
})();
