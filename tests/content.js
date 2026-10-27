globalThis.Buffer = undefined; // the browser has no Buffer: make the tests fail where the page would
const LX = require('./load.js');
let fail = 0, ok = 0;
const bad = (m) => { fail++; console.log('  FAIL', m); };
const sink = { stdout: () => {}, stderr: () => {} };
(async () => {
  for (const t of LX.topics) {
    console.log(`\n== ${t.no} ${t.id} (${t.title.en})`);
    if (t.quiz.length !== 10) bad('quiz length ' + t.quiz.length);
    t.quiz.forEach((q, i) => {
      if (q.lvl !== i + 1) bad(`Q${i + 1} level ${q.lvl}`);
      if (!q.q.en || !q.q.hi || !q.why.en || !q.why.hi) bad(`Q${i + 1} missing text`);
      if (q.type === 'mcq' && (q.a < 0 || q.a >= q.opts.length || q.opts.length < 3)) bad(`Q${i + 1} mcq opts`);
    });
    if (t.missions.length < 3) bad('missions < 3');
    for (const m of t.missions) {
      const sh0 = new LX.Shell({ fast: true });
      let pre = false; try { pre = !!m.check(sh0, null); } catch (e) {}
      if (pre) bad(`mission ${m.id} true before doing anything`);
      const sh = new LX.Shell({ fast: true });
      let last = null;
      if (m.testAnswers) { const qa = m.testAnswers.slice(); sh.hooks.readLine = async () => (qa.length ? qa.shift() : ''); }
      for (const c of (m.testSolve || m.solve)) last = await sh.run(c, sink);
      let r = false; try { r = !!m.check(sh, last); } catch (e) { bad(`mission ${m.id} threw ${e.message}`); }
      r ? ok++ : bad(`mission ${m.id} solve does not pass check`);
    }
    for (let i = 0; i < t.quiz.length; i++) {
      const q = t.quiz[i];
      if (q.type !== 'cmd') continue;
      try {
        const { sh, rec } = await LX.sandbox(q.setup, q.sample, q.cwd);
        (await q.verify(sh, rec, q.sample)) ? ok++ : bad(`Q${i + 1} sample "${q.sample}" fails verify. out=${JSON.stringify(rec.all.slice(0, 120))}`);
        for (const w of q.wrong || []) {
          const r2 = await LX.sandbox(q.setup, w, q.cwd);
          (await q.verify(r2.sh, r2.rec, w)) ? bad(`Q${i + 1} wrong answer "${w}" accepted`) : ok++;
        }
        for (const a of q.alt || []) {
          const r2 = await LX.sandbox(q.setup, a, q.cwd);
          (await q.verify(r2.sh, r2.rec, a)) ? ok++ : bad(`Q${i + 1} alt answer "${a}" rejected`);
        }
      } catch (e) { bad(`Q${i + 1} threw ${e.stack}`); }
    }
    const sh = new LX.Shell({ fast: true });
    const runs = [];
    for (const b of t.blocks) {
      if (b.k === 'cmd') runs.push(...[].concat(b.c));
      if (b.k === 'try') b.cmds.forEach((c) => runs.push(...[].concat(c)));
      if (b.k === 'table') b.rows.forEach((r) => runs.push(r[0]));
    }
    for (const c of runs) {
      try {
        let timer;
        const p = sh.run(c, sink);
        const r = await Promise.race([p, new Promise((res) => { timer = setTimeout(() => res('TIMEOUT'), 4000); })]);
        clearTimeout(timer);
        if (r === 'TIMEOUT') { console.log(`  SLOW  lesson cmd "${c}" did not finish in 4s (aborting it)`); sh.aborted = true; try { await p; } catch (e) {} sh.aborted = false; }
      } catch (e) { bad(`lesson cmd "${c}" threw ${e.message}`); }
    }
  }
  console.log(`\n${ok} checks passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
