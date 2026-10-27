/* Linux Academy: shell scripting extras: shellcheck (a small linter with real SC codes) */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr } = LX;
  const U = LX.U;

  LX.WEBTEXT = LX.WEBTEXT || {};
  LX.WEBTEXT['dl.acme.example/scripts/logwatch.sh'] = "#!/usr/bin/env bash\n# logwatch.sh - report failed SSH logins per source address\nset -euo pipefail\nIFS=$'\\n\\t'\n\nLOG=${LOG:-/var/log/auth.log}\nTOP=5\nVERBOSE=0\n\nusage() {\n  cat <<EOT\nUsage: ${0##*/} [-v] [-n TOP] [-f LOGFILE]\n  -n TOP      show the TOP most active addresses (default 5)\n  -f LOGFILE  log to read (default /var/log/auth.log)\n  -v          also print the total\nEOT\n}\n\ndie() { echo \"error: $*\" >&2; exit 1; }\n\nwhile getopts \":vn:f:h\" opt; do\n  case $opt in\n    v) VERBOSE=1 ;;\n    n) TOP=$OPTARG ;;\n    f) LOG=$OPTARG ;;\n    h) usage; exit 0 ;;\n    :) echo \"option -$OPTARG needs a value\" >&2; usage >&2; exit 2 ;;\n    \\?) echo \"unknown option -$OPTARG\" >&2; usage >&2; exit 2 ;;\n  esac\ndone\nshift $((OPTIND - 1))\n[[ $TOP =~ ^[0-9]+$ ]] || die \"TOP must be a number, got '$TOP'\"\n[[ -r $LOG ]] || die \"cannot read $LOG (try sudo)\"\n\ntmp=$(mktemp)\ntrap 'rm -f \"$tmp\"' EXIT\n\ndeclare -A count\ntotal=0\nre='Failed password for .* from ([0-9.]+) port'\nwhile IFS= read -r line; do\n  if [[ $line =~ $re ]]; then\n    ip=${BASH_REMATCH[1]}\n    count[$ip]=$(( ${count[$ip]:-0} + 1 ))\n    total=$(( total + 1 ))\n  fi\ndone < \"$LOG\"\n\nfor ip in \"${!count[@]}\"; do\n  printf '%s %s\\n' \"$ip\" \"${count[$ip]}\"\ndone | sort -k2 -rn | head -n \"$TOP\" > \"$tmp\"\n\n[[ -s $tmp ]] || { echo \"no failed logins found\"; exit 0; }\ncat \"$tmp\"\nif (( VERBOSE )); then echo \"total: $total\"; fi\n";
  LX.WEBTEXT['dl.acme.example/scripts/fragile.sh'] = "#!/bin/bash\n# fragile.sh - works on the author's laptop, breaks everywhere else\nbackup_dir=/tmp/backup\nmkdir -p $backup_dir\ncd ~/data\nfor f in *.txt; do\n  cp $f $backup_dir\ndone\necho `date` backup done\n";
  LX.PKGS.shellcheck = { ver: '0.9.0-1', desc: 'lint tool for shell scripts', size: 6100, bins: ['shellcheck'] };
  const WIKI = {
    SC2086: 'Double quote to prevent globbing and word splitting.',
    SC2006: 'Use $(...) notation instead of legacy backticks `...`.',
    SC2164: "Use 'cd ... || exit' or 'cd ... || return' in case cd fails.",
    SC2162: 'read without -r will mangle backslashes.',
    SC2002: "Useless cat. Consider 'cmd < file | ..' or 'cmd file | ..' instead.",
    SC2148: "Tips depend on target shell and yours is unknown. Add a shebang or a 'shell' directive.",
    SC2034: 'appears unused. Verify use (or export if used externally).',
    SC2155: 'Declare and assign separately to avoid masking return values.',
    SC2046: 'Quote this to prevent word splitting.',
    SC2115: 'Use "${var:?}" to ensure this never expands to /* .',
  };
  const SEV = { SC2086: 'info', SC2006: 'style', SC2164: 'warning', SC2162: 'info', SC2002: 'style', SC2148: 'error', SC2034: 'warning', SC2155: 'warning', SC2046: 'warning', SC2115: 'warning' };
  const rank = { error: 3, warning: 2, info: 1, style: 0 };

  /** find unquoted $var / $(cmd) occurrences in one line of shell */
  const scanLine = (line) => {
    const hits = [];
    let q = null;
    let inDB = 0;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q === "'") { if (ch === "'") q = null; continue; }
      if (ch === '\\') { i++; continue; }
      if (ch === '"') { q = q === '"' ? null : '"'; continue; }
      if (ch === '#' && !q && (i === 0 || /\s/.test(line[i - 1]))) break;
      if (ch === "'" && !q) { q = "'"; continue; }
      if (line.slice(i, i + 2) === '[[') inDB++;
      if (line.slice(i, i + 2) === ']]') inDB = Math.max(0, inDB - 1);
      if (line.slice(i, i + 3) === '$((') { let d = 0; for (let j = i + 1; j < line.length; j++) { if (line[j] === '(') d++; if (line[j] === ')') { d--; if (d === 0) { i = j; break; } } } continue; }
      if (line.slice(i, i + 2) === '((' && /^\s*$/.test(line.slice(0, i))) return hits;
      if (!q && !inDB && ch === '$') {
        let m = /^\$\{[^}]*\}/.exec(line.slice(i));
        let kind = 'var';
        if (!m) m = /^\$[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(i));
        if (!m && line[i + 1] === '(') {
          let d = 0;
          let j = i + 1;
          for (; j < line.length; j++) { if (line[j] === '(') d++; if (line[j] === ')') { d--; if (d === 0) break; } }
          m = [line.slice(i, j + 1)];
          kind = 'sub';
        }
        if (m) { hits.push({ col: i, text: m[0], kind }); i += m[0].length - 1; }
      }
    }
    return hits;
  };
  const lintText = (f, text) => {
    const issues = [];
    const lines = text.split('\n');
    if (!/^#!/.test(lines[0]) && !/^#\s*shellcheck\s+shell=/.test(text)) issues.push({ f, ln: 1, col: 1, len: lines[0].length || 1, code: 'SC2148', text: lines[0] });
    const assigned = {};
    lines.forEach((line, idx) => {
      const ln = idx + 1;
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      let m;
      if ((m = /^\s*(?:local\s+|readonly\s+|declare\s+(?:-\w+\s+)?)?([A-Za-z_]\w*)=/.exec(line))) assigned[m[1]] = assigned[m[1]] || ln;
      if ((m = /^\s*(local|export)\s+[A-Za-z_]\w*=.*\$\(/.exec(line))) issues.push({ f, ln, col: line.indexOf(m[1]) + 1, len: m[1].length + 1 + line.slice(line.indexOf(m[1]) + m[1].length + 1).split('=')[0].length, code: 'SC2155', text: line });
      let bt = line.indexOf('`');
      if (bt >= 0 && !/^\s*#/.test(line)) { const e = line.indexOf('`', bt + 1); if (e > bt) issues.push({ f, ln, col: bt + 1, len: e - bt + 1, code: 'SC2006', text: line }); }
      if ((m = /^\s*cd\s+[^|&;]+$/.exec(line)) && !/\|\||&&/.test(line)) issues.push({ f, ln, col: line.indexOf('cd') + 1, len: t.length, code: 'SC2164', text: line });
      if ((m = /(^|;|\|\||&&)\s*read\s+(?!-\w*r)/.exec(line)) && /\bread\b/.test(line) && !/\bread\s+-\w*r/.test(line)) issues.push({ f, ln, col: line.indexOf('read') + 1, len: 4, code: 'SC2162', text: line });
      if ((m = /\bcat\s+(\S+)\s*\|/.exec(line))) issues.push({ f, ln, col: line.indexOf('cat') + 1, len: 3, code: 'SC2002', text: line });
      if (/^\s*(rm\s+-\w*r\w*f?\s+)"?\$\{?\w+\}?\/\*?"?\s*$/.test(line) && !/:\?/.test(line)) { const k = line.indexOf('$'); issues.push({ f, ln, col: k + 1, len: line.length - k, code: 'SC2115', text: line }); }
      const assignOnly = /^\s*(?:local\s+|export\s+|readonly\s+)?[A-Za-z_]\w*=/.test(line);
      for (const h of scanLine(line)) {
        if (assignOnly && h.col > line.indexOf('=')) { if (h.kind === 'sub') continue; if (/^\s*[A-Za-z_]\w*=[^"' ]*$/.test(line.slice(0, line.indexOf('=')) + '=x')) continue; }
        if (/^\s*(case|\[\[|\(\()/.test(line)) continue;
        if (/^\s*for\s+\w+\s+in\b/.test(line) && h.kind === 'var') { issues.push({ f, ln, col: h.col + 1, len: h.text.length, code: 'SC2086', text: line, h }); continue; }
        issues.push({ f, ln, col: h.col + 1, len: h.text.length, code: h.kind === 'sub' ? 'SC2046' : 'SC2086', text: line, h });
      }
    });
    const body = text;
    for (const [name, ln] of Object.entries(assigned)) {
      const used = new RegExp('\\$\\{?!?#?' + name + '\\b|\\b' + name + '\\b\\s*\\[|\\(\\(.*\\b' + name + '\\b|\\bexport\\s+' + name + '\\b|\\$\\{' + name).test(body.split('\n').filter((_, i) => i !== ln - 1 || /\$/.test(body.split('\n')[i])).join('\n').replace(new RegExp('^\\s*(local\\s+)?' + name + '=', 'gm'), ''));
      if (!used && !/^[A-Z][A-Z0-9_]*$/.test(name) || (!used && /^[A-Z]/.test(name) && !new RegExp('\\$\\{?' + name + '\\b').test(body))) {
        const line = lines[ln - 1];
        issues.push({ f, ln, col: line.indexOf(name) + 1, len: name.length, code: 'SC2034', text: line, name });
      }
    }
    return issues;
  };
  LX.shellcheckIssues = (text) => lintText('script', text);
  def('shellcheck', async (c, args) => {
    const sh = c.sh;
    const sevI = args.findIndex((a) => a === '-S' || a === '--severity');
    const minSev = sevI >= 0 ? args[sevI + 1] : 'style';
    const fI = args.indexOf('-f');
    const files = args.filter((a, i) => !a.startsWith('-') && !(sevI >= 0 && i === sevI + 1) && !(fI >= 0 && i === fI + 1));
    if (!files.length) { c.err('shellcheck: No files specified\n'); return 3; }
    let issues = [];
    for (const f of files) {
      let text;
      try { text = sh.readFile(c.abs(f)); } catch (e) { if (!(e instanceof FsErr)) throw e; c.err(`${f}: ${U.errTxt(e)}\n`); return 2; }
      issues = issues.concat(lintText(f, text));
    }
    const shown = issues.filter((i) => rank[SEV[i.code]] >= rank[minSev]).sort((a, b) => a.ln - b.ln || a.col - b.col);
    if (!shown.length) return 0;
    const fmt = args.includes('-f') ? args[args.indexOf('-f') + 1] : 'tty';
    if (fmt === 'gcc') {
      shown.forEach((i) => c.out(`${i.f}:${i.ln}:${i.col}: ${SEV[i.code] === 'info' || SEV[i.code] === 'style' ? 'note' : SEV[i.code]}: ${i.code === 'SC2034' ? i.name + ' ' : ''}${WIKI[i.code]} [${i.code}]\n`));
      return 1;
    }
    const codes = [];
    for (const i of shown) {
      c.out(`\nIn ${i.f} line ${i.ln}:\n${i.text}\n${' '.repeat(Math.max(0, i.col - 1))}^${i.len > 2 ? '-'.repeat(i.len - 2) + '^' : ''} ${i.code} (${SEV[i.code]}): ${i.code === 'SC2034' ? i.name + ' ' : ''}${WIKI[i.code]}\n`);
      if (i.code === 'SC2086' && i.h && i.h.kind === 'var') c.out(`\nDid you mean: \n${i.text.slice(0, i.col - 1)}"${i.h.text}"${i.text.slice(i.col - 1 + i.len)}\n`);
      if (!codes.includes(i.code)) codes.push(i.code);
    }
    c.out('\nFor more information:\n' + codes.map((k) => `  https://www.shellcheck.net/wiki/${k} -- ${(WIKI[k].length > 60 ? WIKI[k].slice(0, 57) + '...' : WIKI[k])}`).join('\n') + '\n');
    return 1;
  }, { pkg: 'shellcheck' });

  /* ---------- flock: a simple lock, released when the script that took it ends ---------- */
  const P = LX.Shell.prototype;
  const origInner = P.runScriptInner;
  P.runScriptInner = async function (text, args, io, name) {
    this.scriptDepth = (this.scriptDepth || 0) + 1;
    const depth = this.scriptDepth;
    try {
      return await origInner.call(this, text, args, io, name);
    } finally {
      if (this.locks) for (const [k, v] of Object.entries(this.locks)) if (v.owner === depth) delete this.locks[k];
      this.scriptDepth = depth - 1;
    }
  };
  def('flock', async (c, args) => {
    const sh = c.sh;
    sh.locks = sh.locks || {};
    let nonblock = false;
    let unlock = false;
    let cmdStr = null;
    const pos = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-n' || a === '--nonblock' || a === '--nb') nonblock = true;
      else if (a === '-u' || a === '--unlock') unlock = true;
      else if (a === '-c' || a === '--command') cmdStr = args[++i];
      else if (a === '-w' || a === '--timeout') { i++; nonblock = true; }
      else if (/^-[xsoe]$|^--(exclusive|shared|close)$/.test(a)) continue;
      else if (a.startsWith('-') && pos.length === 0) { c.err(`flock: unrecognized option '${a}'\nTry 'flock --help' for more information.\n`); return 64; }
      else pos.push(a);
    }
    if (!pos.length) { c.err('flock: bad usage\nTry \'flock --help\' for more information.\n'); return 64; }
    const target = pos[0];
    const isFd = /^\d+$/.test(target);
    const owner = sh.scriptDepth || 0;
    const key = isFd ? `fd${target}:${owner}` : c.abs(target);
    if (unlock) { delete sh.locks[key]; return 0; }
    if (!isFd) {
      const abs = c.abs(target);
      if (!sh.fs.lookup(abs)) {
        try { sh.writeFile(abs, '', false); } catch (e) { if (!(e instanceof FsErr)) throw e; c.err(`flock: cannot open lock file ${target}: ${U.errTxt(e)}\n`); return 1; }
      }
    }
    const held = sh.locks[key];
    if (held && held.owner !== owner && held.owner !== undefined) {
      if (!nonblock) c.err('flock: waiting for the lock to be released is not simulated here\n');
      return 1;
    }
    sh.locks[key] = { owner };
    if (isFd) return 0;
    const rest = cmdStr !== null ? null : pos.slice(1);
    if (cmdStr === null && !rest.length) return 0;
    let st;
    try {
      st = cmdStr !== null ? await sh.runSource(cmdStr, c.io) : await sh.dispatch(rest, c.io);
    } finally {
      delete sh.locks[key];
    }
    return st;
  });
})();
