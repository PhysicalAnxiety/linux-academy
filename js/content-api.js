/* Linux Academy: tiny helpers used by the lesson files */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  LX.topics = [];
  /** the five parts of the course; a topic says which one it belongs to with `part: n` (default 1) */
  LX.parts = [
    { n: 1, key: 'P1', en: 'Part 1 · Foundations', hi: 'Part 1 · Buniyaad', blurbEn: 'Your first commands, files, permissions, processes and scripts.', blurbHi: 'Pehle commands, files, permissions, processes aur scripts.' },
    { n: 2, key: 'P2', en: 'Part 2 · Admin essentials', hi: 'Part 2 · Admin ki zaroori cheezein', blurbEn: 'Users, sudo, services, logs, schedules, disks and LVM. The daily work of a sysadmin.', blurbHi: 'Users, sudo, services, logs, schedules, disks aur LVM. Sysadmin ka roz ka kaam.' },
    { n: 3, key: 'P3', en: 'Part 3 · Networking & servers', hi: 'Part 3 · Networking aur servers', blurbEn: 'IP, DNS, firewalls, SSH, web servers and software installs.', blurbHi: 'IP, DNS, firewall, SSH, web server aur software install.' },
    { n: 4, key: 'P4', en: 'Part 4 · Secure, tune & recover', hi: 'Part 4 · Secure, tune aur recover', blurbEn: 'Hardening, SELinux, performance, booting, backups and real troubleshooting labs.', blurbHi: 'Hardening, SELinux, performance, booting, backup aur real troubleshooting labs.' },
    { n: 5, key: 'P5', en: 'Part 5 · DevOps toolbox & the job', hi: 'Part 5 · DevOps toolbox aur naukri', blurbEn: 'Bash like a pro, Git, Docker, Ansible, Python, cloud ideas, and interview prep.', blurbHi: 'Pro jaisi Bash, Git, Docker, Ansible, Python, cloud ideas aur interview ki taiyari.' },
  ];
  /** job skills a junior is expected to have; each lists the lesson ids that build it */
  LX.skills = [];
  const T = (en, hi) => ({ en, hi });
  LX.b = {
    T,
    H: (en, hi) => ({ k: 'h', en, hi }),
    P: (en, hi) => ({ k: 'p', en, hi }),
    STORY: (en, hi) => ({ k: 'story', en, hi }),
    TIP: (en, hi) => ({ k: 'tip', en, hi }),
    WARN: (en, hi) => ({ k: 'warn', en, hi }),
    FUN: (en, hi) => ({ k: 'fun', en, hi }),
    BIG: (en, hi) => ({ k: 'big', en, hi }),
    /** how this shows up in a real job */
    JOB: (en, hi) => ({ k: 'job', en, hi }),
    /** runnable command: c may be a string or an array of lines run one after another */
    CMD: (c, en, hi) => ({ k: 'cmd', c, en, hi }),
    /** cheat-sheet rows: [command, English, Hinglish] */
    TABLE: (rows, headEn, headHi, run) => ({ k: 'table', rows, headEn, headHi, run: !!run }),
    /** parts: [text, kind(cmd|opt|arg|op), English, Hinglish] */
    ANAT: (parts) => ({ k: 'anat', parts }),
    PRE: (text) => ({ k: 'pre', text }),
    THINK: (qEn, qHi, aEn, aHi) => ({ k: 'think', qEn, qHi, aEn, aHi }),
    STEPS: (items) => ({ k: 'steps', items }),
    /** a short "do it yourself" panel with runnable commands */
    TRY: (en, hi, cmds) => ({ k: 'try', en, hi, cmds }),
  };
  LX.Q = {
    mcq: (lvl, qEn, qHi, opts, a, whyEn, whyHi) => ({ lvl, type: 'mcq', q: T(qEn, qHi), opts, a, why: T(whyEn, whyHi) }),
    cmd: (lvl, qEn, qHi, o, whyEn, whyHi) =>
      Object.assign({ lvl, type: 'cmd', q: T(qEn, qHi), why: T(whyEn, whyHi), hint: o.hintEn ? T(o.hintEn, o.hintHi || o.hintEn) : null }, o),
  };
  LX.M = (id, titleEn, titleHi, descEn, descHi, hintEn, hintHi, check, solve, extra) => Object.assign({ id, title: T(titleEn, titleHi), desc: T(descEn, descHi), hint: T(hintEn, hintHi), check, solve }, extra || {});
  /** helper for mission checks: did the learner successfully run a command matching re? */
  /** safe file read for checks: returns '' when the file is missing or unreadable */
  LX.cat = (sh, path) => { try { return sh.readFile(sh.abs(path)); } catch (e) { return ''; } };
  LX.ran = (sh, re) => sh.log.some((r) => r.code === 0 && re.test(r.cmd));

  /** Run a typed answer in a fresh sandbox (used by quizzes and tests). */
  LX.sandbox = async function (setup, cmd, cwd) {
    const sh = new LX.Shell({ fast: true });
    const sink = { stdout: () => {}, stderr: () => {} };
    for (const s of setup || []) await sh.run(s, sink);
    if (cwd) sh.cwd = sh.abs(cwd);
    sh.log.length = 0;
    const rec = await sh.run(cmd, sink);
    return { sh, rec };
  };
})();
