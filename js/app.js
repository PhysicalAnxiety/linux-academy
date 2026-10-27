/* Linux Academy: application shell, lessons, practice and quizzes */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const attr = (s) => esc(s).replace(/"/g, '&quot;');

  /* ---------- saved progress (per browser only) ---------- */
  const KEY = 'lx.academy.v1';
  const store = {
    get() {
      try {
        return JSON.parse(localStorage.getItem(KEY)) || {};
      } catch (e) {
        return {};
      }
    },
    set(v) {
      try {
        localStorage.setItem(KEY, JSON.stringify(v));
      } catch (e) {}
    },
  };
  const S = Object.assign({ lang: 'both', profile: 'pro', theme: null, read: {}, missions: {}, quiz: {}, seenWelcome: false }, store.get());
  const save = () => store.set(S);

  /* ---------- tiny markup: `code`, **bold**, {{runnable command}} ---------- */
  function md(s) {
    return String(s)
      .split(/(\{\{.+?\}\}|`[^`]+`|\*\*.+?\*\*)/)
      .map((part) => {
        if (part.startsWith('{{')) {
          const c = part.slice(2, -2);
          return `<code class="run" role="button" tabindex="0" data-run="${attr(c)}" title="Click to run this in the terminal">${esc(c)}</code>`;
        }
        if (part.startsWith('`')) return `<code>${esc(part.slice(1, -1))}</code>`;
        if (part.startsWith('**')) return `<strong>${esc(part.slice(2, -2))}</strong>`;
        return esc(part);
      })
      .join('');
  }
  const one = (en, hi) => `<span class="one"><span class="en">${md(en)}</span><span class="hi">${md(hi)}</span></span>`;
  const both = (o, tag) => `<${tag || 'p'} class="en">${md(o.en)}</${tag || 'p'}><${tag || 'p'} class="hi">${md(o.hi)}</${tag || 'p'}>`;

  const LEVELS = [
    ['Warm-up', 'Warm-up'],
    ['Easy', 'Aasan'],
    ['Easy+', 'Aasan+'],
    ['Medium', 'Medium'],
    ['Medium+', 'Medium+'],
    ['Tricky', 'Thoda tricky'],
    ['Tough', 'Tough'],
    ['Hard', 'Hard'],
    ['Expert', 'Expert'],
    ['Boss level', 'Boss level'],
  ];

  /* ---------- state ---------- */
  let route = { view: 'home', id: null };
  let term = null;
  const quizState = {};
  let toastTimer = null;
  const topics = () => LX.topics;
  const byId = (id) => topics().find((t) => t.id === id);
  const idx = (id) => topics().findIndex((t) => t.id === id);

  function topicStatus(t) {
    const mDone = t.missions.filter((m) => S.missions[m.id]).length;
    const best = (S.quiz[t.id] && S.quiz[t.id].best) || 0;
    const read = !!S.read[t.id];
    const p = (read ? 0.2 : 0) + 0.3 * (t.missions.length ? mDone / t.missions.length : 0) + 0.5 * (best / 10);
    return { read, mDone, mTotal: t.missions.length, best, p, done: read && mDone === t.missions.length && best >= 7 };
  }
  const overall = () => {
    const ts = topics();
    return ts.length ? ts.reduce((s, t) => s + topicStatus(t).p, 0) / ts.length : 0;
  };

  /* ---------- routing ---------- */
  const TOKEN = /^(learn|practice|quiz)-([a-z0-9-]+)$/;
  function tokenFor(r) {
    return r.view === 'home' ? 'home' : `${r.view}-${r.id}`;
  }
  function parseHash() {
    const h = (location.hash || '').replace(/^#/, '');
    const m = TOKEN.exec(h);
    if (m && byId(m[2])) return { view: m[1], id: m[2] };
    return { view: 'home', id: null };
  }
  function go(view, id, quiet) {
    route = { view, id: id || null };
    render();
    if (!quiet) {
      try {
        history.replaceState(null, '', '#' + tokenFor(route));
      } catch (e) {
        try {
          location.hash = tokenFor(route);
        } catch (e2) {}
      }
    }
    const win = $('#win');
    win.classList.remove('side-open');
    if (window.innerWidth < 1180 && view !== 'quiz') win.classList.remove('term-open');
  }

  /* ---------- chrome ---------- */
  const ICON = {
    side: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="2.5" y="4" width="15" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.5v11" stroke="currentColor" stroke-width="1.5"/></svg>',
    moon: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    term: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m6 8 2.5 2L6 12M10.5 12.5H14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  function renderShell() {
    $('#app').innerHTML = `
    <div class="desk"><div class="win" id="win" data-lang="${S.lang}">
      <header class="titlebar">
        <div class="lights" role="group" aria-label="Window buttons">
          <button class="light red" data-act="home" aria-label="Close lesson and go to the course map" title="Close: back to the course map"></button>
          <button class="light yellow" data-act="toggle-term" aria-label="Show or hide the terminal" title="Minimise: hide / show the terminal"></button>
          <button class="light green" data-act="focus" aria-label="Focus mode" title="Zoom: hide the lesson list for more room"></button>
        </div>
        <button class="tool-btn only-narrow" data-act="toggle-side" aria-label="Show lessons list" title="Lessons">${ICON.side}</button>
        <div class="win-title" id="win-title">Linux Academy</div>
        <div class="tools">
          <div class="seg" role="group" aria-label="Language">
            <button data-lang="en" aria-pressed="${S.lang === 'en'}">English</button>
            <button data-lang="hi" aria-pressed="${S.lang === 'hi'}">Hinglish</button>
            <button data-lang="both" aria-pressed="${S.lang === 'both'}">Both</button>
          </div>
          <button class="tool-btn" data-act="theme" aria-label="Switch light or dark appearance" title="Light / dark">${ICON.moon}</button>
        </div>
      </header>
      <nav class="tabbar" id="tabbar" aria-label="Sections"></nav>
      <div class="body">
        <aside class="side" id="side" aria-label="Lessons"></aside>
        <main class="main" id="main" tabindex="-1"></main>
        <section class="term" id="term" data-profile="${S.profile}" aria-label="Linux sandbox terminal"></section>
      </div>
      <button class="fab only-narrow" data-act="toggle-term" aria-label="Open the terminal">${ICON.term}<span>Terminal</span></button>
      <div class="scrim" data-act="scrim"></div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
    </div></div>`;
  }

  function renderSide() {
    const ts = topics();
    const pct = Math.round(overall() * 100);
    $('#side').innerHTML = `
      <div class="side-h">${one('Course', 'Course')}</div>
      <button class="side-item ${route.view === 'home' ? 'on' : ''}" data-go="home"><span class="side-no">~</span><span class="side-t">${one('Course map', 'Course map')}</span></button>
      ${(LX.parts || [{ n: 1, en: 'Lessons', hi: 'Lessons' }])
        .map((pt) => {
          const list = ts.filter((t) => (t.part || 1) === pt.n);
          if (!list.length) return '';
          const done = list.filter((t) => topicStatus(t).done).length;
          return `<div class="side-h">${one(pt.en, pt.hi)} <span class="side-cnt">${done}/${list.length}</span></div>` + list
            .map((t) => {
              const st = topicStatus(t);
              return `<button class="side-item ${route.id === t.id && route.view !== 'home' ? 'on' : ''}" data-go="learn" data-id="${t.id}">
            <span class="side-no">${String(t.no).padStart(2, '0')}</span>
            <span class="side-t">${one(t.title.en, t.title.hi)}</span>
            <span class="ring ${st.done ? 'full' : ''}" style="--p:${Math.round(st.p * 100)}" aria-label="${Math.round(st.p * 100)}% done">${st.done ? ICON.check : ''}</span>
          </button>`;
            })
            .join('');
        })
        .join('')}
      <div class="side-foot">
        <div class="meter"><span style="width:${pct}%"></span></div>
        <div class="side-pct">${one(`${pct}% of the course done`, `Course ka ${pct}% complete`)}</div>
        <button class="linkbtn" id="reset-progress" data-act="reset-progress">${one('Erase my progress', 'Progress mitao')}</button>
      </div>`;
  }

  function renderTabs() {
    const t = route.id && byId(route.id);
    let html = `<button class="tab ${route.view === 'home' ? 'on' : ''}" data-go="home"><span class="tab-dot"></span>${one('Home', 'Home')}</button>`;
    if (t) {
      html += `<button class="tab ${route.view === 'learn' ? 'on' : ''}" data-go="learn" data-id="${t.id}">${one('Learn', 'Seekho')}</button>
      <button class="tab ${route.view === 'practice' ? 'on' : ''}" data-go="practice" data-id="${t.id}">${one('Practice', 'Practice')}</button>
      <button class="tab ${route.view === 'quiz' ? 'on' : ''}" data-go="quiz" data-id="${t.id}">${one('Quiz', 'Quiz')}</button>`;
    }
    $('#tabbar').innerHTML = html;
    const title = t ? `Linux Academy — Lesson ${t.no}: ${t.title.en}` : 'Linux Academy — Course map';
    $('#win-title').textContent = title;
    document.title = 'Linux Academy';
  }

  /* ---------- views ---------- */
  function render() {
    const win = $('#win');
    win.dataset.view = route.view;
    win.classList.toggle('no-term', route.view === 'quiz');
    renderSide();
    renderTabs();
    const main = $('#main');
    let html;
    if (route.view === 'home') html = viewHome();
    else if (route.view === 'learn') html = viewLearn(byId(route.id));
    else if (route.view === 'practice') html = viewPractice(byId(route.id));
    else html = viewQuiz(byId(route.id));
    main.innerHTML = html;
    main.scrollTop = 0;
    if (route.view === 'learn') observeEnd();
    if (route.view === 'quiz') afterQuizRender();
  }

  const statChip = (t) => {
    const st = topicStatus(t);
    return `<span class="chip ${st.read ? 'ok' : ''}">${st.read ? ICON.check : ''}${one('Lesson', 'Lesson')}</span><span class="chip ${st.mDone === st.mTotal && st.mTotal ? 'ok' : ''}">${one(`Missions ${st.mDone}/${st.mTotal}`, `Missions ${st.mDone}/${st.mTotal}`)}</span><span class="chip ${st.best >= 7 ? 'ok' : ''}">${one(`Quiz ${st.best ? st.best + '/10' : '–'}`, `Quiz ${st.best ? st.best + '/10' : '–'}`)}</span>`;
  };

  function skillsSection() {
    const sk = LX.skills || [];
    if (!sk.length) return '';
    const rows = sk.map((k) => {
      const ts = k.ids.map(byId).filter(Boolean);
      const p = ts.length ? ts.reduce((a, t) => a + topicStatus(t).p, 0) / ts.length : 0;
      return { k, p, done: ts.length && ts.every((t) => topicStatus(t).done) };
    });
    const total = rows.reduce((a, r) => a + r.p, 0) / rows.length;
    const ready = total >= 0.8;
    return `<section class="skills">
        <h2 class="bi-h"><span class="en">Are you job-ready? Your skills checklist</span><span class="hi">Kya tum job-ready ho? Tumhari skills ki list</span></h2>
        <div class="bi"><p class="en">These are the things a junior Linux admin or DevOps engineer is expected to do on day one. Each bar fills as you finish its lessons, missions and quizzes.</p><p class="hi">Ye wo cheezein hain jo ek junior Linux admin ya DevOps engineer se pehle din expect ki jati hain. Jaise jaise lessons, missions aur quizzes poore karoge, har bar bharegi.</p></div>
        <div class="skill-meter"><div class="meter"><span style="width:${Math.round(total * 100)}%"></span></div><strong>${Math.round(total * 100)}%</strong> ${ready ? one('You are interview-ready. Go apply!', 'Tum interview-ready ho. Apply karo!') : one('job-ready', 'job-ready')}</div>
        <ul class="skill-list">${rows
          .map((r) => `<li class="${r.done ? 'ok' : ''}"><span class="sk-name">${one(r.k.en, r.k.hi)}</span><span class="sk-bar"><i style="width:${Math.round(r.p * 100)}%"></i></span><span class="sk-pct">${Math.round(r.p * 100)}%</span></li>`)
          .join('')}</ul>
      </section>`;
  }

  function viewHome() {
    const ts = topics();
    const next = ts.find((t) => !topicStatus(t).done) || ts[0];
    const started = Object.keys(S.read).length || Object.keys(S.missions).length || Object.keys(S.quiz).length;
    const now = new Date();
    const stamp = now.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
    return `<div class="page home">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">${one('Linux Academy · from zero to junior sysadmin', 'Linux Academy · zero se junior sysadmin tak')}</p>
          <h1 class="bi-h"><span class="en">Learn Linux by typing it.</span><span class="hi">Linux seekho, khud type karke.</span></h1>
          <div class="bi lead">
            <p class="en">A friendly, hands-on course that goes from your very first command to the skills a junior Linux admin or DevOps engineer uses on the job. Every idea is explained as if you were ten years old, in English and Hinglish, then you try it in a real-feeling terminal next to the lesson.</p>
            <p class="hi">Ek friendly, hands-on course jo tumhare pehle command se le jata hai wahan tak jahan ek junior Linux admin ya DevOps engineer kaam karta hai. Har idea aise samjhaya gaya hai jaise tum das saal ke ho, English aur Hinglish dono mein, phir bagal ke terminal mein khud try karte ho.</p>
          </div>
          <div class="cta-row">
            <button class="btn primary" data-go="learn" data-id="${next.id}">${started ? one(`Continue: ${next.title.en}`, `Aage badho: ${next.title.hi}`) : one('Start Lesson 1', 'Lesson 1 shuru karo')}</button>
            <button class="btn" data-act="open-term">${one('Open the terminal', 'Terminal kholo')}</button>
          </div>
        </div>
        <div class="hero-term" aria-hidden="true"><pre><span class="d">Last login: ${esc(stamp)} on ttys000</span>
<span class="u">learner@linux-school</span>:<span class="p">~</span>$ whoami
future-linux-pro
<span class="u">learner@linux-school</span>:<span class="p">~</span>$ echo "Namaste, Linux!"
Namaste, Linux!
<span class="u">learner@linux-school</span>:<span class="p">~</span>$ ls
<span class="p">Desktop</span>  <span class="p">Documents</span>  <span class="p">Downloads</span>  poem.txt
<span class="u">learner@linux-school</span>:<span class="p">~</span>$ <span class="cursor"></span></pre></div>
      </section>

      <section class="how">
        <h2 class="bi-h"><span class="en">How each lesson works</span><span class="hi">Har lesson kaise chalta hai</span></h2>
        <div class="how-grid">
          <article><span class="step-n">1</span><h3>${one('Learn', 'Seekho')}</h3><div class="bi"><p class="en">Short, kid-simple explanations with stories and real examples.</p><p class="hi">Chhote, bachchon jaise simple explanations, kahaniyon aur real examples ke saath.</p></div></article>
          <article><span class="step-n">2</span><h3>${one('Practice', 'Practice')}</h3><div class="bi"><p class="en">Click ▶ Run or type it yourself. Finish 3 missions in the live terminal.</p><p class="hi">▶ Run dabao ya khud type karo. Live terminal mein 3 missions poore karo.</p></div></article>
          <article><span class="step-n">3</span><h3>${one('Quiz', 'Quiz')}</h3><div class="bi"><p class="en">10 questions. Each one is one level harder, from warm-up to boss level.</p><p class="hi">10 sawaal. Har sawaal pichle se ek level mushkil, warm-up se boss level tak.</p></div></article>
        </div>
      </section>

      ${skillsSection()}

      <section class="map">
        <h2 class="bi-h"><span class="en">The course map · ${ts.length} lessons in ${(LX.parts || []).filter((pt) => ts.some((t) => (t.part || 1) === pt.n)).length} parts</span><span class="hi">Course ka naksha · ${(LX.parts || []).filter((pt) => ts.some((t) => (t.part || 1) === pt.n)).length} parts mein ${ts.length} lessons</span></h2>
        ${(LX.parts || [{ n: 1, en: 'Lessons', hi: 'Lessons', blurbEn: '', blurbHi: '' }])
          .map((pt) => {
            const list = ts.filter((t) => (t.part || 1) === pt.n);
            if (!list.length) return '';
            return `<div class="part-head"><h3 class="bi-h"><span class="en">${esc(pt.en)}</span><span class="hi">${esc(pt.hi)}</span></h3><div class="bi small"><p class="en">${esc(pt.blurbEn)}</p><p class="hi">${esc(pt.blurbHi)}</p></div></div>
        <div class="cards">${list
          .map((t) => {
            const st = topicStatus(t);
            return `<button class="card" data-go="learn" data-id="${t.id}">
                <span class="card-top"><kbd>${esc(t.key)}</kbd><span class="card-no">${one('Lesson', 'Lesson')} ${String(t.no).padStart(2, '0')}</span><span class="ring ${st.done ? 'full' : ''}" style="--p:${Math.round(st.p * 100)}">${st.done ? ICON.check : ''}</span></span>
                <span class="card-t">${one(t.title.en, t.title.hi)}</span>
                <span class="card-b bi"><span class="en">${md(t.blurb.en)}</span><span class="hi">${md(t.blurb.hi)}</span></span>
                <span class="card-meta">${statChip(t)}<span class="mins">${t.mins} min</span></span>
              </button>`;
          })
          .join('')}</div>`;
          })
          .join('')}
      </section>

      <section class="safe">
        <h2 class="bi-h"><span class="en">Is this safe?</span><span class="hi">Kya ye safe hai?</span></h2>
        <div class="bi"><p class="en">Yes. The terminal here is a pretend Linux computer that lives inside this page. Nothing you type can touch your real files. If you break something, press <strong>Reset sandbox</strong> and everything is fresh again.</p><p class="hi">Haan. Yahan ka terminal ek nakli Linux computer hai jo isi page ke andar rehta hai. Tum jo bhi type karo, tumhari asli files ko kuch nahi hoga. Kuch bigad jaye to <strong>Reset sandbox</strong> dabao, sab dobara naya ho jayega.</p></div>
      </section>
    </div>`;
  }

  /* ---- block renderers ---- */
  const CO = {
    story: ['Story time', 'Kahani time'],
    tip: ['Pro tip', 'Pro tip'],
    warn: ['Careful!', 'Dhyaan se!'],
    fun: ['Fun fact', 'Mazedaar baat'],
    big: ['Big idea', 'Bada idea'],
    job: ['On the job', 'Naukri mein'],
  };
  function runBtn(c, label) {
    return `<button class="run-btn" data-run="${attr(Array.isArray(c) ? (c.some((x) => x.includes('\n')) ? c.join('\u241E') : c.join('\n')) : c)}" ${Array.isArray(c) ? 'data-multi="1"' : ''} aria-label="Run in the terminal">${label || '▶ Run'}</button>`;
  }
  const BLOCKS = {
    h: (b) => `<h2 class="bi-h"><span class="en">${md(b.en)}</span><span class="hi">${md(b.hi)}</span></h2>`,
    p: (b) => `<div class="bi">${both(b)}</div>`,
    cmd: (b) => {
      const lines = Array.isArray(b.c) ? b.c : [b.c];
      return `<div class="cmdblock"><div class="cmdline"><pre class="cmdtext">${lines.map((l) => `<span class="prompt">$ </span>${esc(l)}`).join('\n')}</pre>${runBtn(b.c)}</div><div class="bi small">${both(b)}</div></div>`;
    },
    table: (b) => `<div class="table-wrap"><table class="cheat"><thead><tr><th>${one('Command', 'Command')}</th><th>${one(b.headEn || 'What it does', b.headHi || 'Ye kya karta hai')}</th></tr></thead><tbody>${b.rows
      .map((r) => `<tr><td>${b.run ? `<code class="run" role="button" tabindex="0" data-run="${attr(r[0])}" title="Click to run in the terminal">${esc(r[0])}</code>` : `<code>${esc(r[0])}</code>`}</td><td class="bi"><span class="en">${md(r[1])}</span><span class="hi">${md(r[2])}</span></td></tr>`)
      .join('')}</tbody></table></div>`,
    anat: (b) => `<figure class="anat"><div class="anat-cmd" aria-hidden="true">${b.parts.map((p) => `<span class="tok k-${p[1]}">${esc(p[0])}</span>`).join(' ')}</div><figcaption>${b.parts
      .map((p) => `<div class="lg"><span class="tok k-${p[1]}">${esc(p[0])}</span><span class="bi"><span class="en">${md(p[2])}</span><span class="hi">${md(p[3])}</span></span></div>`)
      .join('')}</figcaption></figure>`,
    pre: (b) => `<pre class="code">${esc(b.text)}</pre>`,
    think: (b) => `<details class="think"><summary><span class="en">Think first: ${md(b.qEn)}</span><span class="hi">Pehle socho: ${md(b.qHi)}</span></summary><div class="bi"><p class="en">${md(b.aEn)}</p><p class="hi">${md(b.aHi)}</p></div></details>`,
    steps: (b) => `<ol class="steps">${b.items.map((i) => `<li class="bi"><span class="en">${md(i[0])}</span><span class="hi">${md(i[1])}</span></li>`).join('')}</ol>`,
    try: (b) => `<div class="tryit"><div class="tryit-h">${one('Try it yourself', 'Khud try karo')}</div><div class="bi small">${both(b)}</div><div class="try-list">${b.cmds.map((c) => `<div class="try-row"><code>${esc(Array.isArray(c) ? c.join('; ') : c)}</code>${runBtn(c)}</div>`).join('')}</div></div>`,
  };
  for (const k of Object.keys(CO)) {
    BLOCKS[k] = (b) => `<aside class="co co-${k}"><div class="co-h">${one(CO[k][0], CO[k][1])}</div><div class="bi">${both(b)}</div></aside>`;
  }

  function viewLearn(t) {
    const i = idx(t.id);
    const nxt = topics()[i + 1];
    return `<article class="page lesson">
      <header class="lh">
        <p class="eyebrow">${one('Lesson', 'Lesson')} ${String(t.no).padStart(2, '0')} · ${t.mins} min</p>
        <h1 class="bi-h"><span class="en">${md(t.title.en)}</span><span class="hi">${md(t.title.hi)}</span></h1>
        <div class="bi lead">${both(t.blurb)}</div>
      </header>
      ${t.blocks.map((b) => BLOCKS[b.k](b)).join('\n')}
      <div id="end-sentinel"></div>
      <section class="next">
        <h2 class="bi-h"><span class="en">Nice work. What next?</span><span class="hi">Badhiya! Ab aage kya?</span></h2>
        <div class="cta-row">
          <button class="btn primary" data-go="practice" data-id="${t.id}">${one('Do the 3 missions', '3 missions karo')}</button>
          <button class="btn" data-go="quiz" data-id="${t.id}">${one('Take the quiz', 'Quiz do')}</button>
          ${nxt ? `<button class="btn ghost" data-go="learn" data-id="${nxt.id}">${one(`Next lesson: ${nxt.title.en}`, `Agla lesson: ${nxt.title.hi}`)}</button>` : ''}
        </div>
      </section>
    </article>`;
  }

  function viewPractice(t) {
    const st = topicStatus(t);
    return `<div class="page practice">
      <header class="lh">
        <p class="eyebrow">${one('Practice', 'Practice')} · ${one('Lesson', 'Lesson')} ${String(t.no).padStart(2, '0')}</p>
        <h1 class="bi-h"><span class="en">Missions: ${md(t.title.en)}</span><span class="hi">Missions: ${md(t.title.hi)}</span></h1>
        <div class="bi lead"><p class="en">Do these in the terminal. The mission ticks itself the moment you get it right. Stuck? Open the hint, and if you are still stuck, ask to be shown.</p><p class="hi">Ye terminal mein karo. Jaise hi tum sahi karoge, mission apne aap tick ho jayega. Atak gaye? Hint kholo, phir bhi na ho to dikhane ko bolo.</p></div>
        <p class="mcount">${one(`${st.mDone} of ${st.mTotal} missions done`, `${st.mTotal} mein se ${st.mDone} missions poore`)}</p>
      </header>
      <ol class="missions">
        ${t.missions
          .map(
            (m, n) => `<li class="mission ${S.missions[m.id] ? 'done' : ''}" id="m-${m.id}">
          <div class="m-badge" aria-label="${S.missions[m.id] ? 'Done' : 'Not done yet'}">${S.missions[m.id] ? ICON.check : n + 1}</div>
          <div class="m-body">
            <h3 class="bi-h"><span class="en">${md(m.title.en)}</span><span class="hi">${md(m.title.hi)}</span></h3>
            <div class="bi">${both(m.desc)}</div>
            ${m.lab ? `<div class="lab-box"><div class="bi small"><p class="en"><strong>Lab:</strong> ${md(m.lab.en)}</p><p class="hi"><strong>Lab:</strong> ${md(m.lab.hi)}</p></div><button class="btn small primary" data-act="lab" data-m="${m.id}">${one('Load this broken machine', 'Ye kharab machine load karo')}</button></div>` : ''}
            <div class="m-actions">
              <button class="btn small" data-act="hint" data-m="${m.id}" aria-expanded="false">${one('Show hint', 'Hint dikhao')}</button>
              <button class="btn small ghost" data-act="solve" data-m="${m.id}" aria-expanded="false">${one('Show me how', 'Dikha do kaise')}</button>
              <button class="btn small ghost only-narrow" data-act="open-term">${one('Open terminal', 'Terminal kholo')}</button>
            </div>
            <div class="m-hint" id="hint-${m.id}" hidden><div class="bi">${both(m.hint)}</div></div>
            <div class="m-solve" id="solve-${m.id}" hidden><p class="small-label">${one('Type these, one after the other:', 'Ye ek ke baad ek type karo:')}</p>${m.solve.map((c) => `<div class="try-row"><code>${esc(c)}</code>${runBtn(c)}</div>`).join('')}</div>
          </div>
        </li>`
          )
          .join('')}
      </ol>
      <section class="next">
        <div class="cta-row">
          <button class="btn primary" data-go="quiz" data-id="${t.id}">${one('Ready? Take the quiz', 'Ready? Quiz do')}</button>
          <button class="btn ghost" data-go="learn" data-id="${t.id}">${one('Back to the lesson', 'Lesson par wapas')}</button>
        </div>
      </section>
    </div>`;
  }

  /* ---------- quiz ---------- */
  function shuffle(n, seed) {
    const a = Array.from({ length: n }, (_, i) => i);
    let s = seed;
    const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function qs(t) {
    if (!quizState[t.id]) quizState[t.id] = { phase: 'intro', i: 0, results: [], tries: 0, seed: 1, locked: false, last: null, shown: false };
    return quizState[t.id];
  }
  const levelMeter = (lvl) => `<span class="lvl-meter" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i class="${i < lvl ? 'on' : ''}" style="--i:${i}"></i>`).join('')}</span>`;

  function viewQuiz(t) {
    const q = qs(t);
    const best = (S.quiz[t.id] && S.quiz[t.id].best) || 0;
    if (q.phase === 'intro') {
      return `<div class="page quiz">
        <header class="lh">
          <p class="eyebrow">${one('Quiz', 'Quiz')} · ${one('Lesson', 'Lesson')} ${String(t.no).padStart(2, '0')}</p>
          <h1 class="bi-h"><span class="en">Quiz: ${md(t.title.en)}</span><span class="hi">Quiz: ${md(t.title.hi)}</span></h1>
          <div class="bi lead"><p class="en">Ten questions. Question 1 is a warm-up and every question after it is exactly one level harder, up to the boss level at question 10. Some are multiple choice. Others ask you to type the command yourself, and we run it for real to check.</p><p class="hi">Das sawaal. Sawaal 1 warm-up hai aur uske baad har sawaal theek ek level mushkil, sawaal 10 par boss level. Kuch multiple choice hain. Baaki mein tumhe command khud type karni hai, aur hum use sach mein chala kar check karte hain.</p></div>
        </header>
        <div class="ladder" aria-label="Difficulty ladder">${LEVELS.map((l, i) => `<div class="rung" style="--i:${i}"><span class="rung-n">${i + 1}</span><span class="rung-l">${one(l[0], l[1])}</span></div>`).join('')}</div>
        <div class="cta-row"><button class="btn primary" data-act="quiz-start">${one(best ? 'Try again' : 'Start the quiz', best ? 'Dobara try karo' : 'Quiz shuru karo')}</button>
        ${best ? `<span class="chip ok">${ICON.check}${one(`Your best: ${best}/10`, `Tumhara best: ${best}/10`)}</span>` : ''}</div>
      </div>`;
    }
    if (q.phase === 'done') return viewQuizDone(t, q);
    const item = t.quiz[q.i];
    const lv = LEVELS[item.lvl - 1];
    let body = '';
    if (item.type === 'mcq') {
      const order = q.order || (q.order = shuffle(item.opts.length, q.seed * 7919 + q.i * 31 + 5));
      body = `<div class="opts" role="group" aria-label="Choices">${order
        .map((oi, k) => {
          let cls = '';
          if (q.locked) cls = oi === item.a ? 'right' : q.picked === oi ? 'wrong' : 'dim';
          return `<button class="opt ${cls}" data-act="pick" data-o="${oi}" ${q.locked ? 'disabled' : ''}><span class="opt-k">${'ABCD'[k]}</span><span class="opt-t">${md(item.opts[oi])}</span></button>`;
        })
        .join('')}</div>`;
    } else {
      body = `<div class="qterm" data-profile="pro">
        <div class="qterm-bar"><span class="dotr"></span><span class="doty"></span><span class="dotg"></span><span class="qterm-t">learner — bash — your answer</span></div>
        <form class="qterm-line" id="qform" autocomplete="off"><span class="qps"><span class="c2 b">learner@linux-school</span>:<span class="c4 b">~</span>$</span>
        <input id="qinput" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" aria-label="Type your command" ${q.locked ? 'disabled' : ''} value="${attr(q.typed || '')}">
        <button class="btn primary small" type="submit" ${q.locked ? 'disabled' : ''}>${one('Run & check', 'Chalao & check karo')}</button></form>
      </div>`;
    }
    const fb = q.feedback ? `<div class="fb ${q.feedback.kind}" role="status">${q.feedback.html}</div>` : '';
    const showNext = q.locked;
    return `<div class="page quiz">
      <div class="qhead">
        <div class="qcount">${one(`Question ${q.i + 1} of 10`, `Sawaal ${q.i + 1} / 10`)}</div>
        <div class="qlevel">${levelMeter(item.lvl)}<span class="qlevel-t">${one(`Level ${item.lvl} · ${lv[0]}`, `Level ${item.lvl} · ${lv[1]}`)}</span></div>
      </div>
      <div class="qdots" aria-hidden="true">${t.quiz.map((_, i) => `<i class="${i < q.results.length ? (q.results[i].ok ? 'ok' : 'bad') : i === q.i ? 'cur' : ''}"></i>`).join('')}</div>
      <section class="qcard">
        <div class="bi qtext">${both(item.q)}</div>
        ${item.type === 'cmd' ? `<p class="qkind">${one('Type the command, then press Enter.', 'Command type karo, phir Enter dabao.')}</p>` : ''}
        ${body}
        <div id="qout"></div>
        ${fb}
        ${showNext ? `<div class="cta-row"><button class="btn primary" data-act="quiz-next" id="qnext">${q.i === t.quiz.length - 1 ? one('See my score', 'Mera score dekho') : one('Next question', 'Agla sawaal')}</button></div>` : ''}
      </section>
    </div>`;
  }
  function afterQuizRender() {
    const inp = $('#qinput');
    if (inp && !inp.disabled) inp.focus({ preventScroll: true });
    const nx = $('#qnext');
    if (nx) nx.focus({ preventScroll: true });
    const q = qs(byId(route.id));
    if (q.lastOut !== undefined && $('#qout')) $('#qout').innerHTML = q.lastOut;
  }
  function viewQuizDone(t, q) {
    const score = q.results.filter((r) => r.ok).length;
    const msg =
      score >= 9
        ? ['Linux ninja! Almost perfect.', 'Linux ninja! Lagbhag perfect.']
        : score >= 7
        ? ['Great job. You really understand this.', 'Bahut badhiya. Tumhe ye sach mein samajh aaya hai.']
        : score >= 4
        ? ['Good start. Read the lesson once more and try again.', 'Achhi shuruaat. Lesson ek baar aur padho aur dobara try karo.']
        : ['Everybody starts here. Re-read the lesson and practise the missions first.', 'Sab yahin se shuru karte hain. Pehle lesson dobara padho aur missions practice karo.'];
    const nxt = topics()[idx(t.id) + 1];
    return `<div class="page quiz">
      <header class="lh"><p class="eyebrow">${one('Quiz result', 'Quiz result')}</p>
      <div class="score"><span class="score-n">${score}</span><span class="score-d">/ 10</span></div>
      <div class="bi lead"><p class="en">${msg[0]}</p><p class="hi">${msg[1]}</p></div></header>
      <ol class="review">${t.quiz
        .map((it, i) => {
          const r = q.results[i] || {};
          return `<li class="${r.ok ? 'ok' : 'bad'}"><span class="rv-n">${i + 1}</span><span class="rv-lv">${one(`Level ${it.lvl}`, `Level ${it.lvl}`)}</span><span class="rv-q bi"><span class="en">${md(it.q.en)}</span><span class="hi">${md(it.q.hi)}</span></span><span class="rv-s">${r.ok ? one(r.tries > 1 ? 'Right (2nd try)' : 'Right', r.tries > 1 ? 'Sahi (2nd try)' : 'Sahi') : one('Missed', 'Galat')}</span></li>`;
        })
        .join('')}</ol>
      <div class="cta-row"><button class="btn primary" data-act="quiz-start">${one('Try again', 'Dobara try karo')}</button><button class="btn" data-go="learn" data-id="${t.id}">${one('Review the lesson', 'Lesson dobara dekho')}</button>${nxt ? `<button class="btn ghost" data-go="learn" data-id="${nxt.id}">${one(`Next: ${nxt.title.en}`, `Agla: ${nxt.title.hi}`)}</button>` : ''}</div>
    </div>`;
  }

  async function quizSubmitCmd() {
    const t = byId(route.id);
    const q = qs(t);
    const item = t.quiz[q.i];
    const cmd = $('#qinput').value.trim();
    q.typed = cmd;
    if (!cmd) return;
    let ok = false;
    let out = '';
    try {
      const { sh, rec } = await LX.sandbox(item.setup, cmd, item.cwd);
      out = rec.all;
      ok = !!(await item.verify(sh, rec, cmd));
    } catch (e) {
      out = 'Error: ' + e.message;
    }
    q.tries++;
    const outHtml = out ? `<div class="qout-h">${one('What your command printed', 'Tumhari command ne ye print kiya')}</div><pre class="qout">${LX.ansiToHtml(out.slice(0, 1800))}</pre>` : `<div class="qout-h">${one('Your command printed nothing (that is fine: many commands are silent when they work).', 'Tumhari command ne kuch print nahi kiya (ye theek hai: kaam karne par kai commands chup rehti hain).')}</div>`;
    q.lastOut = outHtml;
    if (ok) {
      q.results[q.i] = { ok: true, tries: q.tries };
      q.locked = true;
      q.feedback = { kind: 'ok', html: `<strong>${one('Correct!', 'Sahi jawab!')}</strong><div class="bi">${both(item.why)}</div>` };
    } else if (q.tries >= 2) {
      q.results[q.i] = { ok: false, tries: q.tries };
      q.locked = true;
      q.feedback = { kind: 'bad', html: `<strong>${one('Not this time.', 'Is baar nahi.')}</strong> ${one('One answer that works:', 'Ek answer jo chalta hai:')} <code>${esc(item.sample)}</code><div class="bi">${both(item.why)}</div>` };
    } else {
      q.feedback = { kind: 'warn', html: `<strong>${one('Not quite. Have another go.', 'Bilkul sahi nahi. Ek aur try karo.')}</strong>${item.hint ? `<div class="bi"><p class="en">Hint: ${md(item.hint.en)}</p><p class="hi">Hint: ${md(item.hint.hi)}</p></div>` : ''}<button class="linkbtn" data-act="quiz-giveup">${one('Show me the answer', 'Answer dikha do')}</button>` };
    }
    render();
    const inp = $('#qinput');
    if (inp && !inp.disabled) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }
  function quizPick(o) {
    const t = byId(route.id);
    const q = qs(t);
    const item = t.quiz[q.i];
    if (q.locked) return;
    q.picked = o;
    q.locked = true;
    const ok = o === item.a;
    q.results[q.i] = { ok, tries: 1 };
    q.feedback = ok ? { kind: 'ok', html: `<strong>${one('Correct!', 'Sahi jawab!')}</strong><div class="bi">${both(item.why)}</div>` } : { kind: 'bad', html: `<strong>${one('Not quite.', 'Bilkul sahi nahi.')}</strong> ${one('The right answer is highlighted.', 'Sahi answer highlight hai.')}<div class="bi">${both(item.why)}</div>` };
    render();
  }
  function quizNext() {
    const t = byId(route.id);
    const q = qs(t);
    if (q.i >= t.quiz.length - 1) {
      q.phase = 'done';
      const score = q.results.filter((r) => r.ok).length;
      const prev = S.quiz[t.id] || { best: 0, attempts: 0 };
      S.quiz[t.id] = { best: Math.max(prev.best, score), last: score, attempts: prev.attempts + 1 };
      save();
    } else {
      q.i++;
      q.tries = 0;
      q.locked = false;
      q.feedback = null;
      q.typed = '';
      q.order = null;
      q.picked = null;
      q.lastOut = undefined;
    }
    render();
  }
  function quizStart() {
    const t = byId(route.id);
    const q = qs(t);
    Object.assign(q, { phase: 'q', i: 0, results: [], tries: 0, locked: false, feedback: null, typed: '', order: null, picked: null, seed: (q.seed || 1) + 1, lastOut: undefined });
    render();
  }
  function quizGiveUp() {
    const t = byId(route.id);
    const q = qs(t);
    const item = t.quiz[q.i];
    q.results[q.i] = { ok: false, tries: q.tries || 1 };
    q.locked = true;
    q.feedback = { kind: 'bad', html: `<strong>${one('Here is one answer that works:', 'Ek answer jo chalta hai:')}</strong> <code>${esc(item.sample)}</code><div class="bi">${both(item.why)}</div>` };
    render();
  }

  /* ---------- terminal glue ---------- */
  function wireTerminal() {
    term = new LX.TermUI($('#term'), {
      onRun: onRun,
      onHide: () => $('#win').classList.remove('term-open'),
      onProfile: (p) => {
        S.profile = p;
        save();
      },
      onReset: () => toast(one('Sandbox reset. Fresh files, fresh start.', 'Sandbox reset ho gaya. Naye files, nayi shuruaat.')),
      noAutofocus: true,
    });
    term.setProfile(S.profile);
    LX.term = term;
  }
  function onRun(rec, sh) {
    const t = route.id && byId(route.id);
    const list = t ? t.missions : [];
    let any = false;
    for (const m of list) {
      if (S.missions[m.id]) continue;
      let ok = false;
      try {
        ok = !!m.check(sh, rec);
      } catch (e) {
        ok = false;
      }
      if (ok) {
        S.missions[m.id] = true;
        any = true;
        toast(`<strong>${one('Mission complete!', 'Mission complete!')}</strong> ${one(m.title.en, m.title.hi)}`, true);
      }
    }
    if (any) {
      save();
      renderSide();
      if (route.view === 'practice') {
        const keepScroll = $('#main').scrollTop;
        render();
        $('#main').scrollTop = keepScroll;
      }
    }
  }
  let termRunBusy = false;
  async function runInTerm(text) {
    if (termRunBusy) {
      toast(one('Another lesson command is still running in the terminal. Wait for it to finish.', 'Terminal mein ek aur lesson command abhi chal raha hai. Use khatam hone do.'));
      return;
    }
    termRunBusy = true;
    try {
      await runInTermInner(text);
    } finally {
      termRunBusy = false;
    }
  }
  async function runInTermInner(text) {
    const win = $('#win');
    if (window.innerWidth < 1180) win.classList.add('term-open');
    win.classList.remove('term-hidden');
    const hereDoc = !text.includes('\u241E') && /^[^\n]*<<-?\s*['"]?[A-Za-z_]\w*['"]?[ \t]*\n/.test(text);
    const lines = text.includes('\u241E') ? text.split('\u241E') : hereDoc ? [text] : text.split('\n');
    const isMulti = lines.length > 1;
    // wait until idle
    for (let n = 0; n < 200 && !term.isIdle; n++) await new Promise((r) => setTimeout(r, 100));
    if (!term.isIdle) {
      toast(one('The terminal is busy. Press Ctrl+C in it first.', 'Terminal busy hai. Pehle usme Ctrl+C dabao.'));
      return;
    }
    if (isMulti && !text.includes('\u241E') && /^(for|while|if|until|function)\b|\(\)\s*\{/.test(lines[0]) ) {
      term.el.input.value = '';
      term.print(term.psText + lines.join('\n> ') + '\n');
      term.hist.push(text);
      await term.runText(text);
      return;
    }
    for (const l of lines) {
      for (let n = 0; n < 200 && !term.isIdle; n++) await new Promise((r) => setTimeout(r, 100));
      if (l.includes('\n')) {
        // a command that spans several lines (a here-document): show it like typed input and run it as one unit
        term.el.input.value = '';
        term.print(term.psText + l.split('\n').join('\n> ') + '\n');
        term.hist.push(l);
        await term.runText(l);
      } else await term.type(l);
    }
    for (let n = 0; n < 200 && !term.isIdle; n++) await new Promise((r) => setTimeout(r, 100));
    if (window.innerWidth >= 1180) term.focus();
  }

  function toast(html, good) {
    const el = $('#toast');
    el.innerHTML = html;
    el.classList.toggle('good', !!good);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), good ? 4200 : 3200);
  }

  let endObs = null;
  function observeEnd() {
    if (endObs) endObs.disconnect();
    const s = $('#end-sentinel');
    if (!s || !window.IntersectionObserver) return;
    const id = route.id;
    endObs = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting) && !S.read[id]) {
          S.read[id] = true;
          save();
          renderSide();
        }
      },
      { root: $('#main'), threshold: 0 }
    );
    endObs.observe(s);
  }

  /* ---------- events ---------- */
  function setLang(l) {
    S.lang = l;
    save();
    $('#win').dataset.lang = l;
    $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
  }
  function applyTheme() {
    const r = document.documentElement;
    if (S.theme) r.dataset.theme = S.theme;
    else delete r.dataset.theme;
  }
  function resetProgress(btn) {
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1';
      btn.innerHTML = one('Click again to erase everything', 'Mitane ke liye dobara click karo');
      setTimeout(() => {
        delete btn.dataset.armed;
        if (btn.isConnected) btn.innerHTML = one('Erase my progress', 'Progress mitao');
      }, 4000);
      return;
    }
    S.read = {};
    S.missions = {};
    S.quiz = {};
    save();
    for (const k of Object.keys(quizState)) delete quizState[k];
    render();
    toast(one('Progress erased.', 'Progress mitaya gaya.'));
  }

  function onClick(e) {
    const t = e.target;
    const langBtn = t.closest('.seg button');
    if (langBtn) return setLang(langBtn.dataset.lang);
    const run = t.closest('[data-run]');
    if (run) {
      e.preventDefault();
      runInTerm(run.dataset.run);
      return;
    }
    const g = t.closest('[data-go]');
    if (g) {
      const to = g.dataset.go;
      go(to, g.dataset.id);
      return;
    }
    const a = t.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    const win = $('#win');
    switch (act) {
      case 'home': return go('home');
      case 'toggle-term':
        if (window.innerWidth < 1180) win.classList.toggle('term-open');
        else win.classList.toggle('term-hidden');
        if (term && win.classList.contains('term-open')) setTimeout(() => term.focus(), 50);
        return;
      case 'open-term':
        if (window.innerWidth < 1180) win.classList.add('term-open');
        else win.classList.remove('term-hidden');
        setTimeout(() => term.focus(), 50);
        return;
      case 'focus': return win.classList.toggle('focus-mode');
      case 'toggle-side': return win.classList.toggle('side-open');
      case 'scrim':
        win.classList.remove('side-open', 'term-open');
        return;
      case 'theme': {
        const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
        S.theme = dark ? 'light' : 'dark';
        save();
        return applyTheme();
      }
      case 'reset-progress': return resetProgress(a);
      case 'hint': {
        const el = $('#hint-' + a.dataset.m);
        el.hidden = !el.hidden;
        a.setAttribute('aria-expanded', String(!el.hidden));
        return;
      }
      case 'solve': {
        const el = $('#solve-' + a.dataset.m);
        el.hidden = !el.hidden;
        a.setAttribute('aria-expanded', String(!el.hidden));
        return;
      }
      case 'lab': {
        const tt = byId(route.id);
        const mm = tt && tt.missions.find((x) => x.id === a.dataset.m);
        if (mm && mm.lab && term) {
          win.classList.remove('term-hidden');
          if (window.innerWidth < 1180) win.classList.add('term-open');
          term.loadLab(mm.lab.setup, mm.lab.en).then(() => toast(one('Lab loaded. The machine is broken. Go fix it!', 'Lab load ho gaya. Machine kharab hai. Thik karo!'), true));
        }
        return;
      }
      case 'quiz-start': return quizStart();
      case 'quiz-next': return quizNext();
      case 'quiz-giveup': return quizGiveUp();
      case 'pick': return quizPick(+a.dataset.o);
    }
  }

  function init() {
    renderShell();
    applyTheme();
    wireTerminal();
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', (e) => {
      const r = e.target.closest && e.target.closest('code.run');
      if (r && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        runInTerm(r.dataset.run);
      }
      if (e.key === 'Escape') $('#win').classList.remove('side-open', 'term-open');
    });
    document.addEventListener('submit', (e) => {
      if (e.target.id === 'qform') {
        e.preventDefault();
        quizSubmitCmd();
      }
    });
    window.addEventListener('hashchange', () => {
      const r = parseHash();
      if (r.view !== route.view || r.id !== route.id) go(r.view, r.id, true);
    });
    window.addEventListener('resize', () => term && term.measure());
    const r = parseHash();
    route = r;
    render();
    if (window.innerWidth >= 1180) setTimeout(() => {}, 0);
  }
  LX.app = { go, render, S, topicStatus, runInTerm };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
