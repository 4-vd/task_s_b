/* 화면과 무관한 설문 규칙: 표시 여부, 응답 완료 판정, 저장 열 구성, 문구 덮어쓰기 */
(function (g) {
  'use strict';
  var NA = 'NA';

  function qVisible(q, a) { return !q.showIf || !!q.showIf(a); }
  function options(q, a) {
    return q.filter ? q.options.filter(function (o) { return q.filter(a, o.c); }) : q.options;
  }
  function rows(q, a) {
    return q.rowFilter ? q.rows.filter(function (r) { return q.rowFilter(a, r.c); }) : q.rows;
  }
  function sectionVisible(sec, a) {
    return (!sec.showIf || !!sec.showIf(a)) &&
      sec.questions.some(function (q) { return qVisible(q, a); });
  }
  function codes(list) { return list.map(function (o) { return o.c; }); }

  // 현재 보이는 선지 기준으로 정리한 복수 선택 값
  function multiValue(q, a) {
    var ok = codes(options(q, a));
    return (a[q.id] || []).filter(function (c) { return ok.indexOf(c) >= 0; });
  }
  function singleValue(q, a) {
    var v = a[q.id];
    return codes(options(q, a)).indexOf(v) >= 0 ? v : undefined;
  }
  function answered(q, a) {
    if (q.type === 'single') return singleValue(q, a) !== undefined;
    if (q.type === 'multi') return multiValue(q, a).length > 0;
    var v = a[q.id] || {};
    var cs = codes(q.cols);
    return rows(q, a).every(function (r) { return cs.indexOf(v[r.c]) >= 0; });
  }
  function missing(sec, a) {
    return sec.questions.filter(function (q) { return qVisible(q, a) && !answered(q, a); });
  }

  function hasOther(q) { return q.type === 'multi' && q.options.some(function (o) { return o.other; }); }

  function columns(S) {
    var out = [];
    S.sections.forEach(function (sec) {
      sec.questions.forEach(function (q) {
        if (q.type === 'single') out.push(q.id);
        else if (q.type === 'multi') {
          q.options.forEach(function (o) { out.push(q.id + '_' + o.c); });
          if (hasOther(q)) out.push(q.id + '_etc');
        } else q.rows.forEach(function (r) { out.push(q.id + '_' + r.c); });
      });
    });
    return out;
  }

  // 응답을 열 이름 → 값으로 편다. 건너뛴 문항은 NA.
  function flatten(S, a) {
    var out = {};
    S.sections.forEach(function (sec) {
      var secOn = sectionVisible(sec, a);
      sec.questions.forEach(function (q) {
        var on = secOn && qVisible(q, a);
        if (q.type === 'single') {
          var v = on ? singleValue(q, a) : (q.derive ? q.derive(a) : undefined);
          out[q.id] = v === undefined ? NA : String(v);
        } else if (q.type === 'multi') {
          var sel = on ? multiValue(q, a) : null;
          q.options.forEach(function (o) {
            out[q.id + '_' + o.c] = sel ? (sel.indexOf(o.c) >= 0 ? '1' : '0') : NA;
          });
          if (hasOther(q)) {
            var otherOn = sel && q.options.some(function (o) { return o.other && sel.indexOf(o.c) >= 0; });
            out[q.id + '_etc'] = otherOn ? String(a[q.id + '_etc'] || '').trim().slice(0, 300) : '';
          }
        } else {
          var gv = a[q.id] || {};
          var vis = on ? codes(rows(q, a)) : [];
          q.rows.forEach(function (r) {
            out[q.id + '_' + r.c] = vis.indexOf(r.c) >= 0 && gv[r.c] ? String(gv[r.c]) : NA;
          });
        }
      });
    });
    return out;
  }

  // 편집 가능한 문구 목록. key 는 저장소(문구 시트)의 식별자.
  function textItems(S) {
    var items = [];
    function add(key, label, obj, prop, group) {
      items.push({ key: key, label: label, obj: obj, prop: prop, group: group });
    }
    add('intro.title', '설문 제목', S.intro, 'title', '첫 화면');
    add('intro.body', '안내문', S.intro, 'body', '첫 화면');
    S.sections.forEach(function (sec) {
      var grp = sec.id + ' ' + sec.title;
      add('sec.' + sec.id + '.title', '단계 제목', sec, 'title', grp);
      if (sec.desc !== undefined) add('sec.' + sec.id + '.desc', '단계 설명', sec, 'desc', grp);
      sec.questions.forEach(function (q) {
        var p = 'q.' + q.id;
        add(p + '.title', q.id + ' 질문', q, 'title', grp);
        if (q.help !== undefined) add(p + '.help', q.id + ' 안내', q, 'help', grp);
        if (q.cap !== undefined) add(p + '.cap', q.id + ' 그림 설명', q, 'cap', grp);
        (q.options || []).forEach(function (o) { add(p + '.o.' + o.c, q.id + ' 선지 ' + o.c, o, 't', grp); });
        (q.rows || []).forEach(function (r) { add(p + '.r.' + r.c, q.id + ' 항목 ' + r.c, r, 't', grp); });
        (q.cols || []).forEach(function (c) { add(p + '.c.' + c.c, q.id + ' 척도 ' + c.c, c, 't', grp); });
      });
    });
    return items;
  }
  // 저장된 문구를 설문 정의에 덮어쓴다. 여러 문항이 같은 선지 객체를 공유하지 않도록 먼저 분리한다.
  function applyTexts(S, map) {
    if (!map) return;
    S.sections.forEach(function (sec) {
      sec.questions.forEach(function (q) {
        ['options', 'rows', 'cols'].forEach(function (k) {
          if (q[k]) q[k] = q[k].map(function (o) { return Object.assign({}, o); });
        });
      });
    });
    textItems(S).forEach(function (it) {
      var v = map[it.key];
      if (typeof v === 'string' && v.trim()) it.obj[it.prop] = v;
    });
  }

  var api = {
    NA: NA, qVisible: qVisible, options: options, rows: rows, sectionVisible: sectionVisible,
    multiValue: multiValue, singleValue: singleValue, answered: answered, missing: missing,
    columns: columns, flatten: flatten, textItems: textItems, applyTexts: applyTexts
  };
  g.SurveyLogic = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
