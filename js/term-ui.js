/* Linux Academy: the live terminal component (looks like macOS Terminal) */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* ---------- ANSI -> HTML ---------- */
  function newState() {
    return { b: false, d: false, u: false, r: false, fg: null, bg: null };
  }
  function applyCodes(st, codes) {
    for (const code of codes.length ? codes : [0]) {
      if (code === 0) Object.assign(st, newState());
      else if (code === 1) st.b = true;
      else if (code === 2) st.d = true;
      else if (code === 4) st.u = true;
      else if (code === 7) st.r = true;
      else if (code === 22) st.b = st.d = false;
      else if (code === 24) st.u = false;
      else if (code === 27) st.r = false;
      else if (code >= 30 && code <= 37) st.fg = code - 30;
      else if (code >= 90 && code <= 97) st.fg = code - 90 + 8;
      else if (code === 39) st.fg = null;
      else if (code >= 40 && code <= 47) st.bg = code - 40;
      else if (code === 49) st.bg = null;
    }
  }
  function cls(st) {
    const c = [];
    if (st.b) c.push('b');
    if (st.d) c.push('d');
    if (st.u) c.push('u');
    if (st.r) c.push('rv');
    if (st.fg !== null) c.push('c' + st.fg);
    if (st.bg !== null) c.push('g' + st.bg);
    return c.join(' ');
  }
  function ansiToHtml(text, st) {
    let html = '';
    let last = 0;
    const re = /\x1b\[([0-9;]*)([A-Za-z])/g;
    let m;
    const emit = (s) => {
      if (!s) return;
      const c = cls(st);
      html += c ? `<span class="${c}">${esc(s)}</span>` : esc(s);
    };
    while ((m = re.exec(text))) {
      emit(text.slice(last, m.index));
      last = re.lastIndex;
      if (m[2] === 'm') applyCodes(st, m[1] === '' ? [] : m[1].split(';').map((x) => parseInt(x, 10) || 0));
    }
    emit(text.slice(last));
    return html;
  }
  LX.ansiToHtml = (t) => ansiToHtml(t, newState());

  const PROFILES = [
    ['pro', 'Pro'],
    ['basic', 'Basic'],
    ['homebrew', 'Homebrew'],
    ['ocean', 'Ocean'],
    ['novel', 'Novel'],
    ['grass', 'Grass'],
    ['redsands', 'Red Sands'],
  ];
  LX.PROFILES = PROFILES;

  class TermUI {
    constructor(root, opts) {
      this.root = root;
      this.opts = opts || {};
      this.hist = [];
      this.hi = -1;
      this.buffer = '';
      this.busy = false;
      this.mode = 'prompt'; // prompt | busy | read
      this.readCb = null;
      this.ansi = newState();
      this.lastTab = 0;
      this.search = null;
      this.build();
      this.newShell();
      this.welcome();
      this.prompt();
    }

    build() {
      const r = this.root;
      r.innerHTML = `
        <div class="term-head">
          <div class="term-title" id="term-title">learner — bash — 80×24</div>
          <div class="term-tools">
            <label class="sr" for="term-profile">Colour profile</label>
            <select id="term-profile" class="term-select" title="Terminal profile (like Terminal ▸ Settings ▸ Profiles)">${PROFILES.map((p) => `<option value="${p[0]}">${p[1]}</option>`).join('')}</select>
            <button class="term-btn" data-term="clear" title="Clear the screen (Ctrl+L)">Clear</button>
            <button class="term-btn" data-term="reset" title="Put everything back exactly as it was at the start">Reset sandbox</button>
            <button class="term-btn term-close" data-term="close" aria-label="Hide terminal">Hide</button>
          </div>
        </div>
        <div class="screen" id="screen" tabindex="0" role="log" aria-label="Linux terminal. Click here and type a command.">
          <div class="out" id="out"></div>
          <div class="line" id="inputline"><span class="ps" id="ps"></span><span class="inwrap"><input id="cmd" class="cmd" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" aria-label="Terminal input"><span class="ghost" id="ghost"></span></span></div>
        </div>
        <div class="keys" aria-label="Extra keys">
          <button data-key="Tab">Tab</button><button data-key="ArrowUp" aria-label="Previous command">↑</button><button data-key="ArrowDown" aria-label="Next command">↓</button><button data-key="C" title="Stop a running command">Ctrl+C</button><button data-key="D" title="End of input">Ctrl+D</button><button data-key="L" title="Clear screen">Ctrl+L</button>
        </div>
        <div class="editor" id="editor" hidden>
          <div class="ed-head"><span id="ed-app">GNU nano 7.2</span><span id="ed-file" class="ed-file">New Buffer</span><span id="ed-mod" class="ed-mod"></span></div>
          <textarea id="ed-text" class="ed-text" spellcheck="false" aria-label="Text editor"></textarea>
          <div id="ed-msg" class="ed-msg" aria-live="polite"></div>
          <div class="ed-keys">
            <button data-ed="save"><b>^O</b> Write Out</button><button data-ed="exit"><b>^X</b> Exit</button><button data-ed="cancel"><b>Esc</b> Cancel</button>
          </div>
          <div id="ed-ask" class="ed-ask" hidden>Save modified buffer?
            <button data-ed="yes">Yes</button><button data-ed="no">No</button><button data-ed="back">Cancel</button></div>
        </div>`;
      this.el = {
        screen: r.querySelector('#screen'),
        out: r.querySelector('#out'),
        line: r.querySelector('#inputline'),
        ps: r.querySelector('#ps'),
        input: r.querySelector('#cmd'),
        ghost: r.querySelector('#ghost'),
        title: r.querySelector('#term-title'),
        profile: r.querySelector('#term-profile'),
        editor: r.querySelector('#editor'),
        edText: r.querySelector('#ed-text'),
        edFile: r.querySelector('#ed-file'),
        edMod: r.querySelector('#ed-mod'),
        edMsg: r.querySelector('#ed-msg'),
        edAsk: r.querySelector('#ed-ask'),
        edApp: r.querySelector('#ed-app'),
      };
      const el = this.el;
      el.screen.addEventListener('mousedown', (e) => {
        if (e.target.closest('select,button,textarea,input')) return;
        // let people select text; focus input on simple click
        setTimeout(() => {
          if (!window.getSelection().toString()) this.focus();
        }, 0);
      });
      el.screen.addEventListener('keydown', (e) => this.onKey(e));
      el.input.addEventListener('keydown', (e) => this.onKey(e));
      el.input.addEventListener('input', () => this.onInput());
      el.input.addEventListener('paste', (e) => this.onPaste(e));
      r.querySelector('.keys').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const k = b.dataset.key;
        this.onKey({ key: k.length === 1 ? k.toLowerCase() : k, ctrlKey: k.length === 1, preventDefault() {}, stopPropagation() {} });
        this.focus();
      });
      r.querySelector('.term-tools').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const a = b.dataset.term;
        if (a === 'clear') this.clear();
        else if (a === 'reset') {
          this.reset();
        } else if (a === 'close' && this.opts.onHide) this.opts.onHide();
      });
      el.profile.addEventListener('change', () => this.setProfile(el.profile.value));
      r.querySelector('.ed-keys').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b) this.edAction(b.dataset.ed);
      });
      el.edAsk.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b) this.edAction(b.dataset.ed);
      });
      el.edText.addEventListener('input', () => {
        this.ed.modified = true;
        el.edMod.textContent = 'Modified';
      });
      el.edText.addEventListener('keydown', (e) => {
        if (this.vim) {
          this.vim.key(e);
          return;
        }
        if (e.ctrlKey && (e.key === 'o' || e.key === 'O')) {
          e.preventDefault();
          this.edAction('save');
        } else if (e.ctrlKey && (e.key === 'x' || e.key === 'X')) {
          e.preventDefault();
          this.edAction('exit');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.edAction('exit');
        } else if (e.key === 'Tab' && this.ed && this.ed.name !== 'nano') {
          /* allow default tab focus behavior elsewhere */
        }
      });
      if (window.ResizeObserver) {
        new ResizeObserver(() => this.measure()).observe(el.screen);
      }
    }

    newShell() {
      const sh = new LX.Shell();
      this.sh = sh;
      sh.hooks.readLine = (p, o) => this.readLine(p, o);
      sh.hooks.edit = (o) => this.openEditor(o);
      sh.hooks.clear = () => this.clear();
      this.measure();
    }
    measure() {
      const el = this.el;
      if (!el || !el.screen.clientWidth) return;
      let probe = this._probe;
      if (!probe) {
        probe = this._probe = document.createElement('span');
        probe.className = 'probe';
        probe.textContent = '0'.repeat(20);
        el.out.appendChild(probe);
      }
      const w = probe.getBoundingClientRect().width / 20;
      const cols = Math.max(24, Math.floor((el.screen.clientWidth - 24) / (w || 8)));
      this.cols = cols;
      if (this.sh) this.sh.cols = cols;
      const rows = Math.max(8, Math.floor(el.screen.clientHeight / 19));
      el.title.textContent = `${this.sh ? this.sh.user : 'learner'} — bash — ${cols}×${rows}`;
      if (probe.parentNode === el.out && this._probeHidden !== true) {
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;pointer-events:none';
        this._probeHidden = true;
      }
    }
    setProfile(p) {
      this.root.dataset.profile = p;
      this.el.profile.value = p;
      if (this.opts.onProfile) this.opts.onProfile(p);
    }
    reset() {
      if (this.mode === 'busy' || this.mode === 'read') this.sh.aborted = true;
      const done = () => {
        this.newShell();
        this.clear();
        this.hist = [];
        this.buffer = '';
        this.welcome();
        this.prompt();
        if (this.opts.onReset) this.opts.onReset();
      };
      if (this.mode === 'busy') setTimeout(done, 120);
      else done();
    }
    /** replace the sandbox with a fresh machine, then run silent setup commands (used by scenario labs) */
    async loadLab(setup, title) {
      if (this.mode === 'busy' || this.mode === 'read') this.sh.aborted = true;
      await new Promise((r) => setTimeout(r, this.mode === 'busy' ? 150 : 0));
      this.newShell();
      this.clear();
      this.hist = [];
      this.buffer = '';
      const sh = this.sh;
      sh.fast = true;
      const sink = { stdout: () => {}, stderr: () => {} };
      for (const l of setup || []) await sh.run(l, sink);
      sh.fast = false;
      sh.log.length = 0;
      this.print(`\x1b[2m[ Lab loaded: ${title || 'scenario'} ]\x1b[0m\n\n`);
      this.prompt();
    }
    welcome() {
      this.print('\x1b[2mWelcome to the Linux Academy sandbox. Everything here is safe to try and break!\nDistribution: Ubuntu 24.04 LTS (simulated)  ·  Type \x1b[0m\x1b[1mhelp\x1b[0m\x1b[2m for a list of commands, or click a  ▶ Run  button in the lesson.\x1b[0m\n\n');
    }
    clear() {
      this.el.out.innerHTML = '';
      this._probe = null;
      this._probeHidden = false;
      this.ansi = newState();
      this.measure();
    }
    focus() {
      if (this.mode === 'busy') this.el.screen.focus({ preventScroll: true });
      else this.el.input.focus({ preventScroll: true });
    }
    scroll() {
      const s = this.el.screen;
      s.scrollTop = s.scrollHeight;
    }
    print(text) {
      if (!text) return;
      const html = ansiToHtml(text, this.ansi);
      const span = document.createElement('span');
      span.innerHTML = html;
      this.el.out.appendChild(span);
      // keep DOM small
      while (this.el.out.childNodes.length > 2500) this.el.out.removeChild(this.el.out.firstChild);
      this.scroll();
    }
    setMode(m) {
      this.mode = m;
      this.root.classList.toggle('is-busy', m === 'busy');
      this.el.line.style.display = m === 'busy' ? 'none' : '';
      if (m === 'busy') this.el.screen.focus({ preventScroll: true });
    }
    prompt() {
      const n = this.sh.takeNotices();
      if (n) this.print(n);
      this.setMode('prompt');
      this.ansi = newState();
      this.psText = this.buffer ? '> ' : this.sh.prompt();
      this.el.ps.innerHTML = ansiToHtml(this.psText, newState());
      this.el.input.type = 'text';
      this.el.input.value = '';
      this.el.ghost.textContent = '';
      this.hi = -1;
      this.draft = '';
      this.measure();
      this.scroll();
      if (this._refocus) this.focus();
    }
    onInput() {
      if (this.search) {
        this.search.q = this.el.input.value;
        this.search.from = this.hist.length;
        this.searchStep(false);
      }
      this.el.ghost.textContent = '';
    }
    echoLine(text) {
      this.print(this.psText + text + '\n');
    }

    /* ---------- keyboard ---------- */
    onKey(e) {
      if (e._termHandled) return; // the same keydown bubbles from the input to the screen: handle it once
      e._termHandled = true;
      const k = e.key;
      const ctrl = e.ctrlKey || e.metaKey && false;
      const el = this.el;
      if (this.mode === 'busy') {
        if (ctrl && (k === 'c' || k === 'C')) {
          e.preventDefault();
          this.print('^C\n');
          this.sh.aborted = 'INT';
        } else if (ctrl && (k === 'z' || k === 'Z')) {
          e.preventDefault();
          this.print('^Z\n');
          this.sh.aborted = 'TSTP';
        }
        return;
      }
      if (this.search) {
        if (k === 'Escape' || (ctrl && (k === 'g' || k === 'c'))) {
          e.preventDefault();
          this.endSearch(false);
        } else if (ctrl && (k === 'r' || k === 'R')) {
          e.preventDefault();
          this.searchStep(true);
        } else if (k === 'Enter') {
          e.preventDefault();
          const m = this.search.match;
          this.endSearch(true);
          if (m !== null) this.submit();
        }
        return;
      }
      if (k === 'Enter') {
        e.preventDefault();
        this.submit();
        return;
      }
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        if (this.mode === 'read') return;
        e.preventDefault();
        if (this.hi === -1) this.draft = el.input.value;
        if (k === 'ArrowUp') this.hi = Math.min(this.hist.length - 1, this.hi + 1);
        else this.hi = Math.max(-1, this.hi - 1);
        const v = this.hi === -1 ? this.draft : this.hist[this.hist.length - 1 - this.hi];
        el.input.value = (v || '').split('\n').pop();
        el.input.setSelectionRange(el.input.value.length, el.input.value.length);
        return;
      }
      if (k === 'Tab') {
        e.preventDefault();
        if (this.mode === 'prompt') this.complete();
        return;
      }
      if (ctrl) {
        const lk = k.length === 1 ? k.toLowerCase() : k;
        if (lk === 'c') {
          e.preventDefault();
          if (this.mode === 'read') {
            this.finishRead(null, '^C');
            this.sh.aborted = 'INT';
            return;
          }
          this.print(this.psText + el.input.value + '^C\n');
          this.buffer = '';
          this.prompt();
        } else if (lk === 'l') {
          e.preventDefault();
          this.clear();
          if (this.mode === 'prompt') this.prompt();
        } else if (lk === 'a') {
          e.preventDefault();
          el.input.setSelectionRange(0, 0);
        } else if (lk === 'e') {
          e.preventDefault();
          el.input.setSelectionRange(el.input.value.length, el.input.value.length);
        } else if (lk === 'u') {
          e.preventDefault();
          const p = el.input.selectionStart;
          el.input.value = el.input.value.slice(p);
          el.input.setSelectionRange(0, 0);
        } else if (lk === 'k') {
          e.preventDefault();
          el.input.value = el.input.value.slice(0, el.input.selectionStart);
        } else if (lk === 'w') {
          e.preventDefault();
          const p = el.input.selectionStart;
          const before = el.input.value.slice(0, p).replace(/\s*\S+\s*$/, '');
          el.input.value = before + el.input.value.slice(p);
          el.input.setSelectionRange(before.length, before.length);
        } else if (lk === 'd') {
          e.preventDefault();
          if (this.mode === 'read') this.finishRead(null, '');
          else if (!el.input.value && this.sh.recovery) {
            el.input.value = 'exit';
            this.submit();
          } else if (!el.input.value) {
            this.echoLine('exit');
            this.print('\x1b[2mlogout (the sandbox window stays open so you can keep practicing)\x1b[0m\n');
            this.prompt();
          }
        } else if (lk === 'r') {
          e.preventDefault();
          if (this.mode === 'prompt') this.startSearch();
        }
      }
    }
    onPaste(e) {
      const t = (e.clipboardData || window.clipboardData).getData('text');
      if (!t || !t.includes('\n')) return;
      e.preventDefault();
      const lines = t.replace(/\r/g, '').split('\n');
      if (lines[lines.length - 1] === '') lines.pop();
      (async () => {
        for (const l of lines) {
          this.el.input.value = this.el.input.value + l;
          await this.submit();
        }
      })();
    }
    startSearch() {
      this.search = { q: '', match: null, from: this.hist.length };
      this.el.ps.textContent = "(reverse-i-search)`': ";
      this.el.input.value = '';
      this.el.ghost.textContent = '';
    }
    searchStep(older) {
      const s = this.search;
      let start = older ? s.from - 1 : s.from - 1;
      for (let i = start; i >= 0; i--) {
        if (s.q && this.hist[i].includes(s.q)) {
          s.from = i;
          s.match = this.hist[i];
          this.el.ps.textContent = `(reverse-i-search)\`${s.q}': `;
          this.el.ghost.textContent = '  →  ' + s.match;
          return;
        }
      }
      s.match = null;
      this.el.ps.textContent = `(failed reverse-i-search)\`${s.q}': `;
      this.el.ghost.textContent = '';
    }
    endSearch(accept) {
      const m = this.search.match;
      this.search = null;
      this.el.ps.innerHTML = ansiToHtml(this.psText, newState());
      this.el.ghost.textContent = '';
      this.el.input.value = accept && m ? m : '';
    }
    complete() {
      const el = this.el;
      const val = el.input.value;
      const pos = el.input.selectionStart;
      const before = val.slice(0, pos);
      const after = val.slice(pos);
      const { start, options } = this.sh.completions(before);
      if (!options.length) return;
      const word = before.slice(start);
      const now = Date.now();
      const common = options.reduce((a, b) => {
        let i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) i++;
        return a.slice(0, i);
      });
      if (options.length === 1 || common.length > word.length) {
        el.input.value = before.slice(0, start) + common + after;
        const np = start + common.length;
        el.input.setSelectionRange(np, np);
        return;
      }
      if (now - this.lastTab < 900 || true) {
        this.echoLine(val);
        const names = options.map((o) => o.trim());
        const w = Math.max(...names.map((n) => n.length)) + 2;
        const per = Math.max(1, Math.floor(this.cols / w));
        const rows = Math.ceil(names.length / per);
        let txt = '';
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < per; c++) {
            const n = names[c * rows + r];
            if (n !== undefined) txt += n.padEnd(w);
          }
          txt = txt.replace(/\s+$/, '') + '\n';
        }
        this.print(txt);
        this.prompt();
        el.input.value = val;
        el.input.setSelectionRange(val.length, val.length);
      }
      this.lastTab = now;
    }

    /* ---------- running ---------- */
    async submit() {
      if (this.mode === 'read') {
        const v = this.el.input.value;
        this.finishRead(v, this.readSecret ? '' : v);
        return;
      }
      if (this.mode !== 'prompt') return;
      const line = this.el.input.value;
      this.echoLine(line);
      this.buffer += (this.buffer ? '\n' : '') + line;
      if (!this.sh.isComplete(this.buffer)) {
        this.prompt();
        return;
      }
      const text = this.buffer;
      this.buffer = '';
      if (!text.trim()) {
        this.prompt();
        return;
      }
      this.hist.push(text);
      await this.runText(text);
    }
    async runText(text) {
      this._refocus = this.root.contains(document.activeElement);
      this.setMode('busy');
      let rec = null;
      try {
        rec = await this.sh.run(text, { stdout: (s) => this.print(s), stderr: (s) => this.print(s) });
      } catch (err) {
        if (err instanceof LX.AbortSig) {
          this.sh.aborted = false;
        } else {
          this.print('\x1b[31mInternal sandbox error: ' + (err && err.message) + '\x1b[0m\n');
          console.error(err);
        }
      }
      this.sh.aborted = false;
      if (this.out_endsWithoutNewline()) this.print('\n');
      this.prompt();
      if (rec && this.opts.onRun) this.opts.onRun(rec, this.sh);
    }
    out_endsWithoutNewline() {
      const o = this.el.out;
      const last = o.lastChild;
      if (!last || last === this._probe) return false;
      const t = last.textContent;
      return t.length > 0 && !t.endsWith('\n');
    }
    /** Type a command into the prompt with a short animation, then run it. */
    async type(cmd, speed) {
      if (this.mode !== 'prompt') return false;
      if (this.search) this.endSearch(false);
      this.el.input.value = '';
      const ms = speed === undefined ? 14 : speed;
      if (ms > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        for (const ch of cmd) {
          this.el.input.value += ch;
          await new Promise((r) => setTimeout(r, ms));
        }
      } else this.el.input.value = cmd;
      await new Promise((r) => setTimeout(r, 120));
      await this.submit();
      return true;
    }
    get isIdle() {
      return this.mode === 'prompt';
    }

    /* ---------- interactive input requested by commands ---------- */
    readLine(promptText, o) {
      return new Promise((resolve) => {
        this.readCb = resolve;
        this.readSecret = !!(o && o.secret);
        this.print(promptText || '');
        this.mode = 'read';
        this.root.classList.remove('is-busy');
        this.el.line.style.display = '';
        this.el.ps.textContent = '';
        this.el.input.type = this.readSecret ? 'password' : 'text';
        this.el.input.value = '';
        this.focus();
        this.scroll();
      });
    }
    finishRead(value, echo) {
      const cb = this.readCb;
      this.readCb = null;
      this.print((echo || '') + '\n');
      this.el.input.type = 'text';
      this.el.input.value = '';
      this.el.line.style.display = 'none';
      this.mode = 'busy';
      this.root.classList.add('is-busy');
      this.el.screen.focus({ preventScroll: true });
      if (cb) cb(value);
    }

    /* ---------- nano / vim ---------- */
    openEditor(o) {
      return new Promise((resolve) => {
        const el = this.el;
        this.ed = { resolve, saved: null, modified: false, name: o.name, readonly: o.readonly, orig: o.content };
        el.edApp.textContent = o.name === 'nano' || o.name === 'pico' ? 'GNU nano 7.2' : 'VIM - Vi IMproved (simple mode)';
        el.edFile.textContent = o.path || 'New Buffer';
        el.edMod.textContent = '';
        el.edMsg.textContent = o.readonly ? '[ File is read-only: you can look but cannot save ]' : o.name === 'nano' || o.name === 'pico' ? 'Type to edit.  ^O saves,  ^X exits.' : 'Simple mode: ^O saves, ^X exits (real vim uses :wq).';
        el.edText.value = o.content;
        el.edAsk.hidden = true;
        el.editor.hidden = false;
        this.root.classList.add('editing');
        setTimeout(() => el.edText.focus(), 0);
        if (/^(vi|vim|view)$/.test(o.name) && this.vimStart) this.vimStart(o);
      });
    }
    edAction(a) {
      const el = this.el;
      const ed = this.ed;
      if (!ed) return;
      const finish = (val) => {
        el.editor.hidden = true;
        this.root.classList.remove('editing');
        this.ed = null;
        ed.resolve(val);
        this.focus();
      };
      if (a === 'save') {
        if (ed.readonly) {
          el.edMsg.textContent = '[ Error writing: Permission denied ]';
          return;
        }
        ed.saved = el.edText.value;
        ed.modified = false;
        el.edMod.textContent = '';
        el.edMsg.textContent = `[ Wrote ${el.edText.value.split('\n').filter((l, i, arr) => !(i === arr.length - 1 && l === '')).length} lines ]`;
      } else if (a === 'exit') {
        if (ed.modified && !ed.readonly) {
          el.edAsk.hidden = false;
        } else finish(ed.saved);
      } else if (a === 'yes') {
        finish(el.edText.value);
      } else if (a === 'no') {
        finish(ed.saved);
      } else if (a === 'back' || a === 'cancel') {
        el.edAsk.hidden = true;
        el.edText.focus();
      }
    }
  }
  LX.TermUI = TermUI;
})();
