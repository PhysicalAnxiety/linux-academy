p='js/sim-core.js'
s=open(p).read()
def rep(a,b,cnt=1):
    global s
    assert a in s, a[:80]
    s=s.replace(a,b,cnt)

# 1 tokenizer: pending heredocs
rep("""    const toks = [];
    let segs = [];
    let ws = 0;
    let i = 0;
    const n = src.length;""","""    const toks = [];
    const pending = [];
    let segs = [];
    let ws = 0;
    let i = 0;
    const n = src.length;""")
rep("""      if (c === '\\n') {
        end();
        toks.push({ t: 'nl', s: i, e: i + 1 });
        i++;
        continue;
      }""","""      if (c === '\\n') {
        end();
        toks.push({ t: 'nl', s: i, e: i + 1 });
        i++;
        while (pending.length) {
          const hd = pending.shift();
          const lines = [];
          let found = false;
          while (i <= n) {
            let j = src.indexOf('\\n', i);
            const hasNl = j >= 0;
            if (!hasNl) j = n;
            let line = src.slice(i, j);
            i = hasNl ? j + 1 : n + 1;
            const cmp = hd.strip ? line.replace(/^\\t+/, '') : line;
            if (cmp === hd.delim) {
              found = true;
              break;
            }
            lines.push(hd.strip ? cmp : line);
            if (!hasNl) break;
          }
          if (!found) throw new Incomplete();
          hd.body = lines.length ? lines.join('\\n') + '\\n' : '';
        }
        continue;
      }""")
rep("""      if ('|&;<>()'.includes(c)) {
        let fd = null;""","""      if (c === '<' && src[i + 1] === '<') {
        end();
        if (src[i + 2] === '<') {
          toks.push({ t: 'op', v: '<<<', s: i, e: i + 3, fd: 0 });
          i += 3;
          continue;
        }
        let j = i + 2;
        let strip = false;
        if (src[j] === '-') {
          strip = true;
          j++;
        }
        while (src[j] === ' ' || src[j] === '\\t') j++;
        const m = /^(['"]?)([^\\s;|&<>()'"]+)\\1/.exec(src.slice(j));
        if (!m) throw new SyntaxErr("syntax error near unexpected token `newline'");
        const hd = { delim: m[2], quoted: m[1] !== '', strip, body: null };
        pending.push(hd);
        toks.push({ t: 'op', v: '<<', s: i, e: j + m[0].length, fd: 0, hd });
        i = j + m[0].length;
        continue;
      }
      if (c === '(' && src[i + 1] === '(' && !segs.length) {
        const lt = toks[toks.length - 1];
        const KW = ['for', 'if', 'while', 'until', 'then', 'do', 'else', 'elif'];
        const okPrev = !lt || lt.t === 'nl' || (lt.t === 'op' && lt.v !== ')') || (lt.t === 'w' && lt.segs.length === 1 && KW.includes(lt.segs[0].s));
        if (okPrev) {
          const j = scanParen(src, i);
          if (src[j - 1] === ')') {
            toks.push({ t: 'arith', expr: src.slice(i + 2, j - 1), s: i, e: j + 1 });
            i = j + 1;
            continue;
          }
        }
      }
      if ('|&;<>()'.includes(c)) {
        let fd = null;""")
rep("""        } else if (c === '<' && nx === '<') throw new SyntaxErr("here-documents (<<) are not supported in this sandbox. Try: echo 'text' > file");""","""        } else if (c === ';' && nx === ';') v = ';;';""")

# 2 parser
rep("const RESERVED = ['then', 'elif', 'else', 'fi', 'do', 'done', '}'];","const RESERVED = ['then', 'elif', 'else', 'fi', 'do', 'done', 'esac', '}'];")
rep("const isRedirTok = (t) => t && t.t === 'op' && ['>', '>>', '<', '&>', '>&'].includes(t.v);","const isRedirTok = (t) => t && t.t === 'op' && ['>', '>>', '<', '&>', '>&', '<<', '<<<'].includes(t.v);")
rep("""        const t = toks[p++];
        if (t.v === '>&') {""","""        const t = toks[p++];
        if (t.v === '<<') {
          into.push({ v: '<<', fd: 0, hd: t.hd });
          continue;
        }
        if (t.v === '>&') {""")
open(p,'w').write(s)
print('ok1')
