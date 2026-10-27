/* Linux Academy: small parts of the Python standard library, written in Python itself and run by the simulated interpreter */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const lib = (LX.pyLib = LX.pyLib || {});

  lib.pathlib = String.raw`
import os
import glob as _glob

class Path:
    def __init__(self, *parts):
        p = ""
        for x in parts:
            x = str(x)
            if x.startswith("/"):
                p = x
            elif p == "":
                p = x
            else:
                p = p.rstrip("/") + "/" + x
        if p == "":
            p = "."
        if len(p) > 1:
            p = p.rstrip("/")
        self._p = p
        self.name = os.path.basename(p)
        dot = self.name.rfind(".")
        if dot > 0:
            self.suffix = self.name[dot:]
            self.stem = self.name[:dot]
        else:
            self.suffix = ""
            self.stem = self.name
        d = os.path.dirname(p)
        if d == "" and not p.startswith("/"):
            d = "."
        self.parent_str = d
        self.parts = tuple(["/"] + [x for x in p.split("/") if x] if p.startswith("/") else [x for x in p.split("/") if x])

    @property
    def parent(self):
        return Path(self.parent_str)

    def __str__(self):
        return self._p

    def __repr__(self):
        return "PosixPath('" + self._p + "')"

    def __fspath__(self):
        return self._p

    def __truediv__(self, other):
        return Path(self._p, str(other))

    def __eq__(self, other):
        return str(self) == str(other)

    def __hash__(self):
        return hash(self._p)

    def joinpath(self, *others):
        return Path(self._p, *others)

    def exists(self):
        return os.path.exists(self._p)

    def is_file(self):
        return os.path.isfile(self._p)

    def is_dir(self):
        return os.path.isdir(self._p)

    def is_absolute(self):
        return self._p.startswith("/")

    def absolute(self):
        return Path(os.path.abspath(self._p))

    def resolve(self):
        return Path(os.path.abspath(self._p))

    def expanduser(self):
        return Path(os.path.expanduser(self._p))

    def read_text(self):
        with open(self._p) as f:
            return f.read()

    def write_text(self, data):
        with open(self._p, "w") as f:
            f.write(data)
        return len(data)

    def read_bytes(self):
        return self.read_text()

    def write_bytes(self, data):
        return self.write_text(data)

    def open(self, mode="r"):
        return open(self._p, mode)

    def mkdir(self, mode=0o777, parents=False, exist_ok=False):
        if os.path.exists(self._p):
            if exist_ok and os.path.isdir(self._p):
                return None
            raise FileExistsError("[Errno 17] File exists: '" + self._p + "'")
        if parents:
            os.makedirs(self._p)
        else:
            os.mkdir(self._p)

    def touch(self, exist_ok=True):
        if not os.path.exists(self._p):
            with open(self._p, "w") as f:
                f.write("")

    def unlink(self, missing_ok=False):
        if not os.path.exists(self._p):
            if missing_ok:
                return None
            raise FileNotFoundError("[Errno 2] No such file or directory: '" + self._p + "'")
        os.remove(self._p)

    def rmdir(self):
        os.rmdir(self._p)

    def rename(self, target):
        os.rename(self._p, str(target))
        return Path(str(target))

    def stat(self):
        return os.stat(self._p)

    def chmod(self, mode):
        os.chmod(self._p, mode)

    def iterdir(self):
        return [Path(self._p, x) for x in sorted(os.listdir(self._p))]

    def glob(self, pattern):
        return [Path(x) for x in sorted(_glob.glob(self._p + "/" + pattern))]

    def rglob(self, pattern):
        return [Path(x) for x in sorted(_glob.glob(self._p + "/**/" + pattern, recursive=True))]

    def with_suffix(self, suffix):
        return Path(self.parent_str, self.stem + suffix)

    def with_name(self, name):
        return Path(self.parent_str, name)

    def relative_to(self, other):
        o = str(other).rstrip("/") + "/"
        if self._p.startswith(o):
            return Path(self._p[len(o):])
        raise ValueError("'" + self._p + "' is not in the subpath of '" + str(other) + "'")

    @classmethod
    def home(cls):
        return Path(os.path.expanduser("~"))

    @classmethod
    def cwd(cls):
        return Path(os.getcwd())

PosixPath = Path
PurePath = Path
`;

  lib.logging = String.raw`
import sys
import time

CRITICAL = 50
FATAL = 50
ERROR = 40
WARNING = 30
WARN = 30
INFO = 20
DEBUG = 10
NOTSET = 0
_names = {50: "CRITICAL", 40: "ERROR", 30: "WARNING", 20: "INFO", 10: "DEBUG", 0: "NOTSET"}

def getLevelName(level):
    return _names.get(level, "Level " + str(level))

class Formatter:
    def __init__(self, fmt=None, datefmt=None, style="%"):
        self.fmt = fmt if fmt else "%(message)s"
        self.datefmt = datefmt

    def format(self, rec):
        out = self.fmt
        asctime = time.strftime(self.datefmt if self.datefmt else "%Y-%m-%d %H:%M:%S")
        out = out.replace("%(asctime)s", asctime)
        out = out.replace("%(levelname)s", rec["levelname"])
        out = out.replace("%(levelname)-8s", rec["levelname"].ljust(8))
        out = out.replace("%(name)s", rec["name"])
        out = out.replace("%(message)s", rec["message"])
        out = out.replace("%(levelno)s", str(rec["levelno"]))
        out = out.replace("%(funcName)s", "<module>")
        return out

class Handler:
    def __init__(self, level=0):
        self.level = level
        self.formatter = None
    def setLevel(self, level):
        self.level = level
    def setFormatter(self, fmt):
        self.formatter = fmt
    def handle(self, rec):
        if rec["levelno"] >= self.level:
            f = self.formatter if self.formatter else Formatter()
            self.emit(f.format(rec))

class StreamHandler(Handler):
    def __init__(self, stream=None):
        Handler.__init__(self)
        self.stream = stream if stream else sys.stderr
    def emit(self, text):
        self.stream.write(text + "\n")

class FileHandler(Handler):
    def __init__(self, filename, mode="a"):
        Handler.__init__(self)
        self.filename = filename
        self.mode = mode
    def emit(self, text):
        with open(self.filename, "a") as f:
            f.write(text + "\n")

class NullHandler(Handler):
    def emit(self, text):
        return None

_root_handlers = []
_state = {"level": WARNING, "configured": False}
_loggers = {}

class Logger:
    def __init__(self, name):
        self.name = name
        self.level = 0
        self.handlers = []
        self.propagate = True

    def setLevel(self, level):
        self.level = level

    def addHandler(self, h):
        self.handlers.append(h)

    def removeHandler(self, h):
        if h in self.handlers:
            self.handlers.remove(h)

    def getEffectiveLevel(self):
        if self.level:
            return self.level
        return _state["level"]

    def isEnabledFor(self, level):
        return level >= self.getEffectiveLevel()

    def _log(self, level, msg, args):
        if level < self.getEffectiveLevel():
            return None
        text = str(msg)
        if args:
            text = text % args
        rec = {"levelname": getLevelName(level), "levelno": level, "name": self.name, "message": text}
        used = False
        for h in self.handlers:
            h.handle(rec)
            used = True
        if self.propagate or not used:
            hs = _root_handlers
            if not hs and not _state["configured"]:
                sys.stderr.write(rec["levelname"] + ":" + self.name + ":" + text + "\n")
            for h in hs:
                h.handle(rec)

    def debug(self, msg, *args, **kw):
        self._log(10, msg, args)
    def info(self, msg, *args, **kw):
        self._log(20, msg, args)
    def warning(self, msg, *args, **kw):
        self._log(30, msg, args)
    warn = warning
    def error(self, msg, *args, **kw):
        self._log(40, msg, args)
    def exception(self, msg, *args, **kw):
        self._log(40, msg, args)
    def critical(self, msg, *args, **kw):
        self._log(50, msg, args)
    def log(self, level, msg, *args, **kw):
        self._log(level, msg, args)

_root = Logger("root")

def getLogger(name=None):
    if name is None or name == "root":
        return _root
    if name not in _loggers:
        _loggers[name] = Logger(name)
    return _loggers[name]

def basicConfig(**kw):
    if _state["configured"] and not kw.get("force"):
        return None
    _state["configured"] = True
    _state["level"] = kw.get("level", WARNING)
    fmt = kw.get("format", "%(levelname)s:%(name)s:%(message)s")
    h = FileHandler(kw["filename"]) if "filename" in kw else StreamHandler(kw.get("stream"))
    h.setFormatter(Formatter(fmt, kw.get("datefmt")))
    while _root_handlers:
        _root_handlers.pop()
    _root_handlers.append(h)

def debug(msg, *args, **kw):
    _root._log(10, msg, args)
def info(msg, *args, **kw):
    _root._log(20, msg, args)
def warning(msg, *args, **kw):
    _root._log(30, msg, args)
warn = warning
def error(msg, *args, **kw):
    _root._log(40, msg, args)
def exception(msg, *args, **kw):
    _root._log(40, msg, args)
def critical(msg, *args, **kw):
    _root._log(50, msg, args)
def disable(level=50):
    _state["level"] = level + 1
`;

  lib.fnmatch = String.raw`
import re

def translate(pat):
    i = 0
    n = len(pat)
    res = ""
    while i < n:
        c = pat[i]
        i = i + 1
        if c == "*":
            res = res + ".*"
        elif c == "?":
            res = res + "."
        elif c == "[":
            j = pat.find("]", i)
            if j == -1:
                res = res + "\\["
            else:
                stuff = pat[i:j]
                if stuff.startswith("!"):
                    stuff = "^" + stuff[1:]
                res = res + "[" + stuff + "]"
                i = j + 1
        else:
            res = res + re.escape(c)
    return "^" + res + "$"

def fnmatch(name, pat):
    return re.match(translate(pat), name) is not None

fnmatchcase = fnmatch

def filter(names, pat):
    return [n for n in names if fnmatch(n, pat)]
`;

  lib.glob = String.raw`
import os
import re

def _rx(pat):
    out = ""
    i = 0
    while i < len(pat):
        c = pat[i]
        if c == "*":
            if pat[i:i+3] == "**/":
                out = out + "(?:.*/)?"
                i = i + 3
                continue
            if pat[i:i+2] == "**":
                out = out + ".*"
                i = i + 2
                continue
            out = out + "[^/]*"
        elif c == "?":
            out = out + "[^/]"
        elif c == "[":
            j = pat.find("]", i)
            if j == -1:
                out = out + "\\["
            else:
                out = out + pat[i:j+1]
                i = j
        else:
            out = out + re.escape(c)
        i = i + 1
    return "^" + out + "$"

def _walk(top, recursive):
    found = []
    for d, ds, fs in os.walk(top):
        for x in ds:
            found.append(d.rstrip("/") + "/" + x)
        for x in fs:
            found.append(d.rstrip("/") + "/" + x)
        if not recursive:
            break
    return found

def glob(pattern, recursive=False):
    rx = _rx(pattern)
    absolute = pattern.startswith("/")
    if absolute:
        first_wild = len(pattern)
        for ch in "*?[":
            k = pattern.find(ch)
            if k != -1 and k < first_wild:
                first_wild = k
        top = pattern[:first_wild]
        top = top[:top.rfind("/")] if "/" in top else "/"
        if top == "":
            top = "/"
        base = ""
    else:
        top = "."
        base = "./"
    has_wild = False
    for ch in "*?[":
        if ch in pattern:
            has_wild = True
    if not has_wild:
        return [pattern] if os.path.exists(pattern) else []
    deep = recursive and "**" in pattern
    if not deep:
        depth = pattern.count("/")
    results = []
    for p in _walk(top, True):
        q = p
        if not absolute and q.startswith("./"):
            q = q[2:]
        if re.match(rx, q):
            if not deep and q.count("/") != depth:
                continue
            results.append(q)
    return sorted(results)

def iglob(pattern, recursive=False):
    return glob(pattern, recursive=recursive)
`;

  lib.shlex = String.raw`
import re

def quote(s):
    if s == "":
        return "''"
    if re.match("^[A-Za-z0-9_@%+=:,./-]+$", s):
        return s
    return "'" + s.replace("'", "'\"'\"'") + "'"

def join(parts):
    return " ".join([quote(p) for p in parts])

def split(s):
    out = []
    cur = ""
    in_tok = False
    q = None
    i = 0
    while i < len(s):
        c = s[i]
        if q is not None:
            if c == q:
                q = None
            elif c == "\\" and q == '"' and i + 1 < len(s) and s[i+1] in '"\\$':
                i = i + 1
                cur = cur + s[i]
            else:
                cur = cur + c
        elif c == "'" or c == '"':
            q = c
            in_tok = True
        elif c == "\\" and i + 1 < len(s):
            i = i + 1
            cur = cur + s[i]
            in_tok = True
        elif c == " " or c == "\t" or c == "\n":
            if in_tok:
                out.append(cur)
                cur = ""
                in_tok = False
        else:
            cur = cur + c
            in_tok = True
        i = i + 1
    if q is not None:
        raise ValueError("No closing quotation")
    if in_tok:
        out.append(cur)
    return out
`;

  lib.tempfile = String.raw`
import os
import random

def gettempdir():
    return "/tmp"

def _name(prefix, suffix):
    letters = "abcdefghijklmnopqrstuvwxyz0123456789_"
    s = ""
    for i in range(8):
        s = s + letters[random.randint(0, len(letters) - 1)]
    return prefix + s + suffix

def mkdtemp(suffix="", prefix="tmp", dir=None):
    d = dir if dir else "/tmp"
    p = d + "/" + _name(prefix, suffix)
    os.makedirs(p)
    os.chmod(p, 0o700)
    return p

def mkstemp(suffix="", prefix="tmp", dir=None):
    d = dir if dir else "/tmp"
    p = d + "/" + _name(prefix, suffix)
    with open(p, "w") as f:
        f.write("")
    os.chmod(p, 0o600)
    return (3, p)

class TemporaryDirectory:
    def __init__(self, suffix="", prefix="tmp", dir=None):
        self.name = mkdtemp(suffix, prefix, dir)

    def __enter__(self):
        return self.name

    def __exit__(self, a, b, c):
        self.cleanup()
        return False

    def cleanup(self):
        import shutil
        shutil.rmtree(self.name)
`;

  lib.string = String.raw`
ascii_lowercase = "abcdefghijklmnopqrstuvwxyz"
ascii_uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
ascii_letters = ascii_lowercase + ascii_uppercase
digits = "0123456789"
hexdigits = "0123456789abcdefABCDEF"
punctuation = "!\"#$%&'()*+,-./:;<=>?@[\\]^_{|}~"
whitespace = " \t\n\r"
printable = digits + ascii_letters + punctuation + whitespace
`;

  lib.textwrap = String.raw`
def dedent(text):
    lines = text.split("\n")
    margin = None
    for ln in lines:
        if ln.strip() == "":
            continue
        k = len(ln) - len(ln.lstrip())
        if margin is None or k < margin:
            margin = k
    if not margin:
        return text
    return "\n".join([ln[margin:] if ln.strip() != "" else "" for ln in lines])

def indent(text, prefix):
    return "\n".join([(prefix + ln) if ln.strip() != "" else ln for ln in text.split("\n")])

def wrap(text, width=70):
    words = text.split()
    lines = []
    cur = ""
    for w in words:
        if cur == "":
            cur = w
        elif len(cur) + 1 + len(w) <= width:
            cur = cur + " " + w
        else:
            lines.append(cur)
            cur = w
    if cur != "":
        lines.append(cur)
    return lines

def fill(text, width=70):
    return "\n".join(wrap(text, width))
`;

  lib.itertools = String.raw`
def chain(*iterables):
    out = []
    for it in iterables:
        for x in it:
            out.append(x)
    return out

def product(*iterables):
    result = [[]]
    for pool in iterables:
        result = [r + [x] for r in result for x in pool]
    return [tuple(r) for r in result]

def islice(iterable, *args):
    items = list(iterable)
    if len(args) == 1:
        return items[:args[0]]
    return items[args[0]:args[1]]

def zip_longest(*iterables, fillvalue=None):
    lists = [list(i) for i in iterables]
    n = max([len(l) for l in lists]) if lists else 0
    return [tuple([l[i] if i < len(l) else fillvalue for l in lists]) for i in range(n)]

def combinations(iterable, r):
    pool = list(iterable)
    out = []
    def rec(start, cur):
        if len(cur) == r:
            out.append(tuple(cur))
            return None
        for i in range(start, len(pool)):
            rec(i + 1, cur + [pool[i]])
    rec(0, [])
    return out

def groupby(iterable, key=None):
    out = []
    last = None
    group = []
    first = True
    for x in iterable:
        k = key(x) if key else x
        if first or k != last:
            if not first:
                out.append((last, group))
            group = [x]
            last = k
            first = False
        else:
            group.append(x)
    if not first:
        out.append((last, group))
    return out
`;

  lib.functools = String.raw`
def reduce(function, iterable, *initial):
    it = list(iterable)
    if initial:
        acc = initial[0]
    else:
        acc = it[0]
        it = it[1:]
    for x in it:
        acc = function(acc, x)
    return acc

def partial(func, *pargs, **pkw):
    def inner(*args, **kw):
        merged = dict(pkw)
        merged.update(kw)
        return func(*pargs, *args, **merged)
    return inner

def lru_cache(*dargs, **dkw):
    def deco(f):
        cache = {}
        def wrapper(*args):
            if args not in cache:
                cache[args] = f(*args)
            return cache[args]
        return wrapper
    if len(dargs) == 1 and callable(dargs[0]):
        return deco(dargs[0])
    return deco

def cache(f):
    return lru_cache()(f)

def wraps(f):
    def deco(g):
        return g
    return deco
`;

  lib.typing = String.raw`
class _Alias:
    def __getitem__(self, item):
        return self
    def __call__(self, *a, **k):
        return None

Any = _Alias()
List = _Alias()
Dict = _Alias()
Set = _Alias()
Tuple = _Alias()
Optional = _Alias()
Union = _Alias()
Callable = _Alias()
Iterable = _Alias()
Sequence = _Alias()
Mapping = _Alias()

def TypeVar(name, *a, **k):
    return _Alias()
`;

  lib.csv = String.raw`
def _parse_line(line, delim, quote):
    fields = []
    cur = ""
    inq = False
    i = 0
    while i < len(line):
        c = line[i]
        if inq:
            if c == quote:
                if i + 1 < len(line) and line[i+1] == quote:
                    cur = cur + quote
                    i = i + 1
                else:
                    inq = False
            else:
                cur = cur + c
        elif c == quote:
            inq = True
        elif c == delim:
            fields.append(cur)
            cur = ""
        else:
            cur = cur + c
        i = i + 1
    fields.append(cur)
    return fields

def _lines(f):
    if isinstance(f, str):
        return f.split("\n")
    out = []
    for ln in f:
        out.append(ln.rstrip("\n").rstrip("\r"))
    return out

def reader(f, delimiter=",", quotechar='"'):
    out = []
    for ln in _lines(f):
        if ln == "":
            continue
        out.append(_parse_line(ln, delimiter, quotechar))
    return out

class DictReader:
    def __init__(self, f, fieldnames=None, delimiter=",", quotechar='"'):
        rows = reader(f, delimiter, quotechar)
        if fieldnames is None:
            self.fieldnames = rows[0] if rows else []
            rows = rows[1:]
        else:
            self.fieldnames = fieldnames
        self.rows = []
        for r in rows:
            d = {}
            for i in range(len(self.fieldnames)):
                d[self.fieldnames[i]] = r[i] if i < len(r) else None
            self.rows.append(d)
    def __iter__(self):
        return iter(self.rows)

def _fmt(v, delim, quote):
    s = "" if v is None else str(v)
    if delim in s or quote in s or "\n" in s:
        return quote + s.replace(quote, quote + quote) + quote
    return s

class writer:
    def __init__(self, f, delimiter=",", quotechar='"'):
        self.f = f
        self.delim = delimiter
        self.quote = quotechar
    def writerow(self, row):
        self.f.write(self.delim.join([_fmt(v, self.delim, self.quote) for v in row]) + "\n")
    def writerows(self, rows):
        for r in rows:
            self.writerow(r)

class DictWriter:
    def __init__(self, f, fieldnames, delimiter=","):
        self.f = f
        self.fieldnames = fieldnames
        self.w = writer(f, delimiter)
    def writeheader(self):
        self.w.writerow(self.fieldnames)
    def writerow(self, d):
        self.w.writerow([d.get(k, "") for k in self.fieldnames])
    def writerows(self, rows):
        for r in rows:
            self.writerow(r)
`;

  lib.argparse = String.raw`
import sys

class Namespace:
    def __init__(self, **kw):
        for k in kw:
            setattr(self, k, kw[k])
    def __repr__(self):
        items = []
        for k in self.__dict__:
            items.append(k + "=" + repr(self.__dict__[k]))
        return "Namespace(" + ", ".join(items) + ")"

class _Arg:
    pass

class ArgumentParser:
    def __init__(self, prog=None, description=None, epilog=None, formatter_class=None):
        self.prog = prog if prog else (sys.argv[0].split("/")[-1] if sys.argv else "prog")
        self.description = description
        self.epilog = epilog
        self.args = []

    def add_argument(self, *names, **kw):
        a = _Arg()
        a.names = names
        a.help = kw.get("help", "")
        a.type = kw.get("type", None)
        a.default = kw.get("default", None)
        a.action = kw.get("action", None)
        a.nargs = kw.get("nargs", None)
        a.choices = kw.get("choices", None)
        a.required = kw.get("required", False)
        a.metavar = kw.get("metavar", None)
        a.positional = not names[0].startswith("-")
        if a.positional:
            a.dest = kw.get("dest", names[0])
            a.required = a.nargs != "?" and a.nargs != "*"
        else:
            longs = [n for n in names if n.startswith("--")]
            base = longs[0] if longs else names[0]
            a.dest = kw.get("dest", base.lstrip("-").replace("-", "_"))
        if a.action == "store_true" and "default" not in kw:
            a.default = False
        if a.action == "store_false" and "default" not in kw:
            a.default = True
        if a.action == "count" and "default" not in kw:
            a.default = 0
        if a.action == "append" and "default" not in kw:
            a.default = None
        self.args.append(a)
        return a

    def add_argument_group(self, *a, **k):
        return self

    def add_mutually_exclusive_group(self, *a, **k):
        return self

    def _usage(self):
        parts = ["usage: " + self.prog, "[-h]"]
        for a in self.args:
            if a.positional:
                m = a.metavar or a.dest
                if a.nargs == "?":
                    parts.append("[" + m + "]")
                elif a.nargs == "*":
                    parts.append("[" + m + " ...]")
                elif a.nargs == "+":
                    parts.append(m + " [" + m + " ...]")
                else:
                    parts.append(m)
            else:
                flag = a.names[0]
                if a.action in ("store_true", "store_false", "count"):
                    parts.append("[" + flag + "]")
                else:
                    parts.append("[" + flag + " " + (a.metavar or a.dest.upper()) + "]")
        return " ".join(parts)

    def format_help(self):
        out = self._usage() + "\n"
        if self.description:
            out = out + "\n" + self.description + "\n"
        pos = [a for a in self.args if a.positional]
        opt = [a for a in self.args if not a.positional]
        if pos:
            out = out + "\npositional arguments:\n"
            for a in pos:
                out = out + "  " + (a.metavar or a.dest).ljust(22) + a.help + "\n"
        out = out + "\noptions:\n"
        out = out + "  " + "-h, --help".ljust(22) + "show this help message and exit\n"
        for a in opt:
            left = ", ".join(a.names)
            if a.action not in ("store_true", "store_false", "count"):
                left = left + " " + (a.metavar or a.dest.upper())
            out = out + "  " + left.ljust(22) + a.help + "\n"
        if self.epilog:
            out = out + "\n" + self.epilog + "\n"
        return out

    def print_help(self):
        sys.stdout.write(self.format_help())

    def print_usage(self):
        sys.stdout.write(self._usage() + "\n")

    def error(self, message):
        sys.stderr.write(self._usage() + "\n" + self.prog + ": error: " + message + "\n")
        sys.exit(2)

    def _conv(self, a, v):
        if a.type is not None:
            try:
                v = a.type(v)
            except (ValueError, TypeError):
                self.error("argument " + "/".join(a.names) + ": invalid " + getattr(a.type, "__name__", "value") + " value: '" + str(v) + "'")
        if a.choices is not None and v not in a.choices:
            self.error("argument " + "/".join(a.names) + ": invalid choice: " + repr(v) + " (choose from " + ", ".join([repr(c) for c in a.choices]) + ")")
        return v

    def parse_args(self, args=None):
        if args is None:
            args = sys.argv[1:]
        ns = Namespace()
        for a in self.args:
            setattr(ns, a.dest, a.default)
        pos = [a for a in self.args if a.positional]
        seen = {}
        extras = []
        i = 0
        while i < len(args):
            tok = args[i]
            if tok == "-h" or tok == "--help":
                self.print_help()
                sys.exit(0)
            if tok.startswith("-") and len(tok) > 1 and not tok[1:].isdigit():
                val = None
                name = tok
                if tok.startswith("--") and "=" in tok:
                    name = tok.split("=")[0]
                    val = tok.split("=", 1)[1]
                found = None
                for a in self.args:
                    if not a.positional and name in a.names:
                        found = a
                if found is None:
                    # combined short flags like -vv or -abc
                    if not tok.startswith("--") and len(tok) > 2:
                        ok = True
                        for ch in tok[1:]:
                            hit = None
                            for a in self.args:
                                if not a.positional and ("-" + ch) in a.names and a.action in ("store_true", "count"):
                                    hit = a
                            if hit is None:
                                ok = False
                        if ok:
                            for ch in tok[1:]:
                                for a in self.args:
                                    if not a.positional and ("-" + ch) in a.names:
                                        if a.action == "count":
                                            setattr(ns, a.dest, getattr(ns, a.dest) + 1)
                                        else:
                                            setattr(ns, a.dest, True)
                            i = i + 1
                            continue
                    self.error("unrecognized arguments: " + tok)
                seen[found.dest] = True
                if found.action == "store_true":
                    setattr(ns, found.dest, True)
                elif found.action == "store_false":
                    setattr(ns, found.dest, False)
                elif found.action == "count":
                    setattr(ns, found.dest, getattr(ns, found.dest) + 1)
                else:
                    if val is None:
                        if i + 1 >= len(args):
                            self.error("argument " + "/".join(found.names) + ": expected one argument")
                        i = i + 1
                        val = args[i]
                    if found.nargs == "+" or found.nargs == "*":
                        vals = [self._conv(found, val)]
                        while i + 1 < len(args) and not args[i + 1].startswith("-"):
                            i = i + 1
                            vals.append(self._conv(found, args[i]))
                        setattr(ns, found.dest, vals)
                    elif found.action == "append":
                        cur = getattr(ns, found.dest)
                        if cur is None:
                            cur = []
                        cur.append(self._conv(found, val))
                        setattr(ns, found.dest, cur)
                    else:
                        setattr(ns, found.dest, self._conv(found, val))
            else:
                extras.append(tok)
            i = i + 1
        k = 0
        for a in pos:
            if a.nargs == "+" or a.nargs == "*":
                vals = extras[k:]
                k = len(extras)
                if a.nargs == "+" and not vals:
                    self.error("the following arguments are required: " + a.dest)
                setattr(ns, a.dest, [self._conv(a, v) for v in vals])
            elif k < len(extras):
                setattr(ns, a.dest, self._conv(a, extras[k]))
                k = k + 1
            elif a.nargs == "?":
                pass
            else:
                missing = [p.dest for p in pos[pos.index(a):] if p.nargs not in ("?", "*")]
                self.error("the following arguments are required: " + ", ".join(missing))
        if k < len(extras):
            self.error("unrecognized arguments: " + " ".join(extras[k:]))
        for a in self.args:
            if not a.positional and a.required and a.dest not in seen:
                self.error("the following arguments are required: " + "/".join(a.names))
        return ns
`;

  lib._collections_extra = String.raw`
def namedtuple(typename, field_names):
    if isinstance(field_names, str):
        field_names = field_names.replace(",", " ").split()
    names = list(field_names)
    class NT:
        _fields = tuple(names)
        def __init__(self, *args, **kw):
            for i in range(len(names)):
                setattr(self, names[i], args[i] if i < len(args) else kw.get(names[i]))
        def __repr__(self):
            return typename + "(" + ", ".join([n + "=" + repr(getattr(self, n)) for n in names]) + ")"
        def __getitem__(self, i):
            return getattr(self, names[i])
        def __iter__(self):
            return iter([getattr(self, n) for n in names])
        def __len__(self):
            return len(names)
        def __eq__(self, other):
            return list(self) == list(other)
        def _asdict(self):
            return dict([(n, getattr(self, n)) for n in names])
    return NT
`;

  // hashlib and urllib need the host: they are written in JS in ext-py (hashlib) -- here only the glue lib for configparser-lite
  lib.configparser = String.raw`
class ConfigParser:
    def __init__(self):
        self._d = {}
    def read(self, path):
        import os
        if not os.path.exists(path):
            return []
        self.read_string(open(path).read())
        return [path]
    def read_string(self, text):
        cur = None
        for raw in text.split("\n"):
            ln = raw.strip()
            if ln == "" or ln.startswith("#") or ln.startswith(";"):
                continue
            if ln.startswith("[") and ln.endswith("]"):
                cur = ln[1:-1]
                if cur not in self._d:
                    self._d[cur] = {}
            elif cur is not None and ("=" in ln or ":" in ln):
                sep = "=" if "=" in ln else ":"
                k, v = ln.split(sep, 1)
                self._d[cur][k.strip().lower()] = v.strip()
    def sections(self):
        return list(self._d.keys())
    def has_section(self, s):
        return s in self._d
    def has_option(self, s, o):
        return s in self._d and o.lower() in self._d[s]
    def options(self, s):
        return list(self._d[s].keys())
    def get(self, s, o, fallback=None):
        if s in self._d and o.lower() in self._d[s]:
            return self._d[s][o.lower()]
        if fallback is not None:
            return fallback
        raise KeyError(o)
    def getint(self, s, o, fallback=None):
        return int(self.get(s, o, fallback))
    def getboolean(self, s, o, fallback=None):
        return str(self.get(s, o, fallback)).lower() in ("1", "yes", "true", "on")
    def __getitem__(self, s):
        return self._d[s]
    def __contains__(self, s):
        return s in self._d
    def set(self, s, o, v):
        if s not in self._d:
            self._d[s] = {}
        self._d[s][o.lower()] = str(v)
    def add_section(self, s):
        self._d[s] = {}
    def write(self, f):
        for s in self._d:
            f.write("[" + s + "]\n")
            for k in self._d[s]:
                f.write(k + " = " + self._d[s][k] + "\n")
            f.write("\n")
`;
})();
