/* Linux Academy: a small vim (modal editing) on top of the terminal's editor overlay */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  if (!LX.TermUI) return;
  const TUI = LX.TermUI.prototype;

  const VIM_KEYS = [['Esc', 'Esc'], ['i', 'i'], ['dd', 'dd'], ['yy', 'yy'], ['p', 'p'], ['u', 'u'], [':wq', ':wq'], [':q!', ':q!']];

  TUI.vimStart = function (o) {
    const el = this.el;
    const ta = el.edText;
    const ed = this.ed;
    const self = this;
    const V = {
      mode: 'normal', count: '', op: '', buf: '', yank: '', yankLine: false, undo: [], redo: [], col: 0, search: '', lastSearchDir: 1, msg: '', pend: '',
    };
    this.vim = V;
    el.edApp.textContent = 'VIM - Vi IMproved 9.1';
    const keysBox = el.editor.querySelector('.ed-keys');
    V.oldKeys = keysBox.innerHTML;
    keysBox.innerHTML = VIM_KEYS.map(([l, k]) => `<button data-vim="${k}">${l}</button>`).join('');
    keysBox.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const k = b.dataset.vim;
      if (k === 'Esc') V.press('Escape');
      else if (k[0] === ':') { if (V.mode === 'insert') V.press('Escape'); V.mode = 'normal'; V.exec(k.slice(1)); V.show(); } else for (const ch of k) V.press(ch);
      ta.focus();
    };
    const text = () => ta.value;
    const setText = (t) => { ta.value = t; };
    const lineStart = (p, t) => t.lastIndexOf('\n', p - 1) + 1;
    const lineEnd = (p, t) => { const i = t.indexOf('\n', p); return i < 0 ? t.length : i; };
    const lineNo = (p, t) => t.slice(0, p).split('\n').length;
    const nLines = (t) => (t === '' ? 1 : t.replace(/\n$/, '').split('\n').length);
    const clampNormal = (p, t) => {
      p = Math.max(0, Math.min(p, t.length));
      const ls = lineStart(p, t);
      const le = lineEnd(p, t);
      if (p >= le && le > ls) p = le - 1;
      return p;
    };
    let pos = 0;
    const markMod = () => { ed.modified = true; el.edMod.textContent = 'Modified'; };
    const snapshot = () => { V.undo.push({ t: text(), p: pos }); if (V.undo.length > 200) V.undo.shift(); V.redo = []; };
    V.show = () => {
      const t = text();
      pos = V.mode === 'insert' ? ta.selectionStart : clampNormal(pos, t);
      if (V.mode !== 'insert') {
        ta.readOnly = true;
        const ch = t[pos];
        ta.setSelectionRange(pos, ch !== undefined && ch !== '\n' ? pos + 1 : pos);
        V.col = pos - lineStart(pos, t);
      }
      const ln = lineNo(pos, t);
      const tot = nLines(t);
      const where = `${ln},${pos - lineStart(pos, t) + 1}`.padEnd(14) + (ln === 1 ? 'Top' : ln >= tot ? 'Bot' : Math.round((ln / tot) * 100) + '%');
      let left = '';
      if (V.mode === 'insert') left = '-- INSERT --';
      else if (V.mode === 'cmd') left = ':' + V.buf;
      else if (V.mode === 'search') left = '/' + V.buf;
      else left = V.msg || (V.count || V.op || V.pend ? V.count + V.op + V.pend : '');
      el.edMsg.textContent = `${left.padEnd(40)}${where}`;
      el.edMsg.style.textAlign = 'left';
    };
    const caret = (p) => { pos = p; };
    V.press = (k, extra) => V.key(Object.assign({ key: k, preventDefault() {}, ctrlKey: false, shiftKey: false }, extra));

    /* ---------- motions ---------- */
    const wordsRe = /[A-Za-z0-9_]+|[^\sA-Za-z0-9_]+/g;
    const nextWord = (p, t, n) => {
      for (let i = 0; i < n; i++) {
        wordsRe.lastIndex = p;
        let m = wordsRe.exec(t);
        if (m && m.index === p) { p = m.index + m[0].length; wordsRe.lastIndex = p; m = wordsRe.exec(t); }
        p = m ? m.index : t.length;
      }
      return p;
    };
    const prevWord = (p, t, n) => {
      for (let i = 0; i < n; i++) {
        let q = p - 1;
        while (q > 0 && /\s/.test(t[q])) q--;
        const cls = (c) => (/[A-Za-z0-9_]/.test(c) ? 1 : /\s/.test(c) ? 0 : 2);
        const c0 = cls(t[q] || ' ');
        while (q > 0 && cls(t[q - 1]) === c0) q--;
        p = Math.max(0, q);
      }
      return p;
    };
    const endWord = (p, t, n) => {
      for (let i = 0; i < n; i++) {
        let q = p + 1;
        while (q < t.length && /\s/.test(t[q])) q++;
        const cls = (c) => (/[A-Za-z0-9_]/.test(c) ? 1 : 2);
        const c0 = cls(t[q] || ' ');
        while (q + 1 < t.length && !/\s/.test(t[q + 1]) && cls(t[q + 1]) === c0) q++;
        p = Math.min(q, t.length - 1);
      }
      return p;
    };
    const moveLine = (p, t, d) => {
      const lines = t.split('\n');
      let ln = lineNo(p, t) - 1 + d;
      ln = Math.max(0, Math.min(ln, lines.length - 1 - (t.endsWith('\n') && lines.length > 1 ? 1 : 0)));
      let start = 0;
      for (let i = 0; i < ln; i++) start += lines[i].length + 1;
      return start + Math.min(V.col, Math.max(0, lines[ln].length - 1));
    };
    const gotoLine = (n, t) => {
      const lines = t.split('\n');
      const ln = Math.max(0, Math.min(n - 1, lines.length - 1 - (t.endsWith('\n') && lines.length > 1 ? 1 : 0)));
      let start = 0;
      for (let i = 0; i < ln; i++) start += lines[i].length + 1;
      const fn = start + (/^\s*/.exec(lines[ln])[0].length);
      return fn;
    };
    /** returns [start,end,linewise] range for operator+motion, or null */
    const rangeFor = (m, n, t) => {
      const ls = lineStart(pos, t);
      switch (m) {
        case 'w': { let e = nextWord(pos, t, n); const le = lineEnd(pos, t); if (e > le && n === 1) e = le; return [pos, e, false]; }
        case 'e': return [pos, endWord(pos, t, n) + 1, false];
        case 'b': return [prevWord(pos, t, n), pos, false];
        case '$': { let e = pos; for (let i = 1; i < n; i++) e = lineEnd(e, t) + 1; return [pos, lineEnd(Math.min(e, t.length), t), false]; }
        case '0': return [ls, pos, false];
        case '^': return [ls + /^\s*/.exec(t.slice(ls, lineEnd(pos, t)))[0].length, pos, false];
        case 'l': return [pos, Math.min(pos + n, lineEnd(pos, t)), false];
        case 'h': return [Math.max(ls, pos - n), pos, false];
        case 'j': { let e = pos; for (let i = 0; i < n; i++) e = lineEnd(e, t) + 1; return [ls, Math.min(lineEnd(Math.min(e - 1, t.length), t) + 1, t.length), true]; }
        case 'k': { let s = ls; for (let i = 0; i < n && s > 0; i++) s = lineStart(s - 1, t); return [s, Math.min(lineEnd(pos, t) + 1, t.length), true]; }
        case 'G': return [ls, t.length, true];
        default: return null;
      }
    };
    const delRange = (s, e, linewise, yankOnly) => {
      const t = text();
      let seg = t.slice(s, e);
      if (linewise && !seg.endsWith('\n')) seg += '\n';
      V.yank = seg;
      V.yankLine = linewise;
      if (yankOnly) { V.msg = linewise ? `${seg.split('\n').length - 1} lines yanked` : ''; return; }
      snapshot();
      let nt = t.slice(0, s) + t.slice(e);
      if (linewise && e >= t.length && s > 0 && !t.slice(0, s).endsWith('\n')) nt = t.slice(0, s);
      setText(nt);
      markMod();
      caret(linewise ? gotoLine(lineNo(s, nt), nt) : s);
      if (linewise) { const l = seg.split('\n').length - 1; if (l >= 3) V.msg = `${l} fewer lines`; }
    };
    const enterInsert = (p) => {
      if (V.mode !== 'insert') snapshot();
      V.mode = 'insert';
      ta.readOnly = false;
      ta.setSelectionRange(p, p);
      pos = p;
      V.msg = '';
    };
    const leaveInsert = () => {
      V.mode = 'normal';
      const p = ta.selectionStart;
      const t = text();
      pos = Math.max(lineStart(p, t), p - 1);
      V.msg = '';
    };

    /* ---------- ex commands ---------- */
    V.quit = (force) => {
      if (ed.modified && !force) { V.msg = 'E37: No write since last change (add ! to override)'; return; }
      self.vim = null;
      el.editor.querySelector('.ed-keys').innerHTML = V.oldKeys;
      el.editor.querySelector('.ed-keys').onclick = null;
      el.edMsg.style.textAlign = '';
      ta.readOnly = false;
      self.edAction(force ? 'no' : (ed.saved !== null || !ed.modified ? 'no' : 'no'));
    };
    V.write = () => {
      if (ed.readonly) { V.msg = `E45: 'readonly' option is set (add ! to override)`; return false; }
      const t = text();
      ed.saved = t;
      ed.modified = false;
      el.edMod.textContent = '';
      V.msg = `"${o.path || 'New File'}" ${nLines(t)}L, ${new Blob([t]).size}B written`;
      return true;
    };
    V.exec = (cmd) => {
      cmd = cmd.trim();
      const t = text();
      let m;
      if (cmd === '') return;
      if (/^\d+$/.test(cmd)) { caret(gotoLine(+cmd, t)); return; }
      if (cmd === '$') { caret(gotoLine(nLines(t), t)); return; }
      if (cmd === 'w' || cmd === 'w!') { V.write(); return; }
      if (/^w\s+\S+/.test(cmd)) { V.msg = 'E212: Can\'t open file for writing (sandbox saves only the file you opened)'; return; }
      if (cmd === 'q') { V.quit(false); return; }
      if (cmd === 'q!' || cmd === 'qa!') { V.quit(true); return; }
      if (cmd === 'qa') { V.quit(false); return; }
      if (cmd === 'wq' || cmd === 'x' || cmd === 'wq!' || cmd === 'xit' || cmd === 'wqa') {
        if (cmd === 'x' && !ed.modified) { V.quit(true); return; }
        if (!V.write()) return;
        V.quit(true);
        // quit(true) resolves with saved text
        return;
      }
      if (cmd === 'e!') { setText(o.content); ed.modified = false; el.edMod.textContent = ''; caret(0); V.msg = 'reloaded'; return; }
      if (/^set?\s/.test(cmd) || cmd === 'noh' || cmd === 'nohlsearch') { V.msg = cmd === 'noh' ? '' : ':' + cmd + '  (accepted; this simple vim ignores display options)'; return; }
      if ((m = /^(%|\d+,\d+|\d+)?s(.)(.*?)\2(.*?)(?:\2([gic]*))?$/.exec(cmd))) {
        const [, rng, , pat, rep, fl] = m;
        let re;
        try { re = new RegExp(pat.replace(/\\</g, '\\b').replace(/\\>/g, '\\b').replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\|/g, '|'), (fl || '').includes('g') ? 'g' : '' ); if ((fl || '').includes('i')) re = new RegExp(re.source, re.flags + 'i'); } catch (e) { V.msg = 'E486: Pattern not found: ' + pat; return; }
        const lines = t.split('\n');
        let lo = lineNo(pos, t) - 1;
        let hi = lo;
        if (rng === '%') { lo = 0; hi = lines.length - 1; } else if (rng && rng.includes(',')) { lo = +rng.split(',')[0] - 1; hi = +rng.split(',')[1] - 1; } else if (rng) { lo = hi = +rng - 1; }
        let count = 0;
        let linesChanged = 0;
        for (let i = lo; i <= hi && i < lines.length; i++) {
          let c = 0;
          const nl = lines[i].replace(re, (...a) => { c++; return rep.replace(/&/g, a[0]).replace(/\\(\d)/g, (mm, d) => a[+d] || ''); });
          if (c) { lines[i] = nl; count += c; linesChanged++; }
        }
        if (!count) { V.msg = 'E486: Pattern not found: ' + pat; return; }
        snapshot();
        setText(lines.join('\n'));
        markMod();
        V.msg = count > 1 || linesChanged > 1 ? `${count} substitutions on ${linesChanged} line${linesChanged > 1 ? 's' : ''}` : '';
        return;
      }
      if (cmd === 'help' || cmd === 'h') { V.msg = 'Help: i insert, Esc normal, :w save, :q quit, :wq save+quit, :q! quit without saving'; return; }
      V.msg = `E492: Not an editor command: ${cmd}`;
    };
    const search = (pat, dir) => {
      const t = text();
      if (!pat) return;
      V.search = pat;
      V.lastSearchDir = dir;
      let re;
      try { re = new RegExp(pat, 'g'); } catch (e) { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'); }
      const all = [...t.matchAll(re)].map((m) => m.index);
      if (!all.length) { V.msg = `E486: Pattern not found: ${pat}`; return; }
      const nxt = dir > 0 ? all.find((i) => i > pos) : [...all].reverse().find((i) => i < pos);
      const hit = nxt !== undefined ? nxt : dir > 0 ? all[0] : all[all.length - 1];
      caret(hit);
      V.msg = nxt === undefined ? (dir > 0 ? 'search hit BOTTOM, continuing at TOP' : 'search hit TOP, continuing at BOTTOM') : '';
    };

    /* ---------- key handler ---------- */
    V.key = (e) => {
      const k = e.key;
      const t0 = text();
      if (V.mode === 'insert') {
        if (k === 'Escape' || (e.ctrlKey && (k === '[' || k === 'c'))) { e.preventDefault(); leaveInsert(); V.show(); return; }
        if (k === 'Tab') { e.preventDefault(); document.execCommand ? document.execCommand('insertText', false, '\t') : null; markMod(); }
        if (!e.ctrlKey && k.length === 1 || k === 'Enter' || k === 'Backspace' || k === 'Delete') markMod();
        setTimeout(V.show, 0);
        return;
      }
      e.preventDefault();
      if (V.mode === 'cmd' || V.mode === 'search') {
        if (k === 'Escape') { V.mode = 'normal'; V.buf = ''; V.msg = ''; } else if (k === 'Enter') {
          const b = V.buf;
          const wasSearch = V.mode === 'search';
          V.mode = 'normal';
          V.buf = '';
          V.msg = '';
          if (wasSearch) search(b, 1); else V.exec(b);
        } else if (k === 'Backspace') { if (!V.buf) V.mode = 'normal'; else V.buf = V.buf.slice(0, -1); } else if (k.length === 1) V.buf += k;
        if (self.vim) V.show();
        return;
      }
      V.msg = '';
      if (e.ctrlKey) {
        if (k === 'r') { const r = V.redo.pop(); if (r) { V.undo.push({ t: text(), p: pos }); setText(r.t); caret(r.p); markMod(); } } else if (k === 'f' || k === 'd') caret(moveLine(pos, t0, 10)); else if (k === 'b' || k === 'u') caret(moveLine(pos, t0, -10)); else if (k === 'g') V.msg = `"${o.path || 'No Name'}" ${nLines(t0)} lines`;
        V.show();
        return;
      }
      if (k === 'Escape') { V.count = ''; V.op = ''; V.pend = ''; V.show(); return; }
      const n = V.count ? parseInt(V.count, 10) : 1;
      const t = t0;
      // pending two-key commands
      if (V.pend === 'g') { V.pend = ''; V.count = ''; if (k === 'g') caret(gotoLine(V.count || 1, t)); else if (k === 'J') { /* ignore */ } V.show(); return; }
      if (V.pend === 'r') { V.pend = ''; V.count = ''; if (k.length === 1 && pos < t.length && t[pos] !== '\n') { snapshot(); setText(t.slice(0, pos) + k.repeat(Math.min(n, lineEnd(pos, t) - pos)) + t.slice(pos + Math.min(n, lineEnd(pos, t) - pos))); markMod(); } V.show(); return; }
      if (V.pend === 'Z') { V.pend = ''; if (k === 'Z') { if (V.write()) V.quit(true); } else if (k === 'Q') V.quit(true); V.show(); return; }
      if (V.op) {
        const op = V.op;
        V.op = '';
        V.count = '';
        if (k === op) { // dd yy cc
          const ls = lineStart(pos, t);
          let e = ls;
          for (let i = 0; i < n; i++) { const le = lineEnd(e, t); e = Math.min(le + 1, t.length); if (le >= t.length) break; }
          if (op === 'y') { delRange(ls, e, true, true); V.show(); return; }
          if (op === 'd') { delRange(ls, e, true); V.show(); return; }
          if (op === 'c') { snapshot(); const seg = t.slice(ls, lineEnd(pos, t)); V.yank = seg + '\n'; V.yankLine = true; setText(t.slice(0, ls) + t.slice(lineEnd(pos, t))); markMod(); enterInsert(ls); V.show(); return; }
        }
        if (k === 'g') { V.op = op; V.pend2 = 'g'; V.show(); return; }
        const r = rangeFor(k === 'G' ? 'G' : k, n, t);
        if (!r) { V.show(); return; }
        if (op === 'y') delRange(r[0], r[1], r[2], true);
        else if (op === 'd') delRange(r[0], r[1], r[2]);
        else if (op === 'c') { snapshot(); V.yank = t.slice(r[0], r[1]); setText(t.slice(0, r[0]) + t.slice(r[1])); markMod(); enterInsert(r[0]); }
        V.show();
        return;
      }
      if (/^[1-9]$/.test(k) || (k === '0' && V.count)) { V.count += k; V.show(); return; }
      const cnt = () => { const c = n; V.count = ''; return c; };
      switch (k) {
        case 'h': case 'ArrowLeft': caret(Math.max(lineStart(pos, t), pos - cnt())); break;
        case 'l': case 'ArrowRight': case ' ': caret(Math.min(lineEnd(pos, t) - 1, pos + cnt())); break;
        case 'j': case 'ArrowDown': caret(moveLine(pos, t, cnt())); break;
        case 'k': case 'ArrowUp': caret(moveLine(pos, t, -cnt())); break;
        case '0': case 'Home': caret(lineStart(pos, t)); break;
        case '^': caret(lineStart(pos, t) + /^\s*/.exec(t.slice(lineStart(pos, t), lineEnd(pos, t)))[0].length); break;
        case '$': case 'End': caret(Math.max(lineStart(pos, t), lineEnd(pos, t) - 1)); V.col = 9999; break;
        case 'w': caret(nextWord(pos, t, cnt())); break;
        case 'b': caret(prevWord(pos, t, cnt())); break;
        case 'e': caret(endWord(pos, t, cnt())); break;
        case 'G': { const had = V.count; V.count = ''; caret(gotoLine(had ? n : nLines(t), t)); break; }
        case 'g': V.pend = 'g'; break;
        case 'd': case 'y': case 'c': V.op = k; break;
        case 'D': { cnt(); const le = lineEnd(pos, t); delRange(pos, le, false); break; }
        case 'C': { cnt(); const le = lineEnd(pos, t); snapshot(); V.yank = t.slice(pos, le); setText(t.slice(0, pos) + t.slice(le)); markMod(); enterInsert(pos); break; }
        case 'x': case 'Delete': { const c = cnt(); const e = Math.min(pos + c, lineEnd(pos, t)); if (e > pos) delRange(pos, e, false); break; }
        case 'X': { const c = cnt(); const s = Math.max(lineStart(pos, t), pos - c); if (s < pos) { delRange(s, pos, false); } break; }
        case 's': { const c = cnt(); const e = Math.min(pos + c, lineEnd(pos, t)); snapshot(); V.yank = t.slice(pos, e); setText(t.slice(0, pos) + t.slice(e)); markMod(); enterInsert(pos); break; }
        case 'S': { cnt(); const ls = lineStart(pos, t); snapshot(); setText(t.slice(0, ls) + t.slice(lineEnd(pos, t))); markMod(); enterInsert(ls); break; }
        case 'r': V.pend = 'r'; break;
        case 'Z': V.pend = 'Z'; break;
        case 'i': cnt(); enterInsert(pos); break;
        case 'a': cnt(); enterInsert(Math.min(pos + 1, lineEnd(pos, t))); break;
        case 'I': cnt(); enterInsert(lineStart(pos, t) + /^\s*/.exec(t.slice(lineStart(pos, t), lineEnd(pos, t)))[0].length); break;
        case 'A': cnt(); enterInsert(lineEnd(pos, t)); break;
        case 'o': { cnt(); snapshot(); const le = lineEnd(pos, t); setText(t.slice(0, le) + '\n' + t.slice(le)); markMod(); enterInsert(le + 1); break; }
        case 'O': { cnt(); snapshot(); const ls = lineStart(pos, t); setText(t.slice(0, ls) + '\n' + t.slice(ls)); markMod(); enterInsert(ls); break; }
        case 'p': case 'P': {
          const c = cnt();
          if (!V.yank) break;
          snapshot();
          let nt;
          let np;
          if (V.yankLine) {
            const at = k === 'p' ? Math.min(lineEnd(pos, t) + 1, t.length) : lineStart(pos, t);
            const pre = k === 'p' && lineEnd(pos, t) >= t.length && !t.endsWith('\n') ? '\n' : '';
            const ins = V.yank.repeat(c);
            nt = t.slice(0, at) + pre + (pre ? ins.replace(/\n$/, '') : ins) + t.slice(at);
            np = at + pre.length;
            np = np + /^\s*/.exec(nt.slice(np))[0].length;
          } else {
            const at = k === 'p' ? Math.min(pos + 1, lineEnd(pos, t)) : pos;
            nt = t.slice(0, at) + V.yank.repeat(c) + t.slice(at);
            np = at + V.yank.length * c - 1;
          }
          setText(nt);
          markMod();
          caret(np);
          break;
        }
        case 'u': { const u = V.undo.pop(); if (u) { V.redo.push({ t: text(), p: pos }); setText(u.t); caret(u.p); V.msg = `1 change; before #${V.undo.length + 1}`; markMod(); } else V.msg = 'Already at oldest change'; break; }
        case 'J': { cnt(); const le = lineEnd(pos, t); if (le < t.length) { snapshot(); const next = t.slice(le + 1); setText(t.slice(0, le) + ' ' + next.replace(/^\s+/, '')); markMod(); caret(le); } break; }
        case '~': { const ch = t[pos]; if (ch && ch !== '\n') { snapshot(); setText(t.slice(0, pos) + (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()) + t.slice(pos + 1)); markMod(); caret(pos + 1); } break; }
        case ':': V.mode = 'cmd'; V.buf = ''; break;
        case '/': V.mode = 'search'; V.buf = ''; break;
        case 'n': search(V.search, V.lastSearchDir); break;
        case 'N': search(V.search, -V.lastSearchDir); break;
        case 'v': case 'V': V.msg = '(Visual mode is not in this simple sandbox vim. Try d, y and p with motions instead.)'; break;
        case '.': V.msg = '(the . repeat command is not in this simple sandbox vim)'; break;
        default: break;
      }
      if (!['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(k) && !V.op && !V.pend) V.count = '';
      V.show();
    };
    V.open = () => {
      const t = text();
      pos = 0;
      V.msg = o.path ? `"${o.path}" ${o.content === '' && !o.exists ? '[New]' : `${nLines(o.content)}L, ${new Blob([o.content]).size}B`}` : '';
      ta.readOnly = true;
      V.show();
      setTimeout(() => { ta.focus(); V.show(); }, 10);
    };
    V.open();
  };
})();
