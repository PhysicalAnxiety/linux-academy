/* Linux Academy: a living performance model. CPU shares with nice, memory pressure with swap and the OOM killer, disk I/O load, load averages that lag,
   top / free / vmstat / iostat / mpstat / pidstat / sar, stress, tuned-adm */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS } = LX;
  const U = LX.U;
  const P = LX.Shell.prototype;

  const CORES = 2;
  const MEM_TOTAL = 4046772;
  const BASE_USED = 1262340;
  const CACHE = 1261424;
  const BUFF = 94280;
  const DISK_MAX = 200; // MB/s the virtual disk can do
  const swapTotal = (sh) => (sh.swapTotal ? sh.swapTotal() : 2097148);

  /* ---------- starting load generators ---------- */
  const parseSize = (s) => {
    const m = /^(\d+(?:\.\d+)?)([kKmMgG%]?)/.exec(s || '');
    if (!m) return 262144;
    const v = parseFloat(m[1]);
    const u = m[2].toLowerCase();
    if (u === '%') return Math.round((MEM_TOTAL * v) / 100);
    return Math.round(u === 'g' ? v * 1048576 : u === 'm' || u === '' ? v * 1024 : v);
  };
  const origBg = LX.bgLong;
  let lastBg = null;
  LX.bgLong = function (words, src) {
    let w = words.slice();
    let nice = 0;
    for (let guard = 0; guard < 4; guard++) {
      if (w[0] === 'nohup' || w[0] === 'time' || w[0] === 'ionice') {
        w = w.slice(1);
        while (w[0] && w[0].startsWith('-')) w = w.slice(w[0] === '-c' || w[0] === '-n' ? 2 : 1);
      } else if (w[0] === 'nice') {
        let n = 10;
        let i = 1;
        if (w[1] === '-n') { n = +w[2]; i = 3; } else if (/^-\d+$/.test(w[1] || '')) { n = +w[1].slice(1); i = 2; }
        nice = n;
        w = w.slice(i);
      } else break;
    }
    lastBg = null;
    if (!w.length) return null;
    const val = (...keys) => {
      for (const k of keys) {
        const i = w.findIndex((a) => a === k || a.startsWith(k + '='));
        if (i >= 0) return w[i].includes('=') ? w[i].split('=')[1] : w[i + 1];
      }
      return undefined;
    };
    let r = null;
    if (w[0] === 'stress' || w[0] === 'stress-ng') {
      const cpu = +(val('--cpu', '-c') || 0);
      const vm = +(val('--vm', '-m') || 0);
      const io = +(val('--io', '-i') || 0);
      const hdd = +(val('--hdd', '-d') || 0);
      const vmBytes = parseSize(val('--vm-bytes') || '256M');
      r = { proc: w.join(' '), cpu: cpu * 98 + io * 6 + hdd * 4 + vm * 25, memKiB: vm * vmBytes + 1200, io: io * 15 + hdd * 70 };
      if (!cpu && !vm && !io && !hdd) r.cpu = 98;
      r.comm = w[0] === 'stress-ng' && vm && !cpu ? 'stress-ng-vm' : w[0];
    } else if (w[0] === 'dd' && /of=(?!\/dev\/null)\S+/.test(src) && /if=\/dev\/(zero|urandom)/.test(src)) {
      r = { proc: 'dd', cpu: /urandom/.test(src) ? 85 : 14, memKiB: 900, io: /oflag=(direct|dsync)/.test(src) ? 175 : 130, comm: 'dd' };
    } else if (w[0] === 'fio' || w[0] === 'rsync' && !w.includes('--dry-run') && (src.match(/&\s*$/) || false)) {
      r = { proc: w.join(' '), cpu: 20, memKiB: 12000, io: 90, comm: w[0] };
    } else {
      r = origBg ? origBg(w, src) : null;
    }
    if (r) {
      r.nice = nice;
      lastBg = r;
    }
    return r;
  };
  const prevStart = LX.onBgStart;
  LX.onBgStart = (sh, job, words) => {
    if (prevStart) prevStart(sh, job, words);
    if (lastBg) {
      if (lastBg.nice) job.nice = lastBg.nice;
      if (lastBg.io) job.io = lastBg.io;
      if (lastBg.comm) job.comm = lastBg.comm;
    }
    LX.checkOom(sh);
  };

  /* ---------- CPU: fair sharing weighted by nice ---------- */
  LX.cpuShares = function (sh) {
    const jobs = (sh.jobs || []).filter((j) => j.state !== 'Stopped' && (j.cpu || 0) > 0.5);
    const threads = [];
    for (const j of jobs) {
      const n = Math.max(1, Math.round((j.cpu || 0) / 98));
      for (let i = 0; i < n; i++) threads.push({ job: j, demand: Math.min(100, (j.cpu || 0) / n), w: Math.pow(1.25, -(j.nice || 0)), alloc: 0 });
    }
    let remaining = CORES * 100;
    let active = threads.slice();
    for (let guard = 0; guard < 50 && active.length; guard++) {
      const totalW = active.reduce((s, t) => s + t.w, 0);
      const done = active.find((t) => t.demand <= (remaining * t.w) / totalW);
      if (!done) {
        active.forEach((t) => (t.alloc = (remaining * t.w) / totalW));
        break;
      }
      done.alloc = done.demand;
      remaining -= done.demand;
      active = active.filter((t) => t !== done);
    }
    const map = new Map();
    for (const t of threads) map.set(t.job, (map.get(t.job) || 0) + t.alloc);
    return map;
  };

  /* ---------- the model ---------- */
  function calc(sh) {
    const jobs = sh.jobs || [];
    const shares = LX.cpuShares(sh);
    const busy = Array.from(shares.values()).reduce((s, v) => s + v, 0); // percent of one core
    const niced = Array.from(shares.entries()).filter(([j]) => (j.nice || 0) > 0).reduce((s, [, v]) => s + v, 0);
    const demand = jobs.filter((j) => j.state !== 'Stopped').reduce((s, j) => s + (j.cpu || 0), 0);
    const jobsMem = jobs.reduce((s, j) => s + (j.memKiB || 0), 0);
    const ioMBs = Math.min(DISK_MAX, jobs.reduce((s, j) => s + (j.io || 0), 0));
    const appsUsed = BASE_USED + jobsMem;
    const reserve = 200000;
    const swapT = swapTotal(sh);
    let used = appsUsed;
    let swapUsed = 0;
    let cache = Math.min(CACHE, Math.max(100000, MEM_TOTAL - appsUsed - 120000));
    if (appsUsed > MEM_TOTAL - reserve) {
      swapUsed = appsUsed - (MEM_TOTAL - reserve);
      used = MEM_TOTAL - reserve;
      cache = 100000;
    }
    const free = Math.max(30000, MEM_TOTAL - used - cache);
    const avail = swapUsed ? Math.round(free + cache * 0.4) : free + Math.round(cache * 0.92);
    const swapping = swapUsed > 0 ? 1 : 0;
    const cap = CORES * 100;
    const usT = Math.min(98, 1.3 + ((busy - niced) / cap) * 94);
    const niT = Math.min(98, (niced / cap) * 94);
    const syT = 0.7 + (busy / cap) * 3 + (ioMBs / DISK_MAX) * 4 + swapping * 6;
    const waT = Math.min(80, 0.2 + (ioMBs / DISK_MAX) * 55 + swapping * 25);
    const idT = Math.max(0, 100 - usT - niT - syT - waT);
    const target = 0.08 + demand / 100 + (ioMBs / DISK_MAX) * 1.4 + swapping * 2;
    // load averages move slowly towards the target (1 real second = 2 virtual minutes)
    const now = Date.now();
    const st = sh.loadState || (sh.loadState = { t: now, l: [0.08, 0.06, 0.04] });
    const dt = Math.min(3600, ((now - st.t) / 1000) * 120);
    st.t = now;
    st.l = st.l.map((x, i) => target + (x - target) * Math.exp(-dt / [60, 300, 900][i]));
    return { load: st.l.map((x) => Math.round(x * 100) / 100), target, memTotal: MEM_TOTAL, memUsed: used, memFree: free, cache, buff: BUFF, avail, swapUsed, swapTotal: swapT, cores: CORES, busy, demand, us: usT, ni: niT, sy: syT, wa: waT, id: idT, ioMBs, shares, hog: demand / 100, swapping, jobsMem };
  }
  LX.sysinfo = calc;
  LX.checkOom = function (sh) {
    for (let guard = 0; guard < 5; guard++) {
      const si = calc(sh);
      if (si.swapUsed <= si.swapTotal) return;
      const victim = (sh.jobs || []).slice().sort((a, b) => (b.memKiB || 0) - (a.memKiB || 0))[0];
      if (!victim || !(victim.memKiB > 0)) return;
      const comm = victim.comm || victim.proc.split(' ')[0];
      sh.jobs = sh.jobs.filter((j) => j !== victim);
      sh.logEvent('kernel', 4, `${comm} invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0`, { ident: 'kernel' });
      sh.logEvent('kernel', 4, `Mem-Info: active_anon:${Math.round(victim.memKiB / 4)} inactive_anon:1024 free:11000`, { ident: 'kernel' });
      sh.logEvent('kernel', 3, `oom-kill:constraint=CONSTRAINT_NONE,nodemask=(null),cpuset=/,mems_allowed=0,global_oom,task_memcg=/user.slice/user-1001.slice/session-3.scope,task=${comm},pid=${victim.pid},uid=1001`, { ident: 'kernel' });
      sh.logEvent('kernel', 3, `Out of memory: Killed process ${victim.pid} (${comm}) total-vm:${Math.round(victim.memKiB * 1.05)}kB, anon-rss:${victim.memKiB}kB, file-rss:0kB, shmem-rss:0kB, UID:1001 pgtables:${Math.round(victim.memKiB / 200)}kB oom_score_adj:0`, { ident: 'kernel' });
      if (sh.notices) sh.notices.push(`[${victim.id}]+  Killed                  ${victim.cmd}\n`);
    }
  };

  // processes show their real CPU share
  const origProcList = P.procList;
  P.procList = function () {
    const list = origProcList.call(this);
    const sh = this;
    const shares = LX.cpuShares(sh);
    const si = calc(sh);
    for (const p of list) {
      if (p.job && shares.has(p.job)) p.cpu = Math.round(shares.get(p.job) * 10) / 10;
      else if (p.job) p.cpu = 0;
      if (p.job && p.job.comm) p.name = p.job.comm;
      if (p.job) p.nice = p.job.nice || 0;
      if (p.job && p.job.state !== 'Stopped') p.stat = (p.job.cpu || 0) > 5 ? 'R' : p.stat;
      if (p.job && p.job.io && p.job.state !== 'Stopped') p.stat = 'D';
    }
    return list;
  };

  /* ---------- formatting helpers ---------- */
  const f1 = (n) => n.toFixed(1);
  const f2 = (n) => n.toFixed(2);
  const hh = () => U.strftime('%H:%M:%S', new Date());
  const kernelHead = (sh) => `Linux 6.8.0-45-generic (${sh.hostname || 'linux-school'}) \t${U.strftime('%m/%d/%Y', new Date())} \t_x86_64_\t(${CORES} CPU)\n`;
  const opt = (args) => {
    const flags = args.filter((a) => /^-[A-Za-z]/.test(a)).join('');
    const nums = args.filter((a) => /^\d+$/.test(a)).map(Number);
    return { flags, nums };
  };
  const human = (kib, f) => {
    if (/b/.test(f.bytes)) return String(kib * 1024);
    if (f.h) {
      const b = kib * 1024;
      if (b >= 1073741824) return (b / 1073741824).toFixed(1) + 'Gi';
      if (b >= 1048576) return Math.round(b / 1048576) + 'Mi';
      if (b >= 1024) return Math.round(b / 1024) + 'Ki';
      return b + 'B';
    }
    if (f.m) return String(Math.round(kib / 1024));
    if (f.g) return String(Math.round(kib / 1048576));
    return String(kib);
  };

  /* ---------- top / htop ---------- */
  const topFrame = (c, args, name) => {
    const sh = c.sh;
    const si = calc(sh);
    const batch = args.includes('-b');
    const oI = args.indexOf('-o');
    const sortKey = oI >= 0 ? String(args[oI + 1]).replace(/^[-+]/, '').toLowerCase() : '%cpu';
    const uI = args.indexOf('-u');
    const pI = args.indexOf('-p');
    let all = sh.procList().slice();
    all.sort(sortKey === '%mem' ? (a, b) => b.mem - a.mem || b.cpu - a.cpu : (a, b) => b.cpu - a.cpu || b.mem - a.mem);
    if (uI >= 0) all = all.filter((p) => p.user === args[uI + 1]);
    if (pI >= 0) all = all.filter((p) => args[pI + 1].split(',').includes(String(p.pid)));
    const up = Math.floor((Date.now() - sh.startTime) / 60000);
    c.out(`${name} - ${hh()} up ${Math.floor(up / 1440)} days, ${Math.floor((up % 1440) / 60)}:${String(up % 60).padStart(2, '0')},  1 user,  load average: ${si.load.map((x) => x.toFixed(2)).join(', ')}\n`);
    const running = 1 + sh.jobs.filter((j) => j.state !== 'Stopped' && (j.cpu || 0) > 5).length;
    const stopped = sh.jobs.filter((j) => j.state === 'Stopped').length;
    c.out(`Tasks: ${String(all.length + 70).padStart(3)} total,   ${running} running, ${String(all.length + 70 - running - stopped).padStart(3)} sleeping,   ${stopped} stopped,   0 zombie\n`);
    c.out(`%Cpu(s): ${f1(si.us).padStart(4)} us, ${f1(si.sy).padStart(4)} sy, ${f1(si.ni).padStart(4)} ni, ${f1(si.id).padStart(4)} id, ${f1(si.wa).padStart(4)} wa,  0.0 hi,  0.0 si,  0.0 st\n`);
    const mb = (k) => (k / 1024).toFixed(1);
    c.out(`MiB Mem : ${mb(si.memTotal).padStart(8)} total, ${mb(si.memFree).padStart(8)} free, ${mb(si.memUsed).padStart(8)} used, ${mb(si.cache + si.buff).padStart(8)} buff/cache\nMiB Swap: ${mb(si.swapTotal).padStart(8)} total, ${mb(si.swapTotal - si.swapUsed).padStart(8)} free, ${mb(si.swapUsed).padStart(8)} used. ${mb(si.avail).padStart(8)} avail Mem \n\n`);
    c.out('    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n');
    const lim = args.includes('-b') ? 12 : 12;
    for (const p of all.slice(0, lim)) c.out(`${String(p.pid).padStart(7)} ${p.user.padEnd(9).slice(0, 9)} ${String(20 + p.nice).padStart(2)} ${String(p.nice).padStart(3)} ${String(Math.round(p.mem * 40467 * 4 + 12000)).padStart(7)} ${String(Math.round(p.mem * 40467) + 2000).padStart(6)} ${String(2000).padStart(6)} ${p.stat[0]} ${p.cpu.toFixed(1).padStart(5)} ${p.mem.toFixed(1).padStart(5)}   0:${String(Math.floor((Date.now() - sh.startTime) / 1000) % 60).padStart(2, '0')}.${String((p.pid % 90) + 10)} ${(p.name || VFS.base(p.cmd.split(' ')[0])).replace(/^-/, '').replace(/:$/, '')}\n`);
    if (!batch) c.out('\n\x1b[2m(One snapshot. Real ' + name + ' refreshes every few seconds. Keys: P sort by CPU, M by memory, k kill, r renice, 1 per-CPU, q quit.)\x1b[0m\n');
  };
  def('top', async (c, args) => {
    const n = args.indexOf('-n') >= 0 ? +args[args.indexOf('-n') + 1] || 1 : 1;
    for (let i = 0; i < n; i++) {
      topFrame(c, args, 'top');
      if (i < n - 1) await c.sh.waitMs(1000);
    }
    return 0;
  });
  def('htop', async (c, args) => topFrame(c, args, 'htop'), { pkg: 'htop' });

  /* ---------- free ---------- */
  def('free', async (c, args) => {
    const si = calc(c.sh);
    const f = { h: args.some((a) => /^-[a-z]*h|--human/.test(a)), m: args.some((a) => /^-[a-z]*m/.test(a)), g: args.some((a) => /^-[a-z]*g/.test(a)), bytes: args.some((a) => /^-[a-z]*b/.test(a)) ? 'b' : '' };
    const wide = args.some((a) => /^-[a-z]*w/.test(a));
    const row = (n, a) => n.padEnd(8) + a.map((x) => human(x, f).padStart(12)).join('') + '\n';
    if (wide) c.out('               total        used        free      shared     buffers       cache   available\n');
    else c.out('               total        used        free      shared  buff/cache   available\n');
    c.out(row('Mem:', wide ? [si.memTotal, si.memUsed, si.memFree, 18432, si.buff, si.cache - si.buff > 0 ? si.cache - si.buff : si.cache, si.avail] : [si.memTotal, si.memUsed, si.memFree, 18432, si.cache + si.buff, si.avail]));
    c.out(row('Swap:', [si.swapTotal, si.swapUsed, si.swapTotal - si.swapUsed]));
    if (args.some((a) => /^-[a-z]*t/.test(a))) c.out(row('Total:', [si.memTotal + si.swapTotal, si.memUsed + si.swapUsed, si.memFree + si.swapTotal - si.swapUsed]));
    return 0;
  });

  /* ---------- vmstat ---------- */
  def('vmstat', async (c, args) => {
    const sh = c.sh;
    const { flags, nums } = opt(args);
    if (flags.includes('s')) {
      const si = calc(sh);
      c.out(`${String(si.memTotal).padStart(13)} K total memory\n${String(si.memUsed).padStart(13)} K used memory\n${String(si.avail).padStart(13)} K free memory\n${String(si.buff).padStart(13)} K buffer memory\n${String(si.cache).padStart(13)} K swap cache\n${String(si.swapTotal).padStart(13)} K total swap\n${String(si.swapUsed).padStart(13)} K used swap\n`);
      return 0;
    }
    const delay = nums[0] || 0;
    const count = nums.length > 1 ? nums[1] : delay ? 1e9 : 1;
    const total = Math.min(count, 12);
    c.out('procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----\n r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st\n');
    for (let i = 0; i < total; i++) {
      const si = calc(sh);
      const r = 1 + sh.jobs.filter((j) => j.state !== 'Stopped' && (j.cpu || 0) > 5).reduce((s, j) => s + Math.max(1, Math.round(j.cpu / 98)), 0);
      const b = si.ioMBs > 20 || si.swapping ? 1 + Math.round(si.ioMBs / 90) : 0;
      const bo = Math.round(si.ioMBs * 1024 * 0.9) + 38;
      const bi = Math.round(si.ioMBs * 1024 * 0.1) + 21;
      const sw = si.swapping ? 1800 + (i % 3) * 300 : 0;
      c.out(`${String(r).padStart(2)} ${String(b).padStart(2)} ${String(si.swapUsed).padStart(6)} ${String(si.memFree).padStart(6)} ${String(si.buff).padStart(6)} ${String(si.cache).padStart(6)} ${String(Math.round(sw * 0.4)).padStart(4)} ${String(sw).padStart(4)} ${String(bi).padStart(5)} ${String(bo).padStart(5)} ${String(120 + Math.round(si.busy * 3)).padStart(4)} ${String(250 + Math.round(si.busy * 8)).padStart(4)} ${String(Math.round(si.us + si.ni)).padStart(2)} ${String(Math.round(si.sy)).padStart(2)} ${String(Math.round(si.id)).padStart(2)} ${String(Math.round(si.wa)).padStart(2)}  0\n`);
      if (i < total - 1) await sh.waitMs((delay || 1) * 1000);
    }
    return 0;
  });

  /* ---------- sysstat tools ---------- */
  const diskRow = (si, x, z) => {
    const w = si.ioMBs;
    const util = Math.min(100, (w / DISK_MAX) * 100 + 0.3);
    const wps = (w * 1024) / 128 + 1.3;
    const row = { r: 2.1, rkb: 45.2 + w * 5, w: wps, wkb: 12.8 + w * 1024, util, wawait: 1.5 + (util / 100) * 38, aqu: 0.01 + (util / 100) * 4.2 };
    return row;
  };
  const iostat = async (c, args) => {
    const sh = c.sh;
    const { flags, nums } = opt(args);
    const delay = nums[0] || 0;
    const count = nums.length > 1 ? nums[1] : delay ? 2 : 1;
    const ext = flags.includes('x');
    const z = flags.includes('z');
    const mode = flags.includes('m') ? 'MB' : 'kB';
    const div = mode === 'MB' ? 1024 : 1;
    c.out(kernelHead(sh) + '\n');
    for (let i = 0; i < Math.min(count, 10); i++) {
      const si = calc(sh);
      const d = diskRow(si);
      if (!flags.includes('d')) c.out(`avg-cpu:  %user   %nice %system %iowait  %steal   %idle\n          ${f2(si.us).padStart(6)} ${f2(si.ni).padStart(7)} ${f2(si.sy).padStart(7)} ${f2(si.wa).padStart(7)}    0.00 ${f2(si.id).padStart(8)}\n\n`);
      if (!flags.includes('c')) {
        if (ext) {
          c.out(`Device            r/s     r${mode}/s   rrqm/s  %rrqm r_await rareq-sz     w/s     w${mode}/s   wrqm/s  %wrqm w_await wareq-sz     d/s     d${mode}/s   drqm/s  %drqm d_await dareq-sz     f/s f_await  aqu-sz  %util\n`);
          if (!(z && d.util < 1)) c.out(`sda        ${d.r.toFixed(2).padStart(10)} ${(d.rkb / div).toFixed(2).padStart(9)}     0.10   4.55    0.80    21.52 ${d.w.toFixed(2).padStart(8)} ${(d.wkb / div).toFixed(2).padStart(9)}     1.00  43.48 ${d.wawait.toFixed(2).padStart(7)}     9.85    0.00      0.00     0.00   0.00    0.00     0.00    0.40    0.62 ${d.aqu.toFixed(2).padStart(7)} ${d.util.toFixed(2).padStart(6)}\n`);
        } else {
          c.out(`Device             tps    ${mode}_read/s    ${mode}_wrtn/s    ${mode}_dscd/s    ${mode}_read    ${mode}_wrtn    ${mode}_dscd\n`);
          c.out(`sda        ${(d.r + d.w).toFixed(2).padStart(12)} ${(d.rkb / div).toFixed(2).padStart(12)} ${(d.wkb / div).toFixed(2).padStart(12)}         0.00     912345  ${String(258000 + Math.round(d.wkb * i)).padStart(9)}          0\n`);
        }
        c.out('\n');
      }
      if (i < Math.min(count, 10) - 1) await sh.waitMs(delay * 1000 || 1000);
    }
    return 0;
  };
  def('iostat', iostat, { pkg: 'sysstat' });
  def('mpstat', async (c, args) => {
    const sh = c.sh;
    const { nums } = opt(args);
    const all = args.includes('ALL') || args.includes('-P');
    const delay = nums[0] || 0;
    const count = nums.length > 1 ? nums[1] : delay ? 1 : 1;
    c.out(kernelHead(sh) + '\n');
    for (let i = 0; i < count; i++) {
      const si = calc(sh);
      const t = U.strftime('%I:%M:%S %p', new Date());
      c.out(`${t}  CPU    %usr   %nice    %sys %iowait    %irq   %soft  %steal  %guest  %gnice   %idle\n`);
      const line = (cpu, us, ni, sy, wa, id) => `${t}  ${String(cpu).padStart(3)} ${f2(us).padStart(7)} ${f2(ni).padStart(7)} ${f2(sy).padStart(7)} ${f2(wa).padStart(7)}    0.00    0.00    0.00    0.00    0.00 ${f2(id).padStart(7)}\n`;
      c.out(line('all', si.us, si.ni, si.sy, si.wa, si.id));
      if (all) {
        // the busiest job lands on cpu 0 first
        const hi = Math.min(100, si.busy);
        const c0 = Math.min(98, hi);
        const c1 = Math.max(0, si.busy - c0);
        const mk = (u) => [Math.min(98, 1.3 + u * 0.94), u > 0 ? 0 : 0, 0.7, si.wa, 0];
        [c0, c1].forEach((u, k) => {
          const us = Math.min(98, 1.3 + u * 0.94);
          c.out(line(k, us, 0, si.sy, si.wa, Math.max(0, 100 - us - si.sy - si.wa)));
        });
      }
      c.out('\n');
      if (i < count - 1) await sh.waitMs(delay * 1000 || 1000);
    }
    return 0;
  }, { pkg: 'sysstat' });
  def('pidstat', async (c, args) => {
    const sh = c.sh;
    const { flags, nums } = opt(args);
    const delay = nums[0] || 1;
    const count = nums.length > 1 ? nums[1] : 1;
    const pI = args.indexOf('-p');
    c.out(kernelHead(sh) + '\n');
    for (let i = 0; i < Math.min(count, 8); i++) {
      calc(sh);
      const rows = sh.procList().filter((p) => p.job || p.svc).filter((p) => pI < 0 || String(p.pid) === args[pI + 1]);
      const t = hh();
      if (flags.includes('d')) {
        c.out(`${t}      UID       PID   kB_rd/s   kB_wr/s kB_ccwr/s iodelay  Command\n`);
        rows.forEach((p) => c.out(`${t}     ${String((sh.users[p.user] || { uid: 0 }).uid).padStart(4)} ${String(p.pid).padStart(9)}      0.00 ${((p.job && p.job.io ? p.job.io : 0) * 1024).toFixed(2).padStart(9)}      0.00       ${p.job && p.job.io ? 12 : 0}  ${p.name || VFS.base(p.cmd.split(' ')[0])}\n`));
      } else if (flags.includes('r')) {
        c.out(`${t}      UID       PID  minflt/s  majflt/s     VSZ     RSS   %MEM  Command\n`);
        rows.forEach((p) => c.out(`${t}     ${String((sh.users[p.user] || { uid: 0 }).uid).padStart(4)} ${String(p.pid).padStart(9)}      0.00      0.00 ${String(Math.round(p.mem * 40467 * 4 + 12000)).padStart(7)} ${String(Math.round(p.mem * 40467) + 2000).padStart(7)} ${p.mem.toFixed(2).padStart(6)}  ${p.name || VFS.base(p.cmd.split(' ')[0])}\n`));
      } else {
        c.out(`${t}      UID       PID    %usr %system  %guest   %wait    %CPU   CPU  Command\n`);
        rows.filter((p) => p.cpu > 0).forEach((p) => c.out(`${t}     ${String((sh.users[p.user] || { uid: 0 }).uid).padStart(4)} ${String(p.pid).padStart(9)} ${(p.cpu * 0.97).toFixed(2).padStart(7)} ${(p.cpu * 0.03).toFixed(2).padStart(7)}    0.00    ${(p.job && (p.job.cpu || 0) > p.cpu ? (p.job.cpu - p.cpu) : 0).toFixed(2).padStart(4)} ${p.cpu.toFixed(2).padStart(7)}     ${p.pid % CORES}  ${p.name || VFS.base(p.cmd.split(' ')[0])}\n`));
      }
      c.out('\n');
      if (i < Math.min(count, 8) - 1) await sh.waitMs(delay * 1000);
    }
    return 0;
  }, { pkg: 'sysstat' });

  // sar history: ten-minute samples, with a backup job every night at 02:00
  const hash = (n) => {
    let x = (n * 2654435761) >>> 0;
    x ^= x >>> 15;
    x = (x * 2246822519) >>> 0;
    return (x % 1000) / 1000;
  };
  const histPoint = (minute, seed) => {
    const spike = minute >= 120 && minute < 160;
    const day = minute >= 540 && minute < 1080;
    const j = hash(minute + seed * 1000);
    const us = spike ? 28 + j * 22 : day ? 6 + j * 9 : 1 + j * 3;
    const wa = spike ? 24 + j * 16 : 0.2 + j * 1.2;
    const sy = spike ? 6 + j * 4 : 0.6 + j * 1.2;
    const id = Math.max(0, 100 - us - wa - sy);
    const load = spike ? 2.6 + j * 1.4 : day ? 0.3 + j * 0.5 : 0.04 + j * 0.12;
    const memUsedPct = spike ? 61 + j * 6 : 30 + j * 3;
    return { us, wa, sy, id, load, memUsedPct, tps: spike ? 420 + j * 200 : 6 + j * 14, bw: spike ? 150000 + j * 40000 : 90 + j * 400 };
  };
  LX.perfPeak = (seed) => {
    let best = -1;
    let bm = 0;
    for (let m = 0; m <= 1430; m += 10) {
      const w = Math.round(histPoint(m, seed).wa * 100) / 100;
      if (w > best) { best = w; bm = m; }
    }
    return `${String(Math.floor(bm / 60)).padStart(2, '0')}:${String(bm % 60).padStart(2, '0')}:01`;
  };
  def('sar', async (c, args) => {
    const sh = c.sh;
    const fI = args.indexOf('-f');
    const seed = fI >= 0 ? +(/(\d+)$/.exec(args[fI + 1] || '')?.[1] || 0) : new Date().getDate();
    if (fI >= 0 && !sh.fs.lookup(c.abs(args[fI + 1]))) { c.err(`Cannot open ${args[fI + 1]}: No such file or directory\n`); return 2; }
    const sI = args.indexOf('-s');
    const eI = args.indexOf('-e');
    const toMin = (t) => { const m = /^(\d+):(\d+)/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
    const from = sI >= 0 ? toMin(args[sI + 1]) : 0;
    const now = new Date();
    const nowHM = U.strftime('%H:%M:%S', now).split(':').map(Number);
    const to = eI >= 0 ? toMin(args[eI + 1]) : fI >= 0 ? 1430 : nowHM[0] * 60 + nowHM[1];
    const kind = args.includes('-q') ? 'q' : args.includes('-r') ? 'r' : args.includes('-b') ? 'b' : args.includes('-d') ? 'd' : args.includes('-n') ? 'n' : args.includes('-S') ? 'S' : 'u';
    const nums = args.filter((a, i) => /^\d+$/.test(a) && (i === 0 || args[i - 1] !== '-s' && args[i - 1] !== '-e' && args[i - 1] !== '-f'));
    const live = nums.length > 0 && fI < 0 && sI < 0;
    const hdr = {
      u: '        CPU     %user     %nice   %system   %iowait    %steal     %idle',
      q: '   runq-sz  plist-sz   ldavg-1   ldavg-5  ldavg-15   blocked',
      r: '   kbmemfree   kbavail kbmemused  %memused kbbuffers  kbcached  kbcommit   %commit  kbactive   kbinact   kbdirty',
      b: '       tps      rtps      wtps      dtps   bread/s   bwrtn/s   bdscd/s',
      d: '       DEV       tps     rkB/s     wkB/s     dkB/s   areq-sz    aqu-sz     await     %util',
      n: '     IFACE   rxpck/s   txpck/s    rxkB/s    txkB/s   rxcmp/s   txcmp/s  rxmcst/s   %ifutil',
      S: '   kbswpfree kbswpused  %swpused  kbswpcad   %swpcad',
    }[kind];
    c.out(kernelHead(sh) + '\n');
    const rowOf = (t, pt, cur) => {
      const clock = t;
      if (kind === 'u') return `${clock}        all ${f2(pt.us).padStart(9)}      0.00 ${f2(pt.sy).padStart(9)} ${f2(pt.wa).padStart(9)}      0.00 ${f2(pt.id).padStart(9)}`;
      if (kind === 'q') return `${clock} ${String(Math.max(0, Math.round(pt.load))).padStart(9)} ${String(181 + sh.jobs.length).padStart(9)} ${pt.load.toFixed(2).padStart(9)} ${(pt.load * 0.8).toFixed(2).padStart(9)} ${(pt.load * 0.6).toFixed(2).padStart(9)} ${String(pt.wa > 15 ? 2 : 0).padStart(9)}`;
      if (kind === 'r') { const used = Math.round(MEM_TOTAL * pt.memUsedPct / 100); return `${clock} ${String(MEM_TOTAL - used).padStart(11)} ${String(Math.round((MEM_TOTAL - used) * 1.6)).padStart(9)} ${String(used).padStart(9)} ${pt.memUsedPct.toFixed(2).padStart(9)} ${String(BUFF).padStart(9)} ${String(CACHE).padStart(9)} ${String(2100000).padStart(9)} ${'25.46'.padStart(9)} ${String(1500000).padStart(9)} ${String(700000).padStart(9)} ${String(120).padStart(9)}`; }
      if (kind === 'b') return `${clock} ${pt.tps.toFixed(2).padStart(9)} ${(pt.tps * 0.3).toFixed(2).padStart(9)} ${(pt.tps * 0.7).toFixed(2).padStart(9)}      0.00 ${(pt.bw * 0.1).toFixed(2).padStart(9)} ${(pt.bw * 0.9).toFixed(2).padStart(9)}      0.00`;
      if (kind === 'd') return `${clock}       sda ${pt.tps.toFixed(2).padStart(9)} ${(pt.bw * 0.05).toFixed(2).padStart(9)} ${(pt.bw * 0.45).toFixed(2).padStart(9)}      0.00 ${(pt.tps ? (pt.bw * 0.5) / pt.tps : 0).toFixed(2).padStart(9)} ${(pt.wa / 8).toFixed(2).padStart(9)} ${(1 + pt.wa).toFixed(2).padStart(9)} ${Math.min(100, pt.wa * 2.2).toFixed(2).padStart(9)}`;
      if (kind === 'n') return `${clock}      eth0 ${(8 + pt.us).toFixed(2).padStart(9)} ${(6 + pt.us * 0.8).toFixed(2).padStart(9)} ${(1.2 + pt.us * 0.2).toFixed(2).padStart(9)} ${(0.9 + pt.us * 0.15).toFixed(2).padStart(9)}      0.00      0.00      0.00      0.01`;
      return `${clock} ${String(2097148).padStart(11)} ${String(0).padStart(9)} ${'0.00'.padStart(9)} ${String(0).padStart(9)} ${'0.00'.padStart(9)}`;
    };
    const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:01`;
    if (live) {
      const delay = nums[0];
      const count = Math.min(nums.length > 1 ? nums[1] : 1, 10);
      c.out(`${hh()}${hdr}\n`);
      const acc = [];
      for (let i = 0; i < count; i++) {
        const si = calc(sh);
        const pt = { us: si.us + si.ni, wa: si.wa, sy: si.sy, id: si.id, load: si.load[0], memUsedPct: (si.memUsed / MEM_TOTAL) * 100, tps: 2.1 + si.ioMBs * 8, bw: 60 + si.ioMBs * 1024 };
        acc.push(pt);
        c.out(rowOf(hh(), pt) + '\n');
        if (i < count - 1) await sh.waitMs(delay * 1000);
      }
      const avg = (k) => acc.reduce((s, p) => s + p[k], 0) / acc.length;
      c.out(rowOf('Average:', { us: avg('us'), wa: avg('wa'), sy: avg('sy'), id: avg('id'), load: avg('load'), memUsedPct: avg('memUsedPct'), tps: avg('tps'), bw: avg('bw') }) + '\n');
      return 0;
    }
    c.out(`${fmt(from || 0)}${hdr}\n`);
    const acc = [];
    for (let m = Math.ceil((from || 0) / 10) * 10; m <= to; m += 10) {
      const pt = histPoint(m, seed);
      acc.push(pt);
      c.out(rowOf(fmt(m), pt) + '\n');
    }
    if (!acc.length) { c.out('Requested data not found\n'); return 0; }
    const avg = (k) => acc.reduce((s, p) => s + p[k], 0) / acc.length;
    c.out(rowOf('Average:', { us: avg('us'), wa: avg('wa'), sy: avg('sy'), id: avg('id'), load: avg('load'), memUsedPct: avg('memUsedPct'), tps: avg('tps'), bw: avg('bw') }) + '\n');
    return 0;
  }, { pkg: 'sysstat' });
  LX.PKGS.sysstat = LX.PKGS.sysstat || { ver: '12.6.1-2', desc: 'sysstat performance monitoring tools for Linux', size: 560, bins: ['iostat', 'sar', 'mpstat'] };
  if (LX.PKGS.sysstat.bins.indexOf('pidstat') < 0) LX.PKGS.sysstat.bins.push('pidstat');
  LX.initHooks.push((sh) => {
    sh.fs.mkdirp('/var/log/sysstat', { owner: 'root', group: 'adm' });
    for (const d of [25, 26]) sh.fs.put('/var/log/sysstat/sa' + d, '(binary sar data)', { owner: 'root', group: 'adm', mode: 0o644 });
    sh.loadState = { t: Date.now(), l: [0.08, 0.06, 0.04] };
  });

  /* ---------- stress, stress-ng ---------- */
  const stressCmd = (ng) => async (c, args) => {
    const sh = c.sh;
    const pid = sh.newPid ? sh.newPid() : 4100;
    const val = (...keys) => {
      for (const k of keys) {
        const i = args.findIndex((a) => a === k || a.startsWith(k + '='));
        if (i >= 0) return args[i].includes('=') ? args[i].split('=')[1] : args[i + 1];
      }
      return undefined;
    };
    const cpu = +(val('--cpu', '-c') || 0);
    const vm = +(val('--vm', '-m') || 0);
    const io = +(val('--io', '-i') || 0);
    const hdd = +(val('--hdd', '-d') || 0);
    const to = val('--timeout', '-t', '--time');
    if (!cpu && !vm && !io && !hdd) { c.err(ng ? 'stress-ng: no stressors specified\n' : 'stress: FAIL: [' + pid + '] (…) missing argument (see --help)\n'); return 1; }
    const secs = to ? parseInt(to, 10) : 0;
    const prefix = ng ? 'stress-ng: info:  [' + pid + ']' : 'stress: info: [' + pid + ']';
    const parts = [cpu && `${cpu} cpu`, io && `${io} io`, vm && `${vm} vm`, hdd && `${hdd} hdd`].filter(Boolean);
    if (ng) c.out(`${prefix} setting to a ${secs || 86400} second run per stressor\n${prefix} dispatching hogs: ${parts.join(', ')}\n`);
    else c.err(`${prefix} dispatching hogs: ${cpu} cpu, ${io} io, ${vm} vm, ${hdd} hdd\n`);
    if (!secs) {
      c.err('^C\n');
      return 130;
    }
    // while it runs in the foreground, the machine is busy: apply the load for the duration
    const job = { id: 0, pid, cmd: 'stress', state: 'Running', proc: 'stress', cpu: cpu * 98 + io * 6 + hdd * 4 + vm * 25, memKiB: vm * parseSize(val('--vm-bytes') || '256M') + 1200, io: io * 15 + hdd * 70, nice: 0 };
    sh.jobs.push(job);
    await sh.waitMs(Math.min(secs, 3) * 1000);
    sh.jobs = sh.jobs.filter((j) => j !== job);
    c.out(ng ? `${prefix} successful run completed in ${secs}.00s\n` : '');
    if (!ng) c.err(`${prefix} successful run completed in ${secs}s\n`);
    return 0;
  };
  LX.PKGS.stress = { ver: '1.0.7-1', desc: 'tool to impose load on and stress test a computer system', size: 22, bins: ['stress'] };
  LX.PKGS['stress-ng'] = { ver: '0.17.06-1build1', desc: 'stress test a computer system in various selectable ways', size: 1500, bins: ['stress-ng'] };
  def('stress', stressCmd(false), { pkg: 'stress' });
  def('stress-ng', stressCmd(true), { pkg: 'stress-ng' });

  /* ---------- tuned (Red Hat) ---------- */
  const TUNED = { balanced: ['General non-specialized tuned profile', { 'vm.swappiness': '60', 'vm.dirty_ratio': '20' }], 'throughput-performance': ['Broadly applicable tuning that provides excellent performance across a variety of common server workloads', { 'vm.swappiness': '10', 'vm.dirty_ratio': '40' }], 'latency-performance': ['Optimize for deterministic performance at the cost of increased power consumption', { 'vm.swappiness': '10', 'vm.dirty_ratio': '20' }], 'network-latency': ['Optimize for deterministic performance at the cost of increased power consumption, focused on low latency network performance', { 'vm.swappiness': '10', 'vm.dirty_ratio': '20' }], powersave: ['Optimize for low power consumption', { 'vm.swappiness': '60', 'vm.dirty_ratio': '20' }], 'virtual-guest': ['Optimize for running inside a virtual guest', { 'vm.swappiness': '30', 'vm.dirty_ratio': '30' }] };
  LX.PKGS.tuned = { ver: '2.22.1-1', desc: 'A dynamic adaptive system tuning daemon', size: 380, bins: ['tuned-adm'], service: { desc: 'Dynamic System Tuning Daemon', proc: 'tuned' } };
  def('tuned-adm', async (c, args) => {
    const sh = c.sh;
    sh.tuned = sh.tuned || 'balanced';
    const sub = args[0];
    if (!sub) { c.err('usage: tuned-adm [-h] {list,active,off,profile,profile_info,recommend,verify,auto_profile,profile_mode}\n'); return 2; }
    if (sub === 'list') {
      c.out('Available profiles:\n' + Object.entries(TUNED).map(([k, v]) => `- ${k.padEnd(30)} - ${v[0]}`).join('\n') + `\nCurrent active profile: ${sh.tuned}\n`);
      return 0;
    }
    if (sub === 'active') { c.out(sh.tuned ? `Current active profile: ${sh.tuned}\n` : 'No current active profile.\n'); return 0; }
    if (sub === 'recommend') { c.out('virtual-guest\n'); return 0; }
    if (sub === 'verify') { c.out('Verification succeeded, current system settings match the preset profile.\nSee TuneD log file (\'/var/log/tuned/tuned.log\') for details.\n'); return 0; }
    if (sub === 'off') { if (sh.eu() !== 'root') { c.err('Cannot talk to TuneD daemon via DBus. Is TuneD daemon running?\n'); return 1; } sh.tuned = null; return 0; }
    if (sub === 'profile') {
      if (sh.eu() !== 'root') { c.err('Cannot talk to TuneD daemon via DBus. Is TuneD daemon running?\n'); return 1; }
      const p = args[1];
      if (!TUNED[p]) { c.err(`Invalid profile: ${p || ''}\n`); return 1; }
      sh.tuned = p;
      Object.assign(sh.sysctl, TUNED[p][1]);
      return 0;
    }
    if (sub === 'profile_info') { const p = args[1] || sh.tuned; if (!TUNED[p]) { c.err('Profile not found\n'); return 1; } c.out(`Profile name:\n${p}\n\nProfile summary:\n${TUNED[p][0]}\n`); return 0; }
    c.err(`tuned-adm: error: invalid choice: '${sub}'\n`);
    return 2;
  }, { pkg: 'tuned' });

  /* ---------- /proc extras ---------- */
  const origProc = LX.procRead;
  LX.procRead = function (sh, abs) {
    let m;
    if ((m = /^\/proc\/(self|\d+)\/limits$/.exec(abs))) {
      return 'Limit                     Soft Limit           Hard Limit           Units     \nMax cpu time              unlimited            unlimited            seconds   \nMax file size             unlimited            unlimited            bytes     \nMax data size             unlimited            unlimited            bytes     \nMax stack size            8388608              unlimited            bytes     \nMax core file size        0                    unlimited            bytes     \nMax processes             15321                15321                processes \nMax open files            1024                 1048576              files     \nMax locked memory         524288               524288               bytes     \nMax address space         unlimited            unlimited            bytes     \n';
    }
    if (abs === '/proc/loadavg') {
      const si = calc(sh);
      return `${si.load.map((x) => x.toFixed(2)).join(' ')} ${1 + sh.jobs.filter((j) => (j.cpu || 0) > 5).length}/${180 + (sh.jobs || []).length} ${sh.nextPid}\n`;
    }
    if (abs === '/proc/meminfo') {
      const si = calc(sh);
      return `MemTotal:        ${si.memTotal} kB\nMemFree:         ${si.memFree} kB\nMemAvailable:    ${si.avail} kB\nBuffers:           ${si.buff} kB\nCached:          ${si.cache} kB\nSwapCached:             0 kB\nSwapTotal:       ${si.swapTotal} kB\nSwapFree:        ${si.swapTotal - si.swapUsed} kB\nDirty:                 0 kB\n`;
    }
    return origProc(sh, abs);
  };
})();
