/* Linux Academy: storage simulation (disks, partitions, filesystems, mounts, swap, LVM, RAID, NFS, dd) */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS, Shell } = LX;
  const U = LX.U;
  const P = Shell.prototype;
  LX.initHooks = LX.initHooks || [];
  const GiB = 1073741824;
  const MiB = 1048576;

  const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((Math.random() * 16) | 0).toString(16));
  const hs = (b) => {
    if (b >= GiB) return `${+(b / GiB).toFixed(1)}G`;
    if (b >= MiB) return `${Math.round(b / MiB)}M`;
    return `${Math.round(b / 1024)}K`;
  };
  const hsFull = (b) => (b >= GiB ? `${+(b / GiB).toFixed(2)} GiB` : `${+(b / MiB).toFixed(2)} MiB`);
  const parseSize = (s, base) => {
    const m = /^([+-]?)(\d+(?:\.\d+)?)([KMGTP]?)(i?B)?$/i.exec(String(s).trim());
    if (!m) return null;
    const mult = { '': 1, K: 1024, M: MiB, G: GiB, T: GiB * 1024, P: GiB * 1048576 }[m[3].toUpperCase()];
    return { sign: m[1], bytes: Math.round(+m[2] * mult) };
  };

  /* ---------- device registry ---------- */
  LX.initHooks.push((sh) => {
    sh.devs = {};
    sh.mounts = [];
    sh.swaps = [];
    sh.vgs = {};
    sh.lastDaemonReload = Date.now();
    const addDisk = (name, size, table, parts) => {
      const d = { path: '/dev/' + name, name, type: 'disk', size, table, parent: null, fs: null, uuid: null, label: null, data: null, major: 8, minor: (name.charCodeAt(2) - 97) * 16, model: 'Virtual disk' };
      sh.devs[d.path] = d;
      let start = 2048;
      (parts || []).forEach((p) => {
        const dev = { path: `/dev/${name}${p.n}`, name: `${name}${p.n}`, type: 'part', size: p.size, parent: d.path, fs: p.fs || null, uuid: p.fs ? uuid() : null, label: p.label || null, data: null, major: 8, minor: d.minor + p.n, partNum: p.n, ptype: p.ptype || 'Linux filesystem', start };
        start += Math.ceil(p.size / 512);
        sh.devs[dev.path] = dev;
      });
    };
    addDisk('sda', 25 * GiB, 'gpt', [
      { n: 1, size: Math.round(24.9 * GiB), fs: 'ext4', label: 'cloudimg-rootfs' },
      { n: 14, size: 4 * MiB, ptype: 'BIOS boot' },
      { n: 15, size: 106 * MiB, fs: 'vfat', label: 'UEFI', ptype: 'EFI System' },
    ]);
    addDisk('sdb', 10 * GiB, null, []);
    addDisk('sdc', 5 * GiB, null, []);
    addDisk('sdd', 5 * GiB, null, []);
    sh.devs['/dev/sda1'].used = Math.round(8.4 * GiB);
    sh.mounts.push({ dev: '/dev/sda1', target: '/', fs: 'ext4', opts: 'rw,relatime,discard,errors=remount-ro' }, { dev: '/dev/sda15', target: '/boot/efi', fs: 'vfat', opts: 'rw,relatime,fmask=0077,dmask=0077' });
    sh.swaps.push({ file: '/swap.img', type: 'file', size: 2 * GiB, prio: -2 });
    sh.fs.put('/swap.img', '', { owner: 'root', group: 'root', mode: 0o600, size: 2 * GiB, swap: true, bin: true });
    sh.fs.mkdirp('/boot/efi', { owner: 'root', group: 'root' });
    sh.fs.put('/etc/fstab', '# /etc/fstab: static file system information.\n#\n# Use \'blkid\' to print the universally unique identifier for a\n# device; this may be used with UUID= as a more robust way to name devices\n# that works even if disks are added and removed. See fstab(5).\n#\n# <file system> <mount point>   <type>  <options>       <dump>  <pass>\nLABEL=cloudimg-rootfs\t/\t ext4\tdiscard,errors=remount-ro\t0 1\nLABEL=UEFI\t/boot/efi\tvfat\tumask=0077\t0 1\n/swap.img\tnone\tswap\tsw\t0 0\n', { owner: 'root', group: 'root' });
    for (const d of Object.values(sh.devs)) devNode(sh, d);
    sh.fs.mkdirp('/mnt', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/media', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/etc/mdadm', { owner: 'root', group: 'root' });
  });
  function devNode(sh, d) {
    const dir = sh.fs.mkdirp('/dev', { owner: 'root', group: 'root' });
    dir.kids[d.name] = sh.fs.mk('c', { owner: 'root', group: 'disk', mode: 0o660, blk: true, size: 0 });
  }
  const sortedDevs = (sh) => Object.values(sh.devs).sort((a, b) => (a.path < b.path ? -1 : 1));
  P.getDev = function (path, create) {
    if (!path) return null;
    if (this.devs[path]) return this.devs[path];
    const real = path.startsWith('/dev/mapper/') ? this.devs['/dev/' + (path.slice(12).replace('-', '/'))] : null;
    if (real) return real;
    const n = this.fs.lookup(path);
    if (n && n.t === 'f' && create !== false && (n.size || n.content !== undefined) && !path.startsWith('/dev/')) {
      if (!n.loopDev) {
        n.loopDev = { path, name: VFS.base(path), type: 'loop', size: n.size || 0, parent: null, fs: null, data: null, file: true };
      }
      this.devs[path] = n.loopDev;
      return n.loopDev;
    }
    return null;
  };
  const byRef = (sh, ref) => {
    let m;
    if ((m = /^UUID=(.+)$/.exec(ref))) return Object.values(sh.devs).find((d) => d.uuid === m[1].replace(/"/g, ''));
    if ((m = /^LABEL=(.+)$/.exec(ref))) return Object.values(sh.devs).find((d) => d.label === m[1].replace(/"/g, ''));
    if ((m = /^PARTUUID=(.+)$/.exec(ref))) return null;
    return sh.getDev(ref);
  };
  P.mountOf = function (devPath) {
    return this.mounts.find((m) => m.dev === devPath);
  };
  P.mountsTable = function () {
    return [
      { dev: 'sysfs', target: '/sys', fs: 'sysfs', opts: 'rw,nosuid,nodev,noexec,relatime' },
      { dev: 'proc', target: '/proc', fs: 'proc', opts: 'rw,nosuid,nodev,noexec,relatime' },
      { dev: 'udev', target: '/dev', fs: 'devtmpfs', opts: 'rw,nosuid,relatime,size=1980000k,nr_inodes=495000,mode=755' },
      { dev: 'tmpfs', target: '/run', fs: 'tmpfs', opts: 'rw,nosuid,nodev,noexec,relatime,size=404680k,mode=755' },
      ...this.mounts,
      { dev: 'tmpfs', target: '/dev/shm', fs: 'tmpfs', opts: 'rw,nosuid,nodev' },
    ];
  };
  P.swapTotal = function () {
    return this.swaps.reduce((s, x) => s + x.size, 0) / 1024;
  };
  P.swapTable = function () {
    return 'Filename\t\t\t\tType\t\tSize\t\tUsed\t\tPriority\n' + this.swaps.map((s) => `${s.file.padEnd(40)}${s.type}\t\t${Math.round(s.size / 1024)}\t\t0\t\t${s.prio}`).join('\n') + (this.swaps.length ? '\n' : '');
  };
  P.partitionsTable = function () {
    return 'major minor  #blocks  name\n\n' + sortedDevs(this).filter((d) => d.type !== 'loop').map((d) => `${String(d.major).padStart(4)} ${String(d.minor).padStart(5)} ${String(Math.round(d.size / 1024)).padStart(9)} ${d.name}`).join('\n') + '\n';
  };

  function mountDev(sh, dev, target, fs, opts) {
    const node = sh.fs.lookup(target);
    if (!dev.data) {
      dev.data = { 'lost+found': sh.fs.mk('d', { owner: 'root', group: 'root', mode: 0o700 }) };
      if (dev.fs === 'xfs' || dev.fs === 'vfat' || dev.fs === 'nfs4') delete dev.data['lost+found'];
    }
    node._hidden = node.kids;
    node.kids = dev.data;
    node._mountDev = dev.path;
    sh.mounts.push({ dev: dev.path, target, fs: fs || dev.fs, opts: opts || 'rw,relatime' });
  }
  function umountTarget(sh, m) {
    const node = sh.fs.lookup(m.target);
    const dev = sh.getDev(m.dev) || sh.nfsDevs && sh.nfsDevs[m.dev];
    if (node && node._hidden) {
      if (dev) dev.data = node.kids;
      node.kids = node._hidden;
      delete node._hidden;
      delete node._mountDev;
    }
    sh.mounts = sh.mounts.filter((x) => x !== m);
  }
  P.mountEntry = function (dev, target, fs, opts) {
    mountDev(this, dev, target, fs, opts);
  };
  const needRoot = (c, msg) => {
    if (c.sh.eu() === 'root') return false;
    c.err(msg);
    return true;
  };
  const stdinLine = async (c, prompt) => {
    if (c.io.stdin !== null && c.io.stdin !== undefined) {
      c.out(prompt);
      if (c.io.stdin === '') return null;
      const i = c.io.stdin.indexOf('\n');
      const line = i < 0 ? c.io.stdin : c.io.stdin.slice(0, i);
      c.io.stdin = i < 0 ? '' : c.io.stdin.slice(i + 1);
      return line;
    }
    if (!c.sh.hooks.readLine) return null;
    const r = await c.sh.hooks.readLine(prompt);
    c.sh.checkAbort();
    return r;
  };

  /* ---------- lsblk ---------- */
  const typeLabel = (d) => d.type;
  def('lsblk', async (c, args) => {
    const sh = c.sh;
    const { o, rest: rest0 } = parseOpts(args, ['-o']);
    const cols = o.o ? o.o.split(',').map((x) => x.toUpperCase()) : o.f ? ['NAME', 'FSTYPE', 'FSVER', 'LABEL', 'UUID', 'FSAVAIL', 'FSUSE%', 'MOUNTPOINTS'] : ['NAME', 'MAJ:MIN', 'RM', 'SIZE', 'RO', 'TYPE', 'MOUNTPOINTS'];
    const all = sortedDevs(sh).filter((d) => d.type !== 'loop');
    const childrenOf = (p) => all.filter((d) => d.parent === p);
    const rows = [];
    const walk = (d, prefix, last, depth) => {
      const mnt = sh.mounts.filter((m) => m.dev === d.path).map((m) => m.target);
      if (d.swapOn) mnt.push('[SWAP]');
      const kids = childrenOf(d.path);
      const label = o.l || o.d ? d.name : depth === 0 ? d.name : prefix + (last ? '└─' : '├─') + d.name;
      const cell = {
        NAME: label,
        'MAJ:MIN': `${d.major}:${d.minor}`,
        RM: '0',
        SIZE: hs(d.size),
        RO: '0',
        TYPE: typeLabel(d),
        MOUNTPOINTS: mnt.join(','),
        MOUNTPOINT: mnt[0] || '',
        FSTYPE: d.fs || '',
        FSVER: d.fs === 'ext4' ? '1.0' : d.fs === 'xfs' ? '' : d.fs === 'vfat' ? 'FAT32' : '',
        LABEL: d.label || '',
        UUID: d.uuid || '',
        FSAVAIL: '',
        'FSUSE%': '',
        PATH: d.path,
        PARTTYPE: '',
      };
      rows.push(cell);
      if (o.d) return;
      kids.forEach((k, i) => walk(k, depth === 0 ? '' : prefix + (last ? '  ' : '│ '), i === kids.length - 1, depth + 1));
    };
    const roots = rest0.length ? all.filter((d) => rest0.includes(d.path)) : all.filter((d) => !d.parent);
    roots.forEach((d) => walk(d, '', true, 0));
    const w = cols.map((cn) => Math.max(cn.length, ...rows.map((r) => (r[cn] || '').length)));
    if (!o.n) c.out(cols.map((cn, i) => (['SIZE', 'MAJ:MIN'].includes(cn) ? cn.padStart(w[i]) : cn.padEnd(w[i]))).join(' ').replace(/\s+$/, '') + '\n');
    for (const r of rows) c.out(cols.map((cn, i) => (['SIZE'].includes(cn) ? (r[cn] || '').padStart(w[i]) : (r[cn] || '').padEnd(w[i]))).join(' ').replace(/\s+$/, '') + '\n');
  });
  function parseOpts(args, vals) {
    const o = {};
    const rest = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (vals.includes(a)) o[a.replace(/^-+/, '')] = args[++i];
      else if (a.startsWith('--') && a.includes('=')) o[a.slice(2, a.indexOf('='))] = a.slice(a.indexOf('=') + 1);
      else if (a.startsWith('--') && a.length > 2) o[a.slice(2)] = true;
      else if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) {
        for (let q = 0; q < a.length - 1; q++) {
          const ch = a[q + 1];
          if (vals.includes('-' + ch)) {
            o[ch] = q + 2 < a.length ? a.slice(q + 2) : args[++i];
            break;
          }
          o[ch] = true;
        }
      }
      else rest.push(a);
    }
    return { o, rest };
  }

  /* ---------- fdisk / parted ---------- */
  const PTYPES = { 83: 'Linux filesystem', linux: 'Linux filesystem', 82: 'Linux swap', swap: 'Linux swap', '8e': 'Linux LVM', lvm: 'Linux LVM', fd: 'Linux RAID', raid: 'Linux RAID', ef: 'EFI System', uefi: 'EFI System', 8300: 'Linux filesystem' };
  def('fdisk', async (c, args) => {
    const sh = c.sh;
    const { o, rest } = parseOpts(args, []);
    if (needRoot(c, `fdisk: cannot open ${rest[0] || '/dev/sda'}: Permission denied\n`)) return 1;
    if (o.l) {
      for (const d of sortedDevs(sh).filter((x) => x.type === 'disk' && (!rest[0] || x.path === rest[0]))) printDisk(c, d, sh);
      return 0;
    }
    const disk = sh.devs[rest[0]];
    if (!disk || disk.type !== 'disk') {
      c.err(`fdisk: cannot open ${rest[0]}: No such file or directory\n`);
      return 1;
    }
    c.out('Welcome to fdisk (util-linux 2.39.3).\nChanges will remain in memory only, until you decide to write them.\nBe careful before using the write command.\n\n');
    let table = disk.table;
    let parts = sortedDevs(sh).filter((d) => d.parent === disk.path).map((d) => ({ ...d }));
    if (!table) {
      table = 'dos';
      c.out(`Device does not contain a recognized partition table.\nCreated a new DOS (MBR) disklabel with disk identifier 0x${Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0')}.\n\n`);
    }
    let dirty = false;
    const sectors = disk.size / 512;
    const lastEnd = () => parts.reduce((m, p) => Math.max(m, p.start + Math.ceil(p.size / 512) - 1), 2047);
    for (;;) {
      const cmd = await stdinLine(c, 'Command (m for help): ');
      if (cmd === null) break;
      const k = cmd.trim().toLowerCase();
      if (k === 'm') c.out('\nHelp:\n\n  Generic\n   d   delete a partition\n   F   list free unpartitioned space\n   l   list known partition types\n   n   add a new partition\n   p   print the partition table\n   t   change a partition type\n   v   verify the partition table\n\n  Misc\n   m   print this menu\n\n  Create a new label\n   g   create a new empty GPT partition table\n   o   create a new empty DOS partition table\n\n  Save & Exit\n   w   write table to disk and exit\n   q   quit without saving changes\n\n');
      else if (k === 'p') {
        c.out(`Disk ${disk.path}: ${hsFull(disk.size)}, ${disk.size} bytes, ${sectors} sectors\nDisk model: ${disk.model}\nUnits: sectors of 1 * 512 = 512 bytes\nSector size (logical/physical): 512 bytes / 512 bytes\nI/O size (minimum/optimal): 512 bytes / 512 bytes\nDisklabel type: ${table}\n`);
        if (parts.length) {
          c.out('\nDevice     Start       End   Sectors  Size Type\n');
          parts.sort((a, b) => a.partNum - b.partNum).forEach((p) => c.out(`${p.path.padEnd(10)} ${String(p.start).padStart(7)} ${String(p.start + Math.ceil(p.size / 512) - 1).padStart(9)} ${String(Math.ceil(p.size / 512)).padStart(9)} ${hs(p.size).padStart(5)} ${p.ptype}\n`));
        }
        c.out('\n');
      } else if (k === 'g' || k === 'o') {
        table = k === 'g' ? 'gpt' : 'dos';
        parts = [];
        dirty = true;
        c.out(`Created a new ${k === 'g' ? 'GPT' : 'DOS (MBR)'} disklabel with disk identifier ${uuid().toUpperCase()}.\n`);
      } else if (k === 'n') {
        const used = parts.map((p) => p.partNum);
        let def = 1;
        while (used.includes(def)) def++;
        if (table === 'dos') {
          if (used.length >= 4) {
            c.out('No free sectors available.\n');
            continue;
          }
          const t = await stdinLine(c, `Partition type\n   p   primary (${used.length} primary, 0 extended, ${4 - used.length} free)\n   e   extended (container for logical partitions)\nSelect (default p): `);
          if (t === null) break;
        }
        const nn = await stdinLine(c, `Partition number (${def}-${table === 'gpt' ? 128 : 4}, default ${def}): `);
        if (nn === null) break;
        const num = nn.trim() ? +nn : def;
        if (used.includes(num)) {
          c.out(`Partition number ${num} is already in use.\n`);
          continue;
        }
        const defStart = Math.ceil((lastEnd() + 1) / 2048) * 2048;
        const fs0 = await stdinLine(c, `First sector (2048-${sectors - 2049}, default ${defStart}): `);
        if (fs0 === null) break;
        const start = fs0.trim() ? +fs0 : defStart;
        const lastS = await stdinLine(c, `Last sector, +/-sectors or +/-size{K,M,G,T,P} (${start}-${sectors - 2049}, default ${sectors - 2049}): `);
        if (lastS === null) break;
        let size;
        const ls = lastS.trim();
        if (!ls) size = (sectors - 2048 - start + 1) * 512;
        else if (ls.startsWith('+')) {
          const sz = parseSize(ls);
          size = sz ? sz.bytes : 0;
        } else size = (+ls - start + 1) * 512;
        if (size <= 0 || start + size / 512 > sectors) {
          c.out('Value out of range.\n');
          continue;
        }
        parts.push({ path: `${disk.path}${num}`, name: `${disk.name}${num}`, type: 'part', size, parent: disk.path, fs: null, partNum: num, ptype: 'Linux filesystem', start, major: 8, minor: disk.minor + num, isNew: true });
        dirty = true;
        c.out(`\nCreated a new partition ${num} of type 'Linux filesystem' and of size ${hsFull(size).replace(' GiB', ' GiB').replace(' MiB', ' MiB')}.\n\n`);
      } else if (k === 'd') {
        let num;
        if (parts.length === 1) num = parts[0].partNum;
        else {
          const a = await stdinLine(c, `Partition number (${parts.map((p) => p.partNum).join(',')}, default ${parts[parts.length - 1] ? parts[parts.length - 1].partNum : 1}): `);
          if (a === null) break;
          num = a.trim() ? +a : parts[parts.length - 1].partNum;
        }
        const idx = parts.findIndex((p) => p.partNum === num);
        if (idx < 0) {
          c.out('Selected partition ' + num + ' does not exist.\n');
          continue;
        }
        c.out(`Partition ${num} has been deleted.\n`);
        parts.splice(idx, 1);
        dirty = true;
      } else if (k === 't') {
        let num = parts.length === 1 ? parts[0].partNum : null;
        if (num === null) {
          const a = await stdinLine(c, 'Partition number: ');
          if (a === null) break;
          num = +a;
        }
        const pt = parts.find((p) => p.partNum === num);
        if (!pt) {
          c.out('Selected partition ' + num + ' does not exist.\n');
          continue;
        }
        const code = await stdinLine(c, 'Partition type or alias (type L to list all): ');
        if (code === null) break;
        const nt = PTYPES[code.trim().toLowerCase()];
        if (!nt) {
          c.out('Type of partition ' + num + ' is unchanged.\n');
          continue;
        }
        c.out(`Changed type of partition '${pt.ptype}' to '${nt}'.\n`);
        pt.ptype = nt;
        dirty = true;
      } else if (k === 'w') {
        for (const old of sortedDevs(sh).filter((d) => d.parent === disk.path)) {
          if (!parts.find((p) => p.path === old.path)) {
            delete sh.devs[old.path];
            const dd = sh.fs.lookup('/dev');
            delete dd.kids[old.name];
          }
        }
        disk.table = table;
        for (const p of parts) {
          const ex = sh.devs[p.path];
          if (ex) {
            ex.ptype = p.ptype;
            if (p.ptype === 'Linux LVM') ex.fs = ex.fs;
          } else {
            const nd = Object.assign({ uuid: null, label: null, data: null }, p);
            delete nd.isNew;
            sh.devs[p.path] = nd;
            devNode(sh, nd);
          }
        }
        c.out('The partition table has been altered.\nCalling ioctl() to re-read partition table.\nSyncing disks.\n');
        return 0;
      } else if (k === 'q') {
        if (dirty) c.out('');
        return 0;
      } else if (k) c.out(`${cmd.trim()}: unknown command\n`);
    }
    return 0;
  });
  function printDisk(c, d, sh) {
    c.out(`Disk ${d.path}: ${hsFull(d.size)}, ${d.size} bytes, ${d.size / 512} sectors\nDisk model: ${d.model}\nUnits: sectors of 1 * 512 = 512 bytes\nSector size (logical/physical): 512 bytes / 512 bytes\nI/O size (minimum/optimal): 512 bytes / 512 bytes\n`);
    if (d.table) c.out(`Disklabel type: ${d.table}\nDisk identifier: ${(d.diskId = d.diskId || uuid().toUpperCase())}\n`);
    const parts = sortedDevs(sh).filter((x) => x.parent === d.path && x.type === 'part');
    if (parts.length) {
      c.out('\nDevice       Start      End  Sectors  Size Type\n');
      parts.forEach((p) => c.out(`${p.path.padEnd(12)} ${String(p.start).padStart(7)} ${String(p.start + Math.ceil(p.size / 512) - 1).padStart(8)} ${String(Math.ceil(p.size / 512)).padStart(8)} ${hs(p.size).padStart(5)} ${p.ptype}\n`));
    }
    c.out('\n');
  }
  def('parted', async (c, args) => {
    const sh = c.sh;
    const script = args.includes('-s') || args.includes('--script');
    const rest = args.filter((a) => !/^-/.test(a));
    if (args.includes('-l')) {
      for (const d of sortedDevs(sh).filter((x) => x.type === 'disk')) partedPrint(c, d, sh);
      return 0;
    }
    if (needRoot(c, `Error: Could not stat device ${rest[0]} - Permission denied.\n`)) return 1;
    const disk = sh.devs[rest[0]];
    if (!disk) {
      c.err(`Error: Could not stat device ${rest[0]} - No such file or directory.\n`);
      return 1;
    }
    const cmds = rest.slice(1);
    if (!cmds.length) {
      c.err('parted: interactive mode is not available in this sandbox. Use: parted -s DEVICE mklabel gpt mkpart primary ext4 1MiB 100%\n');
      return 1;
    }
    const pos = (s, total) => {
      if (s.endsWith('%')) return Math.round((total * parseFloat(s)) / 100);
      const m = /^(\d+(?:\.\d+)?)(MiB|GiB|MB|GB|TB|TiB|kB|KiB|s)?$/.exec(s);
      if (!m) return null;
      const mult = { MiB, GiB, MB: 1e6, GB: 1e9, TB: 1e12, TiB: GiB * 1024, kB: 1000, KiB: 1024, s: 512, undefined: MiB }[m[2]];
      return Math.round(+m[1] * mult);
    };
    const VERBS = ['mklabel', 'mkpart', 'rm', 'set', 'print', 'name', 'unit', 'quit', 'resizepart', 'align-check'];
    // parted accepts several commands in one call: split them at the verbs
    const groups = [];
    for (const tk of cmds) {
      if (VERBS.includes(tk)) groups.push([tk]);
      else if (groups.length) groups[groups.length - 1].push(tk);
      else groups.push([tk]);
    }
    for (const g of groups) {
      const rc = runParted(g, disk);
      if (rc) return rc;
    }
    return 0;
    function runParted(cmds, disk) {
      switch (cmds[0]) {
        case 'mklabel':
          if (!['gpt', 'msdos'].includes(cmds[1])) {
            c.err(`Error: Expected gpt or msdos, not "${cmds[1]}"\n`);
            return 1;
          }
          for (const old of sortedDevs(sh).filter((d) => d.parent === disk.path)) {
            delete sh.devs[old.path];
            delete sh.fs.lookup('/dev').kids[old.name];
          }
          disk.table = cmds[1] === 'gpt' ? 'gpt' : 'dos';
          return 0;
        case 'mkpart': {
          if (!disk.table) {
            c.err(`Error: ${disk.path}: unrecognised disk label\n`);
            return 1;
          }
          const rest2 = cmds.slice(1);
          const fsHint = /^(ext2|ext3|ext4|xfs|fat32|fat16|linux-swap|btrfs|ntfs)$/.test(rest2[1] || '') ? rest2[1] : null;
          const s = pos(rest2[fsHint ? 2 : 1], disk.size);
          const e = pos(rest2[fsHint ? 3 : 2], disk.size);
          if (s === null || e === null || e <= s) {
            c.err('Error: The location ' + (rest2[fsHint ? 3 : 2] || '') + ' is outside of the device ' + disk.path + '.\n');
            return 1;
          }
          const used = sortedDevs(sh).filter((d) => d.parent === disk.path).map((d) => d.partNum);
          let n = 1;
          while (used.includes(n)) n++;
          const isName = disk.table === 'gpt' && !['primary', 'logical', 'extended'].includes(rest2[0]);
          const nd = { path: `${disk.path}${n}`, name: `${disk.name}${n}`, type: 'part', size: e - s, parent: disk.path, fs: null, uuid: null, label: null, ptName: isName ? rest2[0] : '', data: null, major: 8, minor: disk.minor + n, partNum: n, ptype: 'Linux filesystem', start: Math.ceil(s / 512) };
          sh.devs[nd.path] = nd;
          devNode(sh, nd);
          return 0;
        }
        case 'rm': {
          const d = sh.devs[`${disk.path}${cmds[1]}`];
          if (!d) {
            c.err(`Error: Partition doesn't exist.\n`);
            return 1;
          }
          delete sh.devs[d.path];
          delete sh.fs.lookup('/dev').kids[d.name];
          return 0;
        }
        case 'set': {
          const d = sh.devs[`${disk.path}${cmds[1]}`];
          if (d && cmds[2] === 'lvm') d.ptype = 'Linux LVM';
          if (d && cmds[2] === 'raid') d.ptype = 'Linux RAID';
          if (d && cmds[2] === 'boot') d.ptype = 'EFI System';
          return 0;
        }
        case 'print':
          partedPrint(c, disk, sh);
          return 0;
        case 'name':
        case 'unit':
        case 'quit':
        case 'align-check':
          return 0;
      }
      c.err(`Error: unknown command: ${cmds[0]}\n`);
      return 1;
    }
  });
  const pUnit = (b) => (b >= 1e10 ? (b / 1e9).toFixed(1) + "GB" : b >= 1e7 ? Math.round(b / 1e6) + "MB" : Math.round(b / 1e3) + "kB");
  function partedPrint(c, d, sh) {
    c.out(`Model: ${d.model} (scsi)\nDisk ${d.path}: ${pUnit(d.size)}\nSector size (logical/physical): 512B/512B\nPartition Table: ${d.table || 'unknown'}\nDisk Flags: \n\n`);
    const parts = sortedDevs(sh).filter((x) => x.parent === d.path);
    if (parts.length) {
      const gpt = d.table === 'gpt';
      c.out(gpt ? 'Number  Start   End     Size    File system  Name  Flags\n' : 'Number  Start   End     Size    Type     File system  Flags\n');
      parts.forEach((p) => {
        const st = pUnit(p.start * 512);
        const en = pUnit(p.start * 512 + p.size - 1);
        const sz = pUnit(p.size);
        const flags = p.ptype === 'Linux LVM' ? 'lvm' : p.ptype === 'Linux RAID' ? 'raid' : p.ptype === 'EFI System' ? 'boot, esp' : '';
        c.out(gpt ? ` ${String(p.partNum).padEnd(7)}${st.padEnd(8)}${en.padEnd(8)}${sz.padEnd(8)}${(p.fs || '').padEnd(13)}${(p.ptName || '').padEnd(6)}${flags}\n` : ` ${String(p.partNum).padEnd(7)}${st.padEnd(8)}${en.padEnd(8)}${sz.padEnd(8)}${'primary'.padEnd(9)}${(p.fs || '').padEnd(13)}${flags}\n`);
      });
      c.out('\n');
    }
  }
  def('partprobe', async () => 0);
  def('wipefs', async (c, args) => {
    if (needRoot(c, 'wipefs: cannot open: Permission denied\n')) return 1;
    for (const a of args.filter((x) => !x.startsWith('-'))) {
      const d = c.sh.getDev(a);
      if (!d) continue;
      if (c.sh.mountOf(d.path)) {
        c.err(`wipefs: error: ${a}: probing initialization failed: Device or resource busy\n`);
        return 1;
      }
      if (args.includes('-a')) {
        if (d.fs) c.out(`${a}: 4 bytes were erased at offset 0x00000438 (${d.fs}): 53 ef\n`);
        d.fs = null;
        d.uuid = null;
        d.label = null;
        d.data = null;
      }
    }
  });

  /* ---------- mkfs & friends ---------- */
  const mkfs = (kind) => async (c, args) => {
    const sh = c.sh;
    let fstype = kind;
    const { o, rest } = parseOpts(args, ['-L', '-n', '-t', '-F', '-b', '-m', '-i', '-I']);
    if (kind === 'mkfs') fstype = o.t || 'ext2';
    if (kind === 'vfat') fstype = 'vfat';
    const name = kind === 'mkfs' ? `mkfs.${fstype}` : { ext4: 'mkfs.ext4', ext3: 'mkfs.ext3', xfs: 'mkfs.xfs', vfat: 'mkfs.fat' }[kind] || kind;
    const devp = rest[rest.length - 1];
    if (!devp) {
      c.err(`Usage: ${name} [options] device\n`);
      return 1;
    }
    const dev = sh.getDev(devp);
    if (needRoot(c, kind === 'xfs' ? `mkfs.xfs: cannot open ${devp}: Permission denied\n` : `${name}: Permission denied while trying to determine filesystem size\n`)) return 1;
    if (!dev) {
      c.err(kind === 'xfs' ? `mkfs.xfs: cannot open ${devp}: No such file or directory\n` : `The file ${devp} does not exist and no size was specified.\n`);
      return 1;
    }
    if (sh.mountOf(dev.path)) {
      c.err(`${devp} is mounted; will not make a filesystem here!\n`);
      return 1;
    }
    if (dev.type === 'disk' && sh.fs && Object.values(sh.devs).some((d) => d.parent === dev.path) && !o.F) {
      c.err(`${devp} contains a partition table; use the partitions (or -F to force)\n`);
      return 1;
    }
    if (kind === 'xfs' && dev.fs && !o.f) {
      c.err(`mkfs.xfs: ${devp} appears to contain an existing filesystem (${dev.fs}).\nmkfs.xfs: Use the -f option to force overwrite.\n`);
      return 1;
    }
    if (dev.fs === 'LVM2_member' || dev.pv) {
      c.err(`${devp} is apparently in use by the system; will not make a filesystem here!\n`);
      return 1;
    }
    dev.fs = fstype === 'vfat' ? 'vfat' : fstype;
    dev.uuid = fstype === 'vfat' ? Math.random().toString(16).slice(2, 6).toUpperCase() + '-' + Math.random().toString(16).slice(2, 6).toUpperCase() : uuid();
    dev.label = o.L || o.n || null;
    dev.data = null;
    dev.fsSize = dev.size;
    if (dev.file) {
      const n = sh.fs.lookup(dev.path);
      n.hasFs = fstype;
    }
    const blocks = Math.floor(dev.size / 4096);
    if (fstype === 'xfs') c.out(`meta-data=${devp}${' '.repeat(Math.max(1, 17 - devp.length))}isize=512    agcount=4, agsize=${Math.floor(blocks / 4)} blks\n         =                       sectsz=512   attr=2, projid32bit=1\n         =                       crc=1        finobt=1, sparse=1, rmapbt=0\n         =                       reflink=1    bigtime=1 inobtcount=1 nrext64=0\ndata     =                       bsize=4096   blocks=${blocks}, imaxpct=25\n         =                       sunit=0      swidth=0 blks\nnaming   =version 2              bsize=4096   ascii-ci=0, ftype=1\nlog      =internal log           bsize=4096   blocks=${Math.max(2560, Math.floor(blocks / 512))}, version=2\n         =                       sectsz=512   sunit=0 blks, lazy-count=1\nrealtime =none                   extsz=4096   blocks=0, rtextents=0\n`);
    else if (fstype === 'vfat') c.out('mkfs.fat 4.2 (2021-01-31)\n');
    else c.out(`mke2fs 1.47.0 (5-Feb-2023)\nCreating filesystem with ${blocks} 4k blocks and ${Math.floor(blocks / 4)} inodes\nFilesystem UUID: ${dev.uuid}\nSuperblock backups stored on blocks: \n\t32768, 98304, 163840, 229376, 294912\n\nAllocating group tables: done                            \nWriting inode tables: done                            \nCreating journal (${Math.min(16384, Math.floor(blocks / 64))} blocks): done\nWriting superblocks and filesystem accounting information: done   \n\n`);
    return 0;
  };
  for (const k of ['ext4', 'ext3', 'xfs', 'vfat']) def(`mkfs.${k}`, mkfs(k));
  def('mkfs.fat', mkfs('vfat'));
  def('mkfs.vfat', mkfs('vfat'));
  def('mkfs', mkfs('mkfs'));
  def('mke2fs', mkfs('mkfs'));
  def('mkswap', async (c, args) => {
    const sh = c.sh;
    const { o, rest } = parseOpts(args, ['-L']);
    if (needRoot(c, `mkswap: cannot open ${rest[0]}: Permission denied\n`)) return 1;
    const n = sh.fs.lookup(c.abs(rest[0]));
    const dev = sh.getDev(rest[0]) || (n && n.t === 'f' ? sh.getDev(c.abs(rest[0])) : null);
    if (!dev) {
      c.err(`mkswap: cannot open ${rest[0]}: No such file or directory\n`);
      return 1;
    }
    if (sh.mountOf(dev.path)) {
      c.err(`mkswap: ${rest[0]}: warning: ${dev.path} is mounted\n`);
      return 1;
    }
    dev.fs = 'swap';
    dev.uuid = uuid();
    dev.label = o.L || null;
    if (n) n.swap = true;
    if (n && (n.mode & 0o077)) c.err(`mkswap: ${rest[0]}: insecure permissions 0${(n.mode & 0o777).toString(8)}, 0600 suggested.\n`);
    c.out(`Setting up swapspace version 1, size = ${hsFull(dev.size || 0)} (${dev.size} bytes)\n${dev.label ? 'LABEL=' + dev.label + ', ' : 'no label, '}UUID=${dev.uuid}\n`);
    return 0;
  });
  P.swapOn = function (c, ref) {
    const sh = this;
    const p = ref.startsWith('/dev/') || /^(UUID|LABEL)=/.test(ref) ? ref : sh.abs(ref);
    const dev = byRef(sh, p);
    if (!dev || dev.fs !== 'swap') {
      c.err(`swapon: ${ref}: read swap header failed\n`);
      return 1;
    }
    if (sh.swaps.find((s) => s.file === dev.path)) {
      c.err(`swapon: ${ref}: swapon failed: Device or resource busy\n`);
      return 1;
    }
    sh.swaps.push({ file: dev.path, type: dev.file ? 'file' : 'partition', size: dev.size, prio: -2 - sh.swaps.length });
    dev.swapOn = true;
    return 0;
  };
  def('swapon', async (c, args) => {
    const sh = c.sh;
    if (args.includes('--show') || args.includes('-s') || !args.filter((a) => !a.startsWith('-')).length && !args.includes('-a')) {
      if (args.includes('-s')) return c.out(sh.swapTable().replace(/\t+/g, ' '));
      if (!sh.swaps.length) return 0;
      c.out('NAME      TYPE SIZE USED PRIO\n');
      sh.swaps.forEach((s) => c.out(`${s.file.padEnd(9)} ${s.type.padEnd(4)} ${hs(s.size).padStart(4)}   0B ${String(s.prio).padStart(3)}\n`));
      return 0;
    }
    if (needRoot(c, 'swapon: ' + args[args.length - 1] + ': swapon failed: Operation not permitted\n')) return 255;
    if (args.includes('-a')) {
      for (const l of fstabEntries(sh)) if (l.fs === 'swap') sh.swapOn(c, l.src);
      return 0;
    }
    let st = 0;
    for (const a of args.filter((x) => !x.startsWith('-'))) {
      const n = sh.fs.lookup(c.abs(a));
      if (n && n.t === 'f' && n.swap && (n.mode & 0o077)) c.err(`swapon: ${a}: insecure permissions 0${(n.mode & 0o777).toString(8)}, 0600 suggested.\n`);
      st = sh.swapOn(c, a) || st;
    }
    return st;
  });
  def('swapoff', async (c, args) => {
    if (needRoot(c, 'swapoff: ' + args[0] + ': swapoff failed: Operation not permitted\n')) return 255;
    const sh = c.sh;
    if (args.includes('-a')) {
      sh.swaps.forEach((s) => sh.devs[s.file] && (sh.devs[s.file].swapOn = false));
      sh.swaps = [];
      return 0;
    }
    const p = args[0].startsWith('/dev/') ? args[0] : c.abs(args[0]);
    const i = sh.swaps.findIndex((s) => s.file === p);
    if (i < 0) {
      c.err(`swapoff: ${args[0]}: swapoff failed: Invalid argument\n`);
      return 255;
    }
    sh.swaps.splice(i, 1);
    if (sh.devs[p]) sh.devs[p].swapOn = false;
    return 0;
  });

  /* ---------- mount / umount ---------- */
  function fstabEntries(sh) {
    const n = sh.fs.lookup('/etc/fstab');
    const out = [];
    for (const l of (n ? n.content : '').split('\n')) {
      const t = l.trim();
      if (!t || t.startsWith('#')) continue;
      const f = t.split(/\s+/);
      if (f.length < 4) continue;
      out.push({ src: f[0], target: f[1], fs: f[2], opts: f[3], dump: f[4], pass: f[5] });
    }
    return out;
  }
  LX.fstabEntries = fstabEntries;
  LX.blockByRef = (sh, ref) => byRef(sh, ref);
  const NFS = { 'demo-server:/export/share': { size: 20 * GiB, files: { 'readme.txt': 'Shared by demo-server over NFS.\n', 'projects': null } } };
  async function doMount(c, srcRef, target, fsType, opts, quiet) {
    const sh = c.sh;
    const loop = /(^|,)loop(,|$)/.test(opts || '');
    const tn = sh.fs.lookup(target);
    if (!tn || tn.t !== 'd') {
      c.err(`mount: ${target}: mount point does not exist.\n`);
      return 32;
    }
    if (/^[\w.-]+:\//.test(srcRef)) {
      if (!sh.installed.has('nfs-common')) {
        c.err(`mount: ${target}: bad option; for several filesystems (e.g. nfs, cifs) you might need a /sbin/mount.<type> helper program.\n`);
        return 32;
      }
      const ex = NFS[srcRef];
      if (!ex) {
        c.err(`mount.nfs: access denied by server while mounting ${srcRef}\n`);
        return 32;
      }
      sh.nfsDevs = sh.nfsDevs || {};
      let dev = sh.nfsDevs[srcRef];
      if (!dev) {
        dev = sh.nfsDevs[srcRef] = { path: srcRef, name: srcRef, type: 'nfs', size: ex.size, fs: 'nfs4', data: {} };
        for (const [k, v] of Object.entries(ex.files)) dev.data[k] = v === null ? sh.fs.mk('d', { owner: 'nobody', group: 'nogroup', mode: 0o755 }) : sh.fs.mk('f', { owner: 'nobody', group: 'nogroup', content: v });
      }
      mountDev(sh, dev, target, 'nfs4', opts || 'rw,relatime,vers=4.2');
      return 0;
    }
    const dev = byRef(sh, srcRef.startsWith('/dev/') || /^(UUID|LABEL)=/.test(srcRef) ? srcRef : srcRef.startsWith('/') ? srcRef : c.abs(srcRef));
    if (!dev) {
      c.err(/^(UUID|LABEL)=/.test(srcRef) ? `mount: ${target}: can't find ${srcRef}.\n` : `mount: ${target}: special device ${srcRef} does not exist.\n`);
      return 32;
    }
    if (dev.fsBroken) {
      c.err(`mount: ${target}: wrong fs type, bad option, bad superblock on ${dev.path}, missing codepage or helper program, or other error.\n       dmesg(1) may have more information after failed mount system call.\n`);
      return 32;
    }
    if (!dev.fs || dev.fs === 'swap' || dev.fs === 'LVM2_member' || dev.fs === 'linux_raid_member') {
      c.err(`mount: ${target}: wrong fs type, bad option, bad superblock on ${dev.path}, missing codepage or helper program, or other error.\n`);
      return 32;
    }
    if (fsType && fsType !== 'auto' && fsType !== dev.fs && !(fsType === 'ext4' && dev.fs === 'ext4')) {
      c.err(`mount: ${target}: wrong fs type, bad option, bad superblock on ${dev.path}, missing codepage or helper program, or other error.\n`);
      return 32;
    }
    if (sh.mountOf(dev.path) && !loop) {
      c.err(`mount: ${target}: ${dev.path} already mounted or mount point busy.\n`);
      return 32;
    }
    if (sh.mounts.find((m) => m.target === target)) {
      c.err(`mount: ${target}: mount point is busy.\n`);
      return 32;
    }
    mountDev(sh, dev, target, dev.fs, (opts || 'rw,relatime').replace(/(^|,)(defaults|loop)(?=,|$)/g, '$1').replace(/^,|,$/g, '') || 'rw,relatime');
    return 0;
  }
  def('mount', async (c, args) => {
    const sh = c.sh;
    const { o, rest } = parseOpts(args, ['-t', '-o']);
    if (!rest.length && !o.a) {
      for (const m of sh.mountsTable()) {
        if (o.t && m.fs !== o.t) continue;
        c.out(`${m.dev} on ${m.target} type ${m.fs} (${m.opts})\n`);
      }
      return 0;
    }
    if (sh.eu() !== 'root') {
      c.err(`mount: ${rest[1] || rest[0] || '/'}: must be superuser to use mount.\n       dmesg(1) may have more information after failed mount system call.\n`);
      return 1;
    }
    if (o.a) {
      let st = 0;
      const stale = (sh.fs.lookup('/etc/fstab') || {}).mtime > sh.lastDaemonReload;
      for (const e of fstabEntries(sh)) {
        if (e.fs === 'swap' || e.target === 'none' || /noauto/.test(e.opts)) continue;
        if (sh.mounts.find((m) => m.target === e.target)) continue;
        const r = await doMount(c, e.src, e.target, e.fs, e.opts, true);
        if (r) st = r;
      }
      if (stale) c.err("mount: (hint) your fstab has been modified, but systemd still uses\n       the old version; use 'systemctl daemon-reload' to reload.\n");
      return st;
    }
    if (o.o && /remount/.test(o.o) && rest.length === 1) {
      const m = sh.mounts.find((x) => x.target === c.abs(rest[0]) || x.dev === rest[0]);
      if (!m) {
        c.err(`mount: ${rest[0]}: not mounted.\n`);
        return 32;
      }
      m.opts = m.opts.replace(/\b(rw|ro)\b/, /\bro\b/.test(o.o) ? 'ro' : 'rw');
      return 0;
    }
    if (rest.length === 1) {
      const e = fstabEntries(sh).find((x) => x.target === c.abs(rest[0]) || x.src === rest[0]);
      if (!e) {
        c.err(`mount: ${rest[0]}: can't find in /etc/fstab.\n`);
        return 1;
      }
      return await doMount(c, e.src, e.target, e.fs, e.opts);
    }
    return await doMount(c, rest[0], c.abs(rest[1]), o.t, o.o);
  });
  def('umount', async (c, args) => {
    const sh = c.sh;
    const { o, rest } = parseOpts(args, []);
    if (sh.eu() !== 'root') {
      c.err(`umount: ${rest[0]}: must be superuser to unmount.\n`);
      return 1;
    }
    let st = 0;
    for (const r of rest) {
      const abs = c.abs(r);
      const m = sh.mounts.find((x) => x.target === abs || x.dev === r || x.dev === abs);
      if (!m) {
        c.err(`umount: ${r}: ${sh.fs.lookup(abs) ? 'not mounted.' : 'no mount point specified.'}\n`);
        st = 32;
        continue;
      }
      if (m.target === '/' || m.target === '/boot/efi') {
        c.err(`umount: ${m.target}: target is busy.\n`);
        st = 32;
        continue;
      }
      if ((sh.cwd === m.target || sh.cwd.startsWith(m.target + '/')) && !o.l) {
        c.err(`umount: ${m.target}: target is busy.\n        (In some cases useful info about processes that\n         use the device is found by lsof(8) or fuser(1).)\n`);
        st = 32;
        continue;
      }
      umountTarget(sh, m);
    }
    return st;
  });
  def('findmnt', async (c, args) => {
    const sh = c.sh;
    const { o, rest } = parseOpts(args, ['-t', '-o', '-T', '--target', '-S', '--source']);
    const noHead = !!o.n || !!o.noheadings;
    const cols = String(o.o || 'TARGET,SOURCE,FSTYPE,OPTIONS').split(',').map((x) => x.toUpperCase());
    const field = (m, col) => ({ TARGET: m.target, SOURCE: m.dev, FSTYPE: m.fs, OPTIONS: m.opts, LABEL: (sh.getDev(m.dev) || {}).label || '', UUID: (sh.getDev(m.dev) || {}).uuid || '', SIZE: '', USED: '', 'USE%': '', AVAIL: '' }[col] || '');
    const all = sh.mountsTable().filter((m) => !['sysfs', 'proc', 'udev', 'tmpfs'].includes(m.fs) || args.length === 0);
    const want = o.T || o.target || rest[0];
    let list;
    if (want) {
      const abs = c.abs(want);
      if (o.T || o.target) {
        const hits = sh.mountsTable().filter((x) => x.target === '/' || abs === x.target || abs.startsWith(x.target + '/')).sort((a, b) => b.target.length - a.target.length);
        list = hits.slice(0, 1);
      } else list = sh.mountsTable().filter((x) => x.target === abs || x.dev === want);
      if (o.S || o.source) list = sh.mountsTable().filter((x) => x.dev === (o.S || o.source));
      if (!list.length) return 1;
    } else list = all.filter((m) => !o.t || m.fs === o.t);
    const rows = list.map((m) => cols.map((cc) => field(m, cc)));
    const w = cols.map((cc, i) => Math.max(cc.length, ...rows.map((r) => r[i].length)));
    if (!noHead) c.out(cols.map((cc, i) => (i === cols.length - 1 ? cc : cc.padEnd(w[i]))).join(' ') + '\n');
    rows.forEach((r) => c.out(r.map((x, i) => (i === cols.length - 1 ? x : x.padEnd(w[i]))).join(' ') + '\n'));
    return 0;
  });
  def('blkid', async (c, args) => {
    if (c.sh.eu() !== 'root') return 2;
    const tagI = args.indexOf('-s');
    const tag = tagI >= 0 ? args[tagI + 1] : null;
    const outI = args.indexOf('-o');
    const outFmt = outI >= 0 ? args[outI + 1] : 'full';
    const want = args.filter((a, i) => !a.startsWith('-') && i !== tagI + 1 && i !== outI + 1);
    for (const d of sortedDevs(c.sh)) {
      if (!d.fs || d.type === 'loop' && !want.length) continue;
      if (want.length && !want.includes(d.path)) continue;
      if (tag) {
        const v = { UUID: d.uuid, LABEL: d.label, TYPE: d.fs }[tag.toUpperCase()];
        if (v) c.out(outFmt === 'value' ? v + '\n' : `${d.path}: ${tag.toUpperCase()}="${v}"\n`);
        continue;
      }
      c.out(`${d.path}: ${d.label ? `LABEL="${d.label}" ` : ''}UUID="${d.uuid}" ${d.fs === 'ext4' ? 'BLOCK_SIZE="4096" ' : ''}TYPE="${d.fs === 'vfat' ? 'vfat' : d.fs}"${d.type === 'part' ? ` PARTUUID="${uuid().slice(0, 13)}-0${d.partNum}"` : ''}\n`);
    }
  });
  def('findfs', async (c, args) => {
    const d = byRef(c.sh, args[0]);
    if (!d) {
      c.err(`findfs: unable to resolve '${args[0]}'\n`);
      return 1;
    }
    c.out(d.path + '\n');
  });
  const fsck = async (c, args) => {
    const sh = c.sh;
    const dev = args.filter((a) => !a.startsWith('-')).pop();
    if (needRoot(c, 'fsck: Permission denied\n')) return 8;
    const d = sh.getDev(dev);
    if (!d) {
      c.err(`fsck.ext4: No such file or directory while trying to open ${dev}\nPossibly non-existent device?\n`);
      return 8;
    }
    if (sh.mountOf(d.path)) {
      c.err(`e2fsck 1.47.0 (5-Feb-2023)\n${dev} is mounted.\ne2fsck: Cannot continue, aborting.\n\n`);
      return 8;
    }
    if (d.fs === 'xfs') c.out('Phase 1 - find and verify superblock...\nPhase 2 - using internal log\n        - zero log...\nPhase 3 - for each AG...\nPhase 7 - verify and correct link counts...\nPhase 8 - verify and correct link counts...\ndone\n');
    else c.out(`fsck from util-linux 2.39.3\ne2fsck 1.47.0 (5-Feb-2023)\nPass 1: Checking inodes, blocks, and sizes\nPass 2: Checking directory structure\nPass 3: Checking directory connectivity\nPass 4: Checking reference counts\nPass 5: Checking group summary information\n${dev}: 11/${Math.floor(d.size / 16384)} files (0.0% non-contiguous), 26624/${Math.floor(d.size / 4096)} blocks\n`);
    return 0;
  };
  for (const n of ['fsck', 'e2fsck', 'fsck.ext4', 'xfs_repair']) def(n, fsck);
  def('tune2fs', async (c, args) => {
    const dev = args[args.length - 1];
    const d = c.sh.getDev(dev);
    if (!d || !d.fs) {
      c.err(`tune2fs: Bad magic number in super-block while trying to open ${dev}\n`);
      return 1;
    }
    if (args.includes('-l')) c.out(`tune2fs 1.47.0 (5-Feb-2023)\nFilesystem volume name:   ${d.label || '<none>'}\nLast mounted on:          ${(c.sh.mountOf(d.path) || {}).target || '<not available>'}\nFilesystem UUID:          ${d.uuid}\nFilesystem features:      has_journal ext_attr resize_inode dir_index filetype extent 64bit flex_bg\nFilesystem state:         clean\nBlock count:              ${Math.floor((d.fsSize || d.size) / 4096)}\nBlock size:               4096\n`);
    return 0;
  });
  def('e2label', async (c, args) => {
    const d = c.sh.getDev(args[0]);
    if (!d) return 1;
    if (args[1]) {
      if (c.sh.eu() !== 'root') {
        c.err('e2label: Permission denied while trying to open ' + args[0] + '\n');
        return 1;
      }
      d.label = args[1];
    } else c.out((d.label || '') + '\n');
  });
  def('resize2fs', async (c, args) => {
    const sh = c.sh;
    const dev = args.find((a) => a.startsWith('/dev/'));
    if (needRoot(c, 'resize2fs: Permission denied while trying to open ' + dev + '\nCouldn\'t find valid filesystem superblock.\n')) return 1;
    const d = sh.getDev(dev);
    if (!d || !d.fs) {
      c.err(`resize2fs: Bad magic number in super-block while trying to open ${dev}\nCouldn't find valid filesystem superblock.\n`);
      return 1;
    }
    if (d.fs !== 'ext4' && d.fs !== 'ext3') {
      c.err(`resize2fs: Bad magic number in super-block while trying to open ${dev}\n`);
      return 1;
    }
    const m = sh.mountOf(d.path);
    if (d.fsSize >= d.size) {
      c.err(`resize2fs 1.47.0 (5-Feb-2023)\nThe filesystem is already ${Math.floor(d.size / 4096)} (4k) blocks long.  Nothing to do!\n\n`);
      return 0;
    }
    c.out(`resize2fs 1.47.0 (5-Feb-2023)\n${m ? `Filesystem at ${dev} is mounted on ${m.target}; on-line resizing required\nold_desc_blocks = 1, new_desc_blocks = 1\n` : `Resizing the filesystem on ${dev} to ${Math.floor(d.size / 4096)} (4k) blocks.\n`}The filesystem on ${dev} is now ${Math.floor(d.size / 4096)} (4k) blocks long.\n\n`);
    d.fsSize = d.size;
    return 0;
  });
  def('xfs_growfs', async (c, args) => {
    const sh = c.sh;
    if (needRoot(c, 'xfs_growfs: cannot open ' + args[args.length - 1] + ': Permission denied\n')) return 1;
    const target = c.abs(args[args.length - 1]);
    const m = sh.mounts.find((x) => x.target === target);
    if (!m) {
      c.err(`xfs_growfs: ${args[args.length - 1]}: not a mount point\n`);
      return 1;
    }
    const d = sh.getDev(m.dev);
    if (d.fs !== 'xfs') {
      c.err(`xfs_growfs: ${args[args.length - 1]} is not a valid XFS filesystem\n`);
      return 1;
    }
    c.out(`meta-data=${m.dev}      isize=512    agcount=4, agsize=${Math.floor((d.fsSize || d.size) / 16384)} blks\ndata     =                       bsize=4096   blocks=${Math.floor((d.fsSize || d.size) / 4096)}, imaxpct=25\ndata blocks changed from ${Math.floor((d.fsSize || d.size) / 4096)} to ${Math.floor(d.size / 4096)}\n`);
    d.fsSize = d.size;
    return 0;
  });
  def('xfs_info', async (c, args) => c.out('meta-data=/dev/sdb1 isize=512 agcount=4\n'));

  /* ---------- df (dynamic) ---------- */
  const usedBytes = (node) => {
    let t = 0;
    const rec = (n) => {
      if (n.t === 'd') {
        t += 4096;
        Object.values(n.kids).forEach(rec);
      } else if (n.t === 'f') t += VFS.size(n);
    };
    if (node) Object.values(node).forEach(rec);
    return t;
  };
  P.dfRows = function () {
    const rows = [];
    rows.push({ fs: 'tmpfs', type: 'tmpfs', size: 404680 * 1024, used: 1540 * 1024, target: '/run' });
    for (const m of this.mounts) {
      const d = this.getDev(m.dev) || (this.nfsDevs && this.nfsDevs[m.dev]);
      if (!d) continue;
      const total = d.fs === 'ext4' ? Math.round((d.fsSize || d.size) * 0.977) : d.fs === 'xfs' ? Math.round((d.fsSize || d.size) - 0.02 * GiB) : d.fsSize || d.size;
      const base = m.target === '/' ? d.used || 0 : d.fs === 'xfs' ? Math.round(0.014 * (d.fsSize || d.size)) : d.fs === 'ext4' ? 24 * 1024 : 0;
      const used = base + usedBytes(d.data === null ? null : this.fs.lookup(m.target).kids) - (m.target === '/' ? 0 : 0);
      rows.push({ fs: m.dev === '/dev/sda1' ? '/dev/sda1' : m.dev, type: m.fs, size: total, used: m.target === '/' ? (d.used || 0) : used, target: m.target });
    }
    rows.push({ fs: 'tmpfs', type: 'tmpfs', size: 2 * GiB, used: 0, target: '/dev/shm' });
    return rows;
  };
  def('df', async (c, args) => {
    const sh = c.sh;
    args = args.map((a) => ({ '--inodes': '-i', '--human-readable': '-h', '--local': '-l' }[a] || a));
    const { o, rest } = parseOpts(args, ['-t', '-x']);
    let rows = sh.dfRows();
    if (rest.length) rows = rows.filter((r) => rest.some((p) => { const a = c.abs(p); return r.target === '/' ? true : a === r.target || a.startsWith(r.target + '/'); })).sort((a, b) => b.target.length - a.target.length).slice(0, 1);
    if (o.t) rows = rows.filter((r) => r.type === o.t);
    if (o.x) rows = rows.filter((r) => r.type !== o.x);
    const human = o.h || o.H;
    const kb = (b) => String(Math.ceil(b / 1024));
    const f = (b) => (human ? hsDf(b) : kb(b));
    const head = o.i ? ['Filesystem', ...(o.T ? ['Type'] : []), 'Inodes', 'IUsed', 'IFree', 'IUse%', 'Mounted on'] : ['Filesystem', ...(o.T ? ['Type'] : []), human ? 'Size' : '1K-blocks', 'Used', human ? 'Avail' : 'Available', 'Use%', 'Mounted on'];
    const body = rows.map((r) => {
      if (o.i) {
        const tot = Math.floor(r.size / 16384);
        const used = r.target === '/' ? 285400 : 11 + Math.floor(r.used / 16384);
        return [r.fs, ...(o.T ? [r.type] : []), String(tot), String(used), String(tot - used), Math.ceil((used / tot) * 100) + '%', r.target];
      }
      const avail = Math.max(0, r.size - r.used);
      return [r.fs, ...(o.T ? [r.type] : []), f(r.size), f(r.used), f(avail), (r.size ? Math.ceil((r.used / r.size) * 100) : 0) + '%', r.target];
    });
    const all = [head, ...body];
    const w = head.map((_, i) => Math.max(...all.map((r) => r[i].length)));
    for (const r of all) c.out(r.map((x, i) => (i === 0 || i === (o.T ? 1 : -1) ? x.padEnd(w[i]) : i === r.length - 1 ? x : x.padStart(w[i]))).join(' ') + '\n');
  });
  function hsDf(b) {
    if (b === 0) return '0';
    if (b >= GiB) return (b / GiB >= 10 ? Math.ceil(b / GiB) : (Math.ceil((b / GiB) * 10) / 10).toFixed(1)) + 'G';
    if (b >= MiB) return (b / MiB >= 10 ? Math.ceil(b / MiB) : (Math.ceil((b / MiB) * 10) / 10).toFixed(1)) + 'M';
    return Math.ceil(b / 1024) + 'K';
  }
  def('free', async (c, args) => {
    const sh = c.sh;
    const si = LX.sysinfo(sh);
    const swapT = sh.swapTotal();
    const rowv = { total: si.memTotal, used: si.memUsed, free: Math.max(100000, si.memTotal - si.memUsed - 1261424), shared: 18432, cache: 1261424, avail: Math.max(200000, si.memTotal - si.memUsed) };
    const f = args.join(' ');
    const fmt = (v) => (/-h|--human/.test(f) ? (v >= 1048576 ? (v / 1048576).toFixed(1) + 'Gi' : v >= 1024 ? Math.round(v / 1024) + 'Mi' : v ? v + 'Ki' : '0B') : /-m/.test(f) ? String(Math.round(v / 1024)) : /-g/.test(f) ? String(Math.round(v / 1048576)) : String(v));
    const row = (n, a) => n.padEnd(8) + a.map((x) => fmt(x).padStart(12)).join('') + '\n';
    c.out('               total        used        free      shared  buff/cache   available\n');
    c.out(row('Mem:', [rowv.total, rowv.used, rowv.free, rowv.shared, rowv.cache, rowv.avail]));
    c.out(row('Swap:', [swapT, 0, swapT]));
  });

  /* ---------- LVM ---------- */
  const hsLvm = (b) => `${(b / GiB).toFixed(2)}g`;
  const PE = 4 * MiB;
  const vgOf = (sh, n) => sh.vgs[n];
  const vgSize = (vg) => vg.pvs.reduce((s, p) => s + p.size - PE, 0);
  const lvsTotal = (vg) => Object.values(vg.lvs).reduce((s, l) => s + l.size, 0);
  const lvNodes = (sh, vg, lv, add) => {
    const dir = sh.fs.mkdirp('/dev/' + vg.name, { owner: 'root', group: 'disk' });
    const map = sh.fs.mkdirp('/dev/mapper', { owner: 'root', group: 'root' });
    const dm = 'dm-' + (lv.dm = lv.dm !== undefined ? lv.dm : lv.minor || 0);
    const short = lv.lvName || lv.name;
    if (add) {
      sh.fs.mkdirp('/dev', {}).kids[dm] = sh.fs.mk('c', { owner: 'root', group: 'disk', mode: 0o660, blk: true, size: 0 });
      dir.kids[short] = sh.fs.mk('l', { target: '../' + dm, owner: 'root', group: 'root', mode: 0o777 });
      map.kids[`${vg.name}-${short}`] = sh.fs.mk('l', { target: '../' + dm, owner: 'root', group: 'root', mode: 0o777 });
    } else {
      delete dir.kids[short];
      delete map.kids[`${vg.name}-${short}`];
    }
  };
  const lvmRoot = (c, cmd) => needRoot(c, `  WARNING: Running as a non-root user. Functionality may be unavailable.\n  /run/lock/lvm/P_global:aux: open failed: Permission denied\n`);
  def('pvcreate', async (c, args) => {
    const sh = c.sh;
    if (lvmRoot(c)) return 5;
    const { o, rest } = parseOpts(args, []);
    let st = 0;
    for (const p of rest) {
      const d = sh.getDev(p);
      if (!d) {
        c.err(`  Cannot use ${p}: No such device\n  Device ${p} excluded by a filter.\n`);
        st = 5;
        continue;
      }
      if (sh.devs && Object.values(sh.devs).some((x) => x.parent === d.path)) {
        c.err(`  Cannot use ${p}: device is partitioned\n`);
        st = 5;
        continue;
      }
      if (sh.mountOf(d.path)) {
        c.err(`  Cannot use ${p}: device is mounted\n`);
        st = 5;
        continue;
      }
      if (d.pv && d.pv.vg) {
        c.err(`  Can't initialize physical volume "${p}" of volume group "${d.pv.vg}" without -ff\n`);
        st = 5;
        continue;
      }
      if (d.fs && d.fs !== 'LVM2_member' && !o.y && !o.f) {
        const a = await stdinLine(c, `WARNING: ${d.fs} signature detected on ${p} at offset 1080. Wipe it? [y/n]: `);
        if (!/^y/i.test(a || '')) {
          c.out(`  Aborted wiping of ${d.fs}.\n  1 existing signature left on the device.\n`);
          st = 5;
          continue;
        }
        c.out(`  Wiping ${d.fs} signature on ${p}.\n`);
      }
      d.fs = 'LVM2_member';
      d.pv = { vg: null };
      d.uuid = uuid().slice(0, 6) + '-' + uuid().slice(0, 4);
      d.label = null;
      c.out(`  Physical volume "${p}" successfully created.\n`);
    }
    return st;
  });
  def('pvs', async (c) => {
    const sh = c.sh;
    const pvs = sortedDevs(sh).filter((d) => d.pv);
    if (!pvs.length) return 0;
    c.out('  PV         VG  Fmt  Attr PSize  PFree \n');
    for (const d of pvs) {
      const vg = d.pv.vg && sh.vgs[d.pv.vg];
      const free = vg ? Math.max(0, d.size - PE - (vg.pvs.length ? 0 : 0) - pvUsed(vg, d)) : d.size;
      c.out(`  ${d.path.padEnd(10)} ${(d.pv.vg || '').padEnd(3)} lvm2 ${vg ? 'a--' : '---'}  ${hsLvm(d.size).padStart(6)} ${hsLvm(free).padStart(6)}\n`);
    }
  });
  function pvUsed(vg, d) {
    // distribute used space across PVs in order
    let used = lvsTotal(vg);
    for (const p of vg.pvs) {
      const cap = p.size - PE;
      const take = Math.min(cap, used);
      if (p === d) return take;
      used -= take;
    }
    return 0;
  }
  def('pvdisplay', async (c, args) => {
    for (const d of sortedDevs(c.sh).filter((x) => x.pv && (!args[0] || x.path === args[0]))) c.out(`  --- Physical volume ---\n  PV Name               ${d.path}\n  VG Name               ${d.pv.vg || ''}\n  PV Size               ${hsFull(d.size)}\n  Allocatable           ${d.pv.vg ? 'yes' : 'NO'}\n  PE Size               4.00 MiB\n  PV UUID               ${d.uuid}\n\n`);
  });
  def('vgcreate', async (c, args) => {
    const sh = c.sh;
    if (lvmRoot(c)) return 5;
    const [name, ...pvs] = args.filter((a) => !a.startsWith('-'));
    if (!name || !pvs.length) {
      c.err('  Please provide volume group name and physical volumes\n');
      return 3;
    }
    if (sh.vgs[name]) {
      c.err(`  A volume group called ${name} already exists.\n`);
      return 5;
    }
    const devs = [];
    for (const p of pvs) {
      const d = sh.getDev(p);
      if (!d) {
        c.err(`  Device ${p} not found.\n`);
        return 5;
      }
      if (!d.pv) {
        if (sh.mountOf(d.path) || (d.fs && d.fs !== 'LVM2_member')) {
          c.err(`  Cannot use ${p}: device is not an LVM physical volume (run pvcreate first)\n`);
          return 5;
        }
        d.fs = 'LVM2_member';
        d.pv = { vg: null };
        c.out(`  Physical volume "${p}" successfully created.\n`);
      }
      if (d.pv.vg) {
        c.err(`  Physical volume '${p}' is already in volume group '${d.pv.vg}'\n  Unable to add physical volume '${p}' to volume group '${name}'\n`);
        return 5;
      }
      devs.push(d);
    }
    sh.vgs[name] = { name, pvs: devs, lvs: {}, uuid: uuid().slice(0, 6) };
    devs.forEach((d) => (d.pv.vg = name));
    sh.fs.mkdirp('/dev/' + name, { owner: 'root', group: 'disk' });
    c.out(`  Volume group "${name}" successfully created\n`);
    return 0;
  });
  def('vgextend', async (c, args) => {
    const sh = c.sh;
    if (lvmRoot(c)) return 5;
    const [name, ...pvs] = args.filter((a) => !a.startsWith('-'));
    const vg = sh.vgs[name];
    if (!vg) {
      c.err(`  Volume group "${name}" not found\n  Cannot process volume group ${name}\n`);
      return 5;
    }
    for (const p of pvs) {
      const d = sh.getDev(p);
      if (!d) {
        c.err(`  Device ${p} not found.\n`);
        return 5;
      }
      if (!d.pv) {
        d.fs = 'LVM2_member';
        d.pv = { vg: null };
        c.out(`  Physical volume "${p}" successfully created.\n`);
      }
      if (d.pv.vg) {
        c.err(`  Physical volume '${p}' is already in volume group '${d.pv.vg}'\n`);
        return 5;
      }
      d.pv.vg = name;
      vg.pvs.push(d);
    }
    c.out(`  Volume group "${name}" successfully extended\n`);
    return 0;
  });
  def('vgs', async (c) => {
    const vgs = Object.values(c.sh.vgs);
    if (!vgs.length) return 0;
    c.out('  VG  #PV #LV #SN Attr   VSize  VFree \n');
    for (const v of vgs) c.out(`  ${v.name.padEnd(3)} ${String(v.pvs.length).padStart(3)} ${String(Object.keys(v.lvs).length).padStart(3)}   0 wz--n- ${hsLvm(vgSize(v)).padStart(6)} ${hsLvm(vgSize(v) - lvsTotal(v)).padStart(6)}\n`);
  });
  def('vgdisplay', async (c, args) => {
    for (const v of Object.values(c.sh.vgs).filter((x) => !args[0] || x.name === args[0])) c.out(`  --- Volume group ---\n  VG Name               ${v.name}\n  Format                lvm2\n  VG Access             read/write\n  Cur LV                ${Object.keys(v.lvs).length}\n  Cur PV                ${v.pvs.length}\n  VG Size               ${hsFull(vgSize(v))}\n  PE Size               4.00 MiB\n  Total PE              ${Math.floor(vgSize(v) / PE)}\n  Alloc PE / Size       ${Math.floor(lvsTotal(v) / PE)} / ${hsFull(lvsTotal(v))}\n  Free  PE / Size       ${Math.floor((vgSize(v) - lvsTotal(v)) / PE)} / ${hsFull(vgSize(v) - lvsTotal(v))}\n  VG UUID               ${v.uuid}\n\n`);
  });
  const parseLvSize = (vg, s, cur) => {
    const free = vgSize(vg) - lvsTotal(vg);
    let m;
    if ((m = /^([+-]?)(\d+)%(FREE|VG|ORIGIN)$/i.exec(s))) {
      const base = m[3].toUpperCase() === 'FREE' ? free : vgSize(vg);
      const v = Math.floor((base * +m[2]) / 100 / PE) * PE;
      return m[1] === '+' ? cur + v : v;
    }
    return null;
  };
  def('lvcreate', async (c, args) => {
    const sh = c.sh;
    if (lvmRoot(c)) return 5;
    const { o, rest } = parseOpts(args, ['-L', '-l', '-n', '--name', '--size', '--extents']);
    const snap = !!(o.s || o.snapshot);
    let originDev = null;
    if (snap) {
      const target = rest[0] || '';
      originDev = sh.getDev(target) || sh.devs[target.startsWith('/dev/') ? target : '/dev/' + target];
      if (!originDev || originDev.type !== 'lvm') {
        c.err(`  Volume group "${target}" not found\n  Cannot process volume group ${target}\n`);
        return 5;
      }
    }
    const vgName = snap ? originDev.vg : rest[0];
    const vg = sh.vgs[vgName];
    if (!vg) {
      c.err(`  Volume group "${vgName}" not found\n  Cannot process volume group ${vgName}\n`);
      return 5;
    }
    const name = o.n || o.name || 'lvol' + (Object.keys(vg.lvs).length + 1);
    if (vg.lvs[name]) {
      c.err(`  Logical Volume "${name}" already exists in volume group "${vgName}"\n`);
      return 5;
    }
    const free = vgSize(vg) - lvsTotal(vg);
    let size;
    if (o.l || o.extents) size = parseLvSize(vg, o.l || o.extents, 0) ?? Math.floor(+(o.l || o.extents)) * PE;
    else {
      const sz = parseSize(o.L || o.size || '');
      if (!sz) {
        c.err('  Please specify either size or extents (not both)\n  Run `lvcreate --help\' for more information.\n');
        return 3;
      }
      size = Math.ceil(sz.bytes / PE) * PE;
    }
    if (size > free) {
      c.err(`  Volume group "${vgName}" has insufficient free space (${Math.floor(free / PE)} extents): ${Math.ceil(size / PE)} required.\n`);
      return 5;
    }
    const path = `/dev/${vgName}/${name}`;
    const dev = { path, name: `${vgName}-${name}`, type: 'lvm', size, parent: null, fs: null, uuid: null, label: null, data: null, major: 252, minor: Object.values(sh.devs).filter((d) => d.type === 'lvm').length, vg: vgName, lvName: name };
    // parent for lsblk: first PV
    dev.parent = vg.pvs[0].path;
    if (snap) {
      dev.snapOf = originDev.lvName;
      dev.fs = originDev.fs;
      dev.uuid = originDev.uuid;
      const om = sh.mountOf(originDev.path);
      const live = om ? sh.fs.lookup(om.target).kids : originDev.data || {};
      dev.data = {};
      for (const [k, v] of Object.entries(live)) dev.data[k] = sh.fs.clone(v);
      dev.snapAt = Date.now();
    }
    vg.lvs[name] = dev;
    sh.devs[path] = dev;
    lvNodes(sh, vg, dev, true);
    c.out(snap ? `  Logical volume "${name}" created.\n` : `  Logical volume "${name}" created.\n`);
    return 0;
  });
  def('lvs', async (c) => {
    const sh = c.sh;
    const all = Object.values(sh.vgs).flatMap((v) => Object.values(v.lvs));
    if (!all.length) return 0;
    const rows = all.map((l) => [l.lvName, l.vg, (l.snapOf ? 'swi-a-s---' : l.inactive ? '-wi-------' : '-wi-a-----') + (sh.mountOf(l.path) && !l.snapOf ? '' : ''), hsLvm(l.size), '', l.snapOf || '', l.snapOf ? '0.00' : '']);
    const head = ['LV', 'VG', 'Attr', 'LSize', 'Pool', 'Origin', 'Data%', 'Meta%', 'Move', 'Log', 'Cpy%Sync', 'Convert'];
    const w = [Math.max(2, ...rows.map((r) => r[0].length)), Math.max(2, ...rows.map((r) => r[1].length)), 10, Math.max(5, ...rows.map((r) => r[3].length)), 4, Math.max(6, ...rows.map((r) => r[5].length)), 6];
    c.out('  ' + head[0].padEnd(w[0]) + ' ' + head[1].padEnd(w[1]) + ' ' + head[2].padEnd(10) + ' ' + head[3].padStart(w[3]) + ' ' + 'Pool'.padEnd(4) + ' ' + head[5].padEnd(w[5]) + ' Data%  Meta%  Move Log Cpy%Sync Convert\n');
    for (const r of rows) c.out('  ' + r[0].padEnd(w[0]) + ' ' + r[1].padEnd(w[1]) + ' ' + r[2] + ' ' + r[3].padStart(w[3]) + ' ' + ''.padEnd(4) + ' ' + r[5].padEnd(w[5]) + ' ' + r[6].padStart(6) + '\n');
  });
  def('lvdisplay', async (c, args) => {
    for (const l of Object.values(c.sh.vgs).flatMap((v) => Object.values(v.lvs)).filter((x) => !args[0] || x.path === args[0])) c.out(`  --- Logical volume ---\n  LV Path                ${l.path}\n  LV Name                ${l.lvName}\n  VG Name                ${l.vg}\n  LV Status              available\n  LV Size                ${hsFull(l.size)}\n  Current LE             ${Math.floor(l.size / PE)}\n  Block device           252:${l.minor}\n\n`);
  });
  def('lvextend', async (c, args) => {
    const sh = c.sh;
    if (lvmRoot(c)) return 5;
    const { o, rest } = parseOpts(args, ['-L', '-l', '--size']);
    const dev = sh.getDev(rest[rest.length - 1]) || (rest[rest.length - 1] && sh.devs[rest[rest.length - 1].replace('/dev/mapper/', '/dev/').replace('-', '/')]);
    if (!dev || dev.type !== 'lvm') {
      c.err(`  Volume group "${(rest[rest.length - 1] || '').split('/')[2] || ''}" not found\n  Cannot process volume group\n`);
      return 5;
    }
    const vg = sh.vgs[dev.vg];
    const free = vgSize(vg) - lvsTotal(vg);
    let ns;
    if (o.l) ns = parseLvSize(vg, o.l, dev.size);
    else {
      const sz = parseSize(o.L || o.size || '');
      if (!sz) {
        c.err('  Please specify either size or extents.\n');
        return 3;
      }
      ns = sz.sign === '+' ? dev.size + Math.ceil(sz.bytes / PE) * PE : Math.ceil(sz.bytes / PE) * PE;
    }
    if (ns === dev.size) {
      c.err(`  New size (${Math.floor(ns / PE)} extents) matches existing size (${Math.floor(ns / PE)} extents).\n  Run \`lvextend --help' for more information.\n`);
      return 5;
    }
    if (ns < dev.size) {
      c.err('  New size given (' + Math.floor(ns / PE) + ' extents) not larger than existing size (' + Math.floor(dev.size / PE) + ' extents)\n');
      return 5;
    }
    if (ns - dev.size > free) {
      c.err(`  Insufficient free space: ${Math.floor((ns - dev.size) / PE)} extents needed, but only ${Math.floor(free / PE)} available\n`);
      return 5;
    }
    c.out(`  Size of logical volume ${dev.vg}/${dev.lvName} changed from ${hsFull(dev.size)} (${Math.floor(dev.size / PE)} extents) to ${hsFull(ns)} (${Math.floor(ns / PE)} extents).\n`);
    dev.size = ns;
    c.out(`  Logical volume ${dev.vg}/${dev.lvName} successfully resized.\n`);
    if ((o.r || o.resizefs) && dev.fs) {
      if (dev.fs === 'xfs') {
        const m = sh.mountOf(dev.path);
        if (m) await sh.dispatch(['xfs_growfs', m.target], c.io);
      } else await sh.dispatch(['resize2fs', dev.path], c.io);
    }
    return 0;
  });
  def('lvremove', async (c, args) => {
    const sh = c.sh;
    if (lvmRoot(c)) return 5;
    const { o, rest } = parseOpts(args, []);
    const target = rest[0];
    const dev = sh.getDev(target) || sh.devs['/dev/' + target];
    if (!dev || dev.type !== 'lvm') {
      c.err(`  Failed to find logical volume "${target}"\n`);
      return 5;
    }
    if (sh.mountOf(dev.path)) {
      c.err(`  Logical volume ${dev.vg}/${dev.lvName} contains a filesystem in use.\n`);
      return 5;
    }
    if (!o.f && !o.y) {
      const a = await stdinLine(c, `Do you really want to remove active logical volume ${dev.vg}/${dev.lvName}? [y/n]: `);
      if (!/^y/i.test(a || '')) return 5;
    }
    const vg = sh.vgs[dev.vg];
    delete vg.lvs[dev.lvName];
    delete sh.devs[dev.path];
    lvNodes(sh, vg, dev, false);
    c.out(`  Logical volume "${dev.lvName}" successfully removed.\n`);
    return 0;
  });
  def('lvreduce', async (c, args) => {
    const sh = c.sh;
    if (lvmRoot(c)) return 5;
    const { o, rest } = parseOpts(args, ['-L', '-l', '--size']);
    const dev = sh.getDev(rest[rest.length - 1]) || sh.devs['/dev/' + (rest[rest.length - 1] || '')];
    if (!dev || dev.type !== 'lvm') {
      c.err(`  Volume group "${(rest[rest.length - 1] || '').split('/')[0] || ''}" not found\n  Cannot process volume group\n`);
      return 5;
    }
    const sz = parseSize(o.L || o.size || '');
    if (!sz) {
      c.err('  Please specify either size or extents.\n');
      return 3;
    }
    const ns = sz.sign === '-' ? dev.size - Math.ceil(sz.bytes / PE) * PE : Math.ceil(sz.bytes / PE) * PE;
    if (ns >= dev.size) {
      c.err(`  New size (${Math.floor(ns / PE)} extents) matches or exceeds existing size (${Math.floor(dev.size / PE)} extents).\n  Run \`lvreduce --help' for more information.\n`);
      return 5;
    }
    if (ns <= 0) {
      c.err('  New size given (0 extents) not larger than existing size (0 extents)\n');
      return 5;
    }
    const m = sh.mountOf(dev.path);
    if (o.r) {
      if (dev.fs === 'xfs') {
        c.err(`fsadm: Filesystem "xfs" on device "${dev.path}" is not supported by this tool.\n  Filesystem check failed.\n`);
        return 5;
      }
      if (m) {
        const a = await stdinLine(c, `Do you want to unmount "${m.target}" ? [Y|n] `);
        if (a !== null && /^n/i.test(a)) return 5;
        await sh.dispatch(['umount', m.target], c.io);
      }
      if (dev.fs === 'ext4') {
        const used = dev.data ? 0 : 0;
        c.out(`fsck from util-linux 2.39.3\n${dev.path}: 11/196608 files (0.0% non-contiguous), 26624/786432 blocks\nResizing the filesystem on ${dev.path} to ${Math.floor(ns / 4096)} (4k) blocks.\nThe filesystem on ${dev.path} is now ${Math.floor(ns / 4096)} (4k) blocks long.\n\n`);
        dev.fsSize = ns;
      }
    } else {
      c.out(`  WARNING: Reducing active${m ? ' and open' : ''} logical volume to ${hsFull(ns)}.\n  THIS MAY DESTROY YOUR DATA (filesystem etc.)\n`);
      if (!o.f) {
        const a = await stdinLine(c, `Do you really want to reduce ${dev.vg}/${dev.lvName}? [y/n]: `);
        if (!/^y/i.test(a || '')) {
          c.out('  Logical volume vg/lv NOT reduced\n'.replace('vg/lv', `${dev.vg}/${dev.lvName}`));
          return 5;
        }
      }
      if (dev.fs && (dev.fsSize || dev.size) > ns) dev.fsBroken = true;
    }
    c.out(`  Size of logical volume ${dev.vg}/${dev.lvName} changed from ${hsFull(dev.size)} (${Math.floor(dev.size / PE)} extents) to ${hsFull(ns)} (${Math.floor(ns / PE)} extents).\n`);
    dev.size = ns;
    c.out(`  Logical volume ${dev.vg}/${dev.lvName} successfully resized.\n`);
    return 0;
  });
  def('lvresize', async (c, args) => {
    const { o, rest } = parseOpts(args, ['-L', '-l', '--size']);
    const sz = parseSize(o.L || o.size || '');
    const dev = c.sh.getDev(rest[rest.length - 1]) || c.sh.devs['/dev/' + (rest[rest.length - 1] || '')];
    if (sz && dev && dev.type === 'lvm') {
      const target = sz.sign === '-' ? true : sz.sign === '+' ? false : Math.ceil(sz.bytes / PE) * PE < dev.size;
      return await c.sh.dispatch([target ? 'lvreduce' : 'lvextend', ...args], c.io);
    }
    return await c.sh.dispatch(['lvextend', ...args], c.io);
  });
  def('lvchange', async (c, args) => {
    const sh = c.sh;
    if (lvmRoot(c)) return 5;
    const t = args.find((a) => !a.startsWith('-'));
    const dev = sh.getDev(t) || sh.devs['/dev/' + (t || '')];
    if (!dev || dev.type !== 'lvm') {
      c.err(`  Failed to find logical volume "${t || ''}"\n`);
      return 5;
    }
    if (args.includes('-an')) {
      if (sh.mountOf(dev.path)) {
        c.err(`  Logical volume ${dev.vg}/${dev.lvName} contains a filesystem in use.\n`);
        return 5;
      }
      dev.inactive = true;
    }
    if (args.includes('-ay')) dev.inactive = false;
    return 0;
  });
  def('pvmove', async (c, args) => {
    const sh = c.sh;
    if (lvmRoot(c)) return 5;
    const src = sh.getDev(args.find((a) => !a.startsWith('-')) || '');
    if (!src || !src.pv || !src.pv.vg) {
      c.err(`  Physical volume ${args[0] || ''} not found\n`);
      return 5;
    }
    const vg = sh.vgs[src.pv.vg];
    const dest = args.filter((a) => !a.startsWith('-'))[1];
    if (vg.pvs.length < 2 || (dest && !vg.pvs.some((p) => p.path === dest))) {
      c.err(`  No data to move for ${vg.name}.\n`.replace('No data to move', vg.pvs.length < 2 ? 'No extents available for allocation.' : 'Physical volume not in VG').replace(` for ${vg.name}.`, vg.pvs.length < 2 ? '' : ` ${dest}`));
      return 5;
    }
    c.out(`  ${src.path}: Moved: 12.50%\n  ${src.path}: Moved: 62.50%\n  ${src.path}: Moved: 100.00%\n`);
    return 0;
  });
  def('vgreduce', async (c, args) => {
    const sh = c.sh;
    if (lvmRoot(c)) return 5;
    const [name, ...pvs] = args.filter((a) => !a.startsWith('-'));
    const vg = sh.vgs[name];
    if (!vg) {
      c.err(`  Volume group "${name}" not found\n  Cannot process volume group ${name}\n`);
      return 5;
    }
    for (const p of pvs) {
      const d = vg.pvs.find((x) => x.path === p);
      if (!d) {
        c.err(`  Physical Volume "${p}" not found in Volume Group "${name}".\n`);
        return 5;
      }
      const remaining = vg.pvs.filter((x) => x !== d).reduce((sz, x) => sz + x.size - PE, 0);
      if (remaining < lvsTotal(vg)) {
        c.err(`  Physical volume "${p}" still in use\n`);
        return 5;
      }
      vg.pvs = vg.pvs.filter((x) => x !== d);
      d.pv.vg = null;
      c.out(`  Removed "${p}" from volume group "${name}"\n`);
    }
    return 0;
  });
  def('vgremove', async (c, args) => {
    const sh = c.sh;
    if (lvmRoot(c)) return 5;
    const vg = sh.vgs[args.find((a) => !a.startsWith('-'))];
    if (!vg) {
      c.err('  Volume group not found\n');
      return 5;
    }
    if (Object.keys(vg.lvs).length) {
      c.err(`  Logical volume ${vg.name}/${Object.keys(vg.lvs)[0]} in use.\n`);
      return 5;
    }
    vg.pvs.forEach((p) => (p.pv.vg = null));
    delete sh.vgs[vg.name];
    c.out(`  Volume group "${vg.name}" successfully removed\n`);
    return 0;
  });
  def('pvremove', async (c, args) => {
    if (lvmRoot(c)) return 5;
    for (const p of args.filter((a) => !a.startsWith('-'))) {
      const d = c.sh.getDev(p);
      if (!d || !d.pv) continue;
      if (d.pv.vg) {
        c.err(`  PV ${p} is used by VG ${d.pv.vg}.\n`);
        return 5;
      }
      d.pv = null;
      d.fs = null;
      c.out(`  Labels on physical volume "${p}" successfully wiped.\n`);
    }
  });

  /* ---------- RAID ---------- */
  def('mdadm', async (c, args) => {
    const sh = c.sh;
    if (needRoot(c, 'mdadm: must be super-user to perform this action\n')) return 1;
    sh.md = sh.md || {};
    const { o, rest } = parseOpts(args, ['--level', '-l', '--raid-devices', '-n', '--create', '-C', '--stop', '-S', '--fail', '-f', '--remove', '-r', '--add', '-a']);
    const create = o.create || o.C;
    if (create) {
      const level = String(o.level || o.l || '1');
      const n = +(o['raid-devices'] || o.n || rest.length);
      const devs = rest.filter((x) => x.startsWith('/dev/') && x !== create);
      if (devs.length < n) {
        c.err(`mdadm: You haven't given enough devices (real or "missing") to create this array\n`);
        return 1;
      }
      const members = devs.map((p) => sh.getDev(p));
      if (members.some((m) => !m)) {
        c.err(`mdadm: cannot open ${devs[members.findIndex((m) => !m)]}: No such file or directory\n`);
        return 1;
      }
      const minSize = Math.min(...members.map((m) => m.size));
      const size = level === '0' ? minSize * n : level === '1' ? minSize : level === '5' ? minSize * (n - 1) : level === '6' ? minSize * (n - 2) : level === '10' ? (minSize * n) / 2 : minSize;
      const path = create;
      const dev = { path, name: VFS.base(path), type: 'raid' + level, size, parent: null, fs: null, uuid: null, label: null, data: null, major: 9, minor: Object.keys(sh.md).length };
      dev.raid = { level, members: devs.slice(), failed: [], state: 'clean' };
      sh.md[path] = dev;
      sh.devs[path] = dev;
      devNode(sh, dev);
      members.forEach((m) => (m.fs = 'linux_raid_member'));
      c.out(`mdadm: Defaulting to version 1.2 metadata\nmdadm: array ${path} started.\n`);
      return 0;
    }
    const detail = o.detail || o.D;
    if (detail) {
      const targets = Object.values(sh.md).filter((d) => d.path === rest[0] || args.includes('--scan'));
      if (!targets.length) {
        c.err(`mdadm: cannot open ${rest[0]}: No such file or directory\n`);
        return 1;
      }
      if (args.includes('--scan')) {
        targets.forEach((d) => c.out(`ARRAY ${d.path} metadata=1.2 name=linux-school:${d.minor} UUID=${d.uuid || (d.uuid = uuid())}\n`));
        return 0;
      }
      const d = targets[0];
      const act = d.raid.members.filter((m) => !d.raid.failed.includes(m));
      c.out(`${d.path}:\n           Version : 1.2\n     Creation Time : ${U.strftime('%a %b %e %H:%M:%S %Y', new Date())}\n        Raid Level : raid${d.raid.level}\n        Array Size : ${Math.round(d.size / 1024)} (${hsFull(d.size)})\n      Raid Devices : ${d.raid.members.length}\n     Total Devices : ${d.raid.members.length}\n             State : ${d.raid.failed.length ? 'clean, degraded' : 'clean'}\n    Active Devices : ${act.length}\n   Failed Devices : ${d.raid.failed.length}\n\n    Number   Major   Minor   RaidDevice State\n${d.raid.members.map((m, i) => `       ${i}       8      ${i * 16}        ${i}      ${d.raid.failed.includes(m) ? 'faulty' : 'active sync'}   ${m}`).join('\n')}\n`);
      return 0;
    }
    const stop = o.stop || o.S;
    if (stop) {
      const d = sh.md[stop];
      if (!d) {
        c.err(`mdadm: error opening ${stop}: No such file or directory\n`);
        return 1;
      }
      if (sh.mountOf(d.path)) {
        c.err(`mdadm: Cannot get exclusive access to ${d.path}:Perhaps a running process, mounted filesystem or active volume group?\n`);
        return 1;
      }
      d.raid.members.forEach((m) => {
        const md = sh.getDev(m);
        if (md) md.fs = null;
      });
      delete sh.md[stop];
      delete sh.devs[stop];
      delete sh.fs.lookup('/dev').kids[d.name];
      c.out(`mdadm: stopped ${stop}\n`);
      return 0;
    }
    const target = rest[0];
    const d = sh.md[target];
    if (d && (o.fail || o.f || o.remove || o.r || o.add || o.a)) {
      if (o.fail || o.f) {
        const m = o.fail || o.f;
        if (!d.raid.members.includes(m)) {
          c.err(`mdadm: cannot find ${m}: No such file or directory\n`);
          return 1;
        }
        d.raid.failed.push(m);
        c.out(`mdadm: set ${m} faulty in ${target}\n`);
      }
      if (o.remove || o.r) {
        const m = o.remove || o.r;
        d.raid.members = d.raid.members.filter((x) => x !== m);
        d.raid.failed = d.raid.failed.filter((x) => x !== m);
        c.out(`mdadm: hot removed ${m} from ${target}\n`);
      }
      if (o.add || o.a) {
        const m = o.add || o.a;
        d.raid.members.push(m);
        c.out(`mdadm: added ${m}\n`);
      }
      return 0;
    }
    c.err('Usage: mdadm --help\n');
    return 1;
  }, { pkg: 'mdadm' });
  P.mdstat = function () {
    const md = Object.values(this.md || {});
    if (!md.length) return 'Personalities :\nunused devices: <none>\n';
    return `Personalities : [raid0] [raid1] [raid6] [raid5] [raid4] [raid10]\n${md.map((d) => `${d.name} : active raid${d.raid.level} ${d.raid.members.map((m, i) => `${VFS.base(m)}[${i}]${d.raid.failed.includes(m) ? '(F)' : ''}`).reverse().join(' ')}\n      ${Math.round(d.size / 1024)} blocks super 1.2 [${d.raid.members.length}/${d.raid.members.length - d.raid.failed.length}] [${d.raid.members.map((m) => (d.raid.failed.includes(m) ? '_' : 'U')).join('')}]\n`).join('\n')}\nunused devices: <none>\n`;
  };

  /* ---------- NFS ---------- */
  def('showmount', async (c, args) => {
    if (!c.sh.installed.has('nfs-common')) {
      c.err("Command 'showmount' not found, but can be installed with:\n\nsudo apt install nfs-common\n\n");
      return 127;
    }
    const host = args.find((a) => !a.startsWith('-'));
    if (host === 'localhost' || host === '127.0.0.1') {
      const ex = c.sh.fs.lookup('/etc/exports');
      c.out('Export list for localhost:\n' + U.lines(ex ? ex.content : '').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split(/\s+/)[0] + ' ' + (l.split(/\s+/)[1] || '*').replace(/\(.*\)/, '')).join('\n') + '\n');
      return 0;
    }
    if (host !== 'demo-server') {
      c.err(`clnt_create: RPC: Unknown host\n`);
      return 1;
    }
    c.out('Export list for demo-server:\n/export/share 192.168.1.0/24\n');
  }, { pkg: 'nfs-common' });
  def('exportfs', async (c, args) => {
    if (needRoot(c, 'exportfs: Failed to stat /etc/exports: Permission denied\n')) return 1;
    const ex = c.sh.fs.lookup('/etc/exports');
    if (args.includes('-v') || !args.length) U.lines(ex ? ex.content : '').filter((l) => l.trim() && !l.startsWith('#')).forEach((l) => c.out(l.replace(/\s+/, '\t\t') + '\n'));
    return 0;
  }, { pkg: 'nfs-kernel-server' });

  /* ---------- dd / fallocate / truncate ---------- */
  const parseSizeArg = (v) => {
    const m = /^(\d+)([cwbkKMGT]?B?)?$/.exec(v || '');
    if (!m) return null;
    const mult = { c: 1, w: 2, b: 512, k: 1024, K: 1024, KB: 1000, M: MiB, MB: 1e6, G: GiB, GB: 1e9, T: GiB * 1024, undefined: 1 }[m[2]];
    return +m[1] * (mult || 1);
  };
  def('dd', async (c, args) => {
    const sh = c.sh;
    const kv = {};
    for (const a of args) {
      const i = a.indexOf('=');
      if (i > 0) kv[a.slice(0, i)] = a.slice(i + 1);
    }
    const bs = parseSizeArg(kv.bs) || 512;
    let count = kv.count !== undefined ? +kv.count : null;
    const src = kv.if;
    const dst = kv.of;
    let bytes;
    let content = null;
    if (!src) {
      content = await c.slurp();
      bytes = content.length;
    } else if (/^\/dev\/(zero|urandom|random)$/.test(src)) {
      if (count === null) {
        c.err('dd: reading from /dev/zero without count would never finish; add count=N\n');
        return 1;
      }
      bytes = bs * count;
    } else {
      try {
        const n = sh.fs.lookup(c.abs(src));
        if (n && n.t === 'f' && n.size !== undefined) bytes = n.size;
        else content = sh.readFile(c.abs(src));
        if (content !== null) bytes = content.length;
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`dd: failed to open '${src}': ${U.errTxt(e)}\n`);
        return 1;
      }
      if (count !== null) bytes = Math.min(bytes, bs * count);
    }
    if (dst && dst !== '/dev/null') {
      try {
        const dabs = c.abs(dst);
        const dd = sh.getDev(dabs, false) || sh.devs[dabs];
        if (dd && dd.type !== 'loop' && /^\/dev\//.test(dabs)) {
          if (sh.eu() !== 'root') throw new FsErr('EACCES', dabs);
          if (sh.mountOf(dd.path)) c.err('dd: warning: the target is mounted; data loss is likely\n');
          dd.fs = null;
          dd.uuid = null;
          dd.data = null;
        } else {
          sh.writeFile(dabs, content !== null && !/^\/dev/.test(src || '') ? content.slice(0, bytes) : '', false);
          const nn = sh.fs.lookup(dabs);
          if (content === null || /^\/dev/.test(src || '')) {
            nn.size = bytes;
            nn.bin = true;
          }
        }
      } catch (e) {
        if (!(e instanceof FsErr)) throw e;
        c.err(`dd: failed to open '${dst}': ${U.errTxt(e)}\n`);
        return 1;
      }
    } else if (!dst && content !== null) c.out(content.slice(0, bytes));
    const recs = Math.floor(bytes / bs);
    const rem = bytes % bs;
    const mb = (bytes / 1e6).toFixed(bytes >= 1e6 ? 0 : 3);
    c.err(`${recs}+${rem ? 1 : 0} records in\n${recs}+${rem ? 1 : 0} records out\n${bytes} bytes (${bytes >= 1e9 ? (bytes / 1e9).toFixed(1) + ' GB' : bytes >= 1e6 ? mb + ' MB' : bytes >= 1e3 ? (bytes / 1e3).toFixed(1) + ' kB' : bytes + ' B'}, ${bytes >= GiB ? (bytes / GiB).toFixed(1) + ' GiB' : bytes >= MiB ? (bytes / MiB).toFixed(0) + ' MiB' : (bytes / 1024).toFixed(0) + ' KiB'}) copied, 0.${String(10 + (bytes % 80)).padStart(2, '0')} s, ${Math.max(1, Math.round(bytes / 1e6 / 0.1))} MB/s\n`);
    return 0;
  });
  def('fallocate', async (c, args) => {
    const li = args.indexOf('-l');
    const sz = parseSize(args[li + 1] || '');
    const f = args[args.length - 1];
    if (li < 0 || !sz) {
      c.err('fallocate: no length argument specified\n');
      return 1;
    }
    try {
      c.sh.writeFile(c.abs(f), '', false);
      const n = c.sh.fs.lookup(c.abs(f));
      n.size = sz.bytes;
      n.bin = true;
    } catch (e) {
      if (!(e instanceof FsErr)) throw e;
      c.err(`fallocate: cannot open ${f}: ${U.errTxt(e)}\n`);
      return 1;
    }
  });
  def('truncate', async (c, args) => {
    const si = args.indexOf('-s');
    const sz = parseSize((args[si + 1] || '').replace(/^[+-]/, ''));
    const f = args[args.length - 1];
    if (si < 0 || !sz) {
      c.err("truncate: you must specify either '--size' or '--reference'\n");
      return 1;
    }
    try {
      c.sh.writeFile(c.abs(f), '', false);
      const n = c.sh.fs.lookup(c.abs(f));
      n.size = sz.bytes;
      n.bin = true;
    } catch (e) {
      if (!(e instanceof FsErr)) throw e;
      c.err(`truncate: cannot open '${f}' for writing: ${U.errTxt(e)}\n`);
      return 1;
    }
  });
  def('losetup', async (c, args) => {
    if (needRoot(c, 'losetup: cannot find an unused loop device: Permission denied\n')) return 1;
    c.out('/dev/loop0\n');
  });
  LX.devRead = (dev) => {
    if (dev === 'zero') return '\0'.repeat(65536);
    if (dev === 'urandom' || dev === 'random') return Array.from({ length: 4096 }, () => String.fromCharCode(33 + Math.floor(Math.random() * 90))).join('');
    return '';
  };
  LX.initHooks.push((sh) => {
    const d = sh.fs.lookup('/dev');
    d.kids.zero = sh.fs.mk('c', { owner: 'root', group: 'root', mode: 0o666, dev: 'zero' });
    d.kids.urandom = sh.fs.mk('c', { owner: 'root', group: 'root', mode: 0o666, dev: 'urandom' });
    d.kids.random = sh.fs.mk('c', { owner: 'root', group: 'root', mode: 0o666, dev: 'random' });
    d.kids.full = sh.fs.mk('c', { owner: 'root', group: 'root', mode: 0o666 });
    d.kids.tty = sh.fs.mk('c', { owner: 'root', group: 'tty', mode: 0o666 });
  });

  /* ---------- reboot support ---------- */
  P.rebuildMounts = function () {
    for (const m of this.mounts.slice().reverse()) if (m.target !== '/' && m.target !== '/boot/efi') umountTarget(this, m);
    this.swaps = [];
    for (const d of Object.values(this.devs)) d.swapOn = false;
    const stub = { err: () => {}, out: () => {}, io: {} };
    for (const e of fstabEntries(this)) {
      if (e.fs === 'swap') {
        this.swapOn(stub, e.src);
        continue;
      }
      if (/noauto/.test(e.opts) || e.target === '/' || e.target === '/boot/efi' || e.target === 'none') continue;
      const dev = /^[\w.-]+:\//.test(e.src) ? null : byRef(this, e.src);
      if (dev && dev.fs && !this.mounts.find((m) => m.target === e.target) && this.fs.lookup(e.target)) mountDev(this, dev, e.target, dev.fs, e.opts.replace(/defaults/, 'rw,relatime'));
    }
  };
  Object.assign(LX.PKGS, {
    mdadm: { ver: '4.3-1ubuntu2', desc: 'tool to administer Linux MD arrays (software RAID)', size: 471, bins: ['mdadm'] },
    'nfs-common': { ver: '1:2.6.4-3ubuntu5', desc: 'NFS support files common to client and server', size: 238, bins: ['showmount'] },
    'nfs-kernel-server': { ver: '1:2.6.4-3ubuntu5', desc: 'support for NFS kernel server', size: 130, bins: ['exportfs'], service: { desc: 'NFS server and services', proc: 'nfsd', name: 'nfs-server' } },
  });
})();
