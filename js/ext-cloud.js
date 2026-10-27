/* Linux Academy: cloud and virtualisation. Instance metadata service (169.254.169.254), cloud-init, virtualisation detection, qemu-img, virsh.
   The sandbox is a small cloud VM (think: a t3.micro in ap-south-1a). `cloudlab` is a sandbox-only helper (like timewarp). */
(function () {
  const LX = (globalThis.LX = globalThis.LX || {});
  const { def, FsErr, VFS } = LX;
  const U = LX.U;
  const strftime = (f, d) => U.strftime(f, d || new Date());

  const INSTANCE = {
    id: 'i-0a1b2c3d4e5f67890',
    ami: 'ami-0c55b159cbfafe1f0',
    type: 't3.micro',
    az: 'ap-south-1a',
    region: 'ap-south-1',
    publicIp: '203.0.113.42',
    sg: 'web-sg',
    role: 'web-app-role',
    mac: '0a:58:c0:a8:01:05',
  };

  /* ---------- sandbox VM facts: DMI, virtualisation ---------- */
  LX.initHooks.push((sh) => {
    const put = (p, c) => sh.fs.put(p, c, { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/sys/class/dmi/id', { owner: 'root', group: 'root' });
    put('/sys/class/dmi/id/sys_vendor', 'Amazon EC2\n');
    put('/sys/class/dmi/id/product_name', INSTANCE.type + '\n');
    put('/sys/class/dmi/id/bios_vendor', 'Amazon EC2\n');
    put('/sys/class/dmi/id/board_asset_tag', INSTANCE.id + '\n');
    put('/sys/hypervisor/uuid', 'ec2f2d6e-0000-0000-0000-000000000000\n');
    sh.fs.mkdirp('/var/lib/cloud/instance', { owner: 'root', group: 'root' });
    sh.fs.mkdirp('/var/lib/cloud/data', { owner: 'root', group: 'root' });
    put('/var/lib/cloud/data/instance-id', INSTANCE.id + '\n');
    put('/var/lib/cloud/data/previous-instance-id', INSTANCE.id + '\n');
    put('/var/lib/cloud/instance/user-data.txt', '#cloud-config\nhostname: web-01\nmanage_etc_hosts: true\npackages:\n  - nginx\nruncmd:\n  - systemctl enable --now nginx\n');
    put('/var/lib/cloud/instance/datasource', 'DataSourceEc2Local: DataSourceEc2Local\n');
    put('/run/cloud-init/result.json', JSON.stringify({ v1: { datasource: 'DataSourceEc2Local', errors: [] } }) + '\n');
    put('/var/log/cloud-init.log', [
      '2026-10-26 04:11:02,114 - util.py[DEBUG]: Cloud-init v. 24.1.3-0ubuntu3 running \'init-local\' at Mon, 26 Oct 2026 04:11:02 +0000. Up 3.18 seconds.',
      '2026-10-26 04:11:02,630 - __init__.py[DEBUG]: Looking for data source in: [\'Ec2\', \'None\'], via packages [\'\', \'cloudinit.sources\'] that matches dependencies [\'FILESYSTEM\']',
      '2026-10-26 04:11:03,044 - DataSourceEc2.py[DEBUG]: strict_mode: warn, cloud_name=aws platform=ec2',
      '2026-10-26 04:11:04,512 - url_helper.py[DEBUG]: [0/1] open \'http://169.254.169.254/2009-04-04/meta-data/instance-id\' with {\'allow_redirects\': True, \'method\': \'GET\'} configuration',
      '2026-10-26 04:11:04,731 - __init__.py[INFO]: Found data source DataSourceEc2Local',
      '2026-10-26 04:11:05,880 - stages.py[DEBUG]: applying config: hostname web-01',
      '2026-10-26 04:11:21,002 - cc_package_update_upgrade_install.py[INFO]: installing packages [\'nginx\']',
      '2026-10-26 04:11:44,310 - util.py[DEBUG]: Cloud-init v. 24.1.3-0ubuntu3 finished at Mon, 26 Oct 2026 04:11:44 +0000. Datasource DataSourceEc2Local.  Up 45.7 seconds',
      '',
    ].join('\n'));
    put('/var/log/cloud-init-output.log', 'Cloud-init v. 24.1.3-0ubuntu3 running \'init-local\' at Mon, 26 Oct 2026 04:11:02 +0000. Up 3.18 seconds.\nCloud-init v. 24.1.3-0ubuntu3 running \'modules:final\' at Mon, 26 Oct 2026 04:11:40 +0000. Up 41.20 seconds.\nCloud-init v. 24.1.3-0ubuntu3 finished at Mon, 26 Oct 2026 04:11:44 +0000. Datasource DataSourceEc2Local.  Up 45.7 seconds\n');
    put('/etc/cloud/cloud.cfg', '# The top level settings are used as module\n# and base configuration.\nusers:\n  - default\ndisable_root: true\npreserve_hostname: false\n\ncloud_init_modules:\n  - seed_random\n  - bootcmd\n  - write_files\n  - growpart\n  - resizefs\n  - set_hostname\n  - update_hostname\n  - update_etc_hosts\n  - ssh\n\ncloud_config_modules:\n  - ssh_import_id\n  - locale\n  - set_passwords\n  - ntp\n  - timezone\n  - runcmd\n\ncloud_final_modules:\n  - package_update_upgrade_install\n  - scripts_user\n  - ssh_authkey_fingerprints\n  - final_message\n\nsystem_info:\n  default_user:\n    name: ubuntu\n    lock_passwd: True\n    gecos: Ubuntu\n    groups: [adm, audio, cdrom, dialout, dip, floppy, lxd, netdev, plugdev, sudo, video]\n    sudo: ["ALL=(ALL) NOPASSWD:ALL"]\n    shell: /bin/bash\n');
  });

  /* ---------- instance metadata service ---------- */
  const imds = (sh, o) => {
    const hdr = {};
    for (const [k, v] of Object.entries(o.headers || {})) hdr[k.toLowerCase()] = v;
    const own = sh.ownIps ? sh.ownIps().find((x) => !x.startsWith('127.')) || '192.168.1.5' : '192.168.1.5';
    const reply = (body, status = 200, ct = 'text/plain') => ({ status, headers: { 'Content-Type': ct, Server: 'EC2ws', Date: new Date().toUTCString(), 'X-Aws-Ec2-Metadata-Token-Ttl-Seconds': hdr['x-aws-ec2-metadata-token'] ? '21600' : undefined }, body, ip: '169.254.169.254' });
    const method = (o.method || 'GET').toUpperCase();
    sh.imds = sh.imds || { tokens: new Set(), v2: false };
    const path = (o.path || '/').split('?')[0];
    if (method === 'PUT' && /^\/latest\/api\/token$/.test(path)) {
      const ttl = +hdr['x-aws-ec2-metadata-token-ttl-seconds'];
      if (!ttl) return reply('', 400, 'text/plain');
      const tok = 'AQAEA' + Array.from({ length: 36 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[Math.floor(Math.random() * 64)]).join('') + '==';
      sh.imds.tokens.add(tok);
      return reply(tok);
    }
    if (sh.imds.v2 && !sh.imds.tokens.has(hdr['x-aws-ec2-metadata-token'])) return reply('<?xml version="1.0" encoding="iso-8859-1"?>\n<!DOCTYPE html>\n<html><head><title>401 - Unauthorized</title></head><body><h1>401 - Unauthorized</h1></body></html>\n', 401, 'text/html');
    const home = sh.users.learner ? sh.users.learner.home : '/home/learner';
    const pubkeyNode = sh.fs.lookup(home + '/.ssh/id_ed25519.pub');
    const tree = {
      'ami-id': INSTANCE.ami, 'ami-launch-index': '0', 'hostname': 'ip-' + own.replace(/\./g, '-') + '.ap-south-1.compute.internal', 'instance-action': 'none', 'instance-id': INSTANCE.id, 'instance-life-cycle': 'on-demand', 'instance-type': INSTANCE.type,
      'local-hostname': 'ip-' + own.replace(/\./g, '-') + '.ap-south-1.compute.internal', 'local-ipv4': own, 'mac': INSTANCE.mac, 'public-hostname': 'ec2-' + INSTANCE.publicIp.replace(/\./g, '-') + '.ap-south-1.compute.amazonaws.com', 'public-ipv4': INSTANCE.publicIp,
      'security-groups': INSTANCE.sg, 'placement/availability-zone': INSTANCE.az, 'placement/region': INSTANCE.region,
      'iam/security-credentials/': INSTANCE.role,
      'public-keys/0/openssh-key': pubkeyNode ? pubkeyNode.content.trim() : 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDemoKeyDemoKeyDemoKeyDemoKeyDemoKeyDemoKey1234 launch-key',
    };
    const creds = { Code: 'Success', LastUpdated: strftime('%FT%TZ'), Type: 'AWS-HMAC', AccessKeyId: 'ASIAEXAMPLEEXAMPLE12', SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', Token: 'IQoJb3JpZ2luX2VjEXAMPLE...(truncated)', Expiration: strftime('%FT%TZ', new Date(Date.now() + 6 * 3600e3)) };
    tree['iam/security-credentials/' + INSTANCE.role] = JSON.stringify(creds, null, 2);
    const listing = (prefix) => {
      const names = new Set();
      for (const k of Object.keys(tree)) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        if (!rest) continue;
        const seg = rest.split('/')[0];
        names.add(rest.includes('/') && rest.split('/')[1] !== '' ? seg + '/' : seg);
      }
      return [...names].sort();
    };
    if (/^\/(latest|2009-04-04|2021-07-15)?\/?$/.test(path) || path === '') return reply('2009-04-04\n2011-01-01\n2021-07-15\nlatest\n');
    let m;
    if ((m = /^\/(?:latest|2021-07-15|2009-04-04)\/meta-data(\/.*)?$/.exec(path))) {
      const sub = (m[1] || '/').replace(/^\//, '');
      if (sub === '' || sub.endsWith('/')) {
        const l = listing(sub);
        if (l.length) return reply(l.join('\n'));
        return reply('<html><body><h1>404 - Not Found</h1></body></html>\n', 404, 'text/html');
      }
      if (sub in tree) return reply(tree[sub]);
      const l2 = listing(sub + '/');
      if (l2.length) return reply(l2.join('\n'));
      return reply('<?xml version="1.0" encoding="iso-8859-1"?>\n<html><head><title>404 - Not Found</title></head><body><h1>404 - Not Found</h1></body></html>\n', 404, 'text/html');
    }
    if (/^\/(?:latest|2021-07-15|2009-04-04)\/user-data\/?$/.test(path)) {
      const n = sh.fs.lookup('/var/lib/cloud/instance/user-data.txt');
      return n ? reply(n.content) : reply('<html><body><h1>404 - Not Found</h1></body></html>\n', 404, 'text/html');
    }
    if (/^\/(?:latest|2021-07-15)\/dynamic\/instance-identity\/document$/.test(path)) return reply(JSON.stringify({ accountId: '123456789012', architecture: 'x86_64', availabilityZone: INSTANCE.az, imageId: INSTANCE.ami, instanceId: INSTANCE.id, instanceType: INSTANCE.type, privateIp: own, region: INSTANCE.region, version: '2017-09-30' }, null, 2) + '\n', 200, 'application/json');
    return reply('<html><body><h1>404 - Not Found</h1></body></html>\n', 404, 'text/html');
  };
  const origHttp = LX.httpRequest;
  LX.httpRequest = async function (sh, o) {
    if (o.host === '169.254.169.254') return imds(sh, o);
    return origHttp(sh, o);
  };

  /* ---------- virtualisation detection ---------- */
  def('systemd-detect-virt', async (c, args) => {
    if (args.includes('--container') || args.includes('-c')) { c.out('none\n'); return 1; }
    if (args.includes('--quiet') || args.includes('-q')) return 0;
    c.out('kvm\n');
    return 0;
  });
  def('virt-what', async (c) => {
    if (c.sh.eu() !== 'root') { c.err('virt-what: this script must be run as root\n'); return 1; }
    c.out('kvm\naws\n');
    return 0;
  }, { pkg: 'virt-what' });
  const dmi = LX.cmds.dmidecode;
  if (dmi) {
    const origRun = dmi.run;
    def('dmidecode', async (c, args) => {
      let buf = '';
      const r = await origRun(Object.assign({}, c, { out: (t) => (buf += t) }), args);
      c.out(buf.replace(/QEMU/g, 'Amazon EC2').replace(/Standard PC \(Q35 \+ ICH9, 2009\)/g, INSTANCE.type));
      return r;
    }, { bin: dmi.bin });
  }

  /* ---------- cloud-init ---------- */
  const TOP_KEYS = ['#cloud-config', 'hostname', 'fqdn', 'manage_etc_hosts', 'preserve_hostname', 'prefer_fqdn_over_hostname', 'users', 'groups', 'ssh_authorized_keys', 'ssh_pwauth', 'disable_root', 'chpasswd', 'password', 'packages', 'package_update', 'package_upgrade', 'package_reboot_if_required', 'apt', 'write_files', 'runcmd', 'bootcmd', 'timezone', 'locale', 'ntp', 'final_message', 'power_state', 'mounts', 'swap', 'ssh_keys', 'ssh_import_id', 'growpart', 'resize_rootfs', 'snap', 'rsyslog', 'ca_certs', 'device_aliases', 'disk_setup', 'fs_setup', 'mount_default_fields', 'phone_home', 'ansible', 'bootcmd', 'merge_how', 'network', 'manage_resolv_conf', 'resolv_conf', 'yum_repos', 'ssh', 'keyboard', 'updates', 'wireguard', 'lxd', 'ubuntu_pro', 'users-groups'];
  function validateCloudConfig(text) {
    const errors = [];
    if (!/^#cloud-config\s*$/m.test(text.split('\n')[0] || '')) return { kind: 'header' };
    let doc;
    try { doc = LX.yaml.parse(text); } catch (e) { return { kind: 'yaml', msg: e.message }; }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { kind: 'yaml', msg: 'cloud-config must be a mapping' };
    for (const k of Object.keys(doc)) if (!TOP_KEYS.includes(k)) errors.push(`${k}: Additional properties are not allowed ('${k}' was unexpected)`);
    if (doc.packages !== undefined && !Array.isArray(doc.packages)) errors.push(`packages: ${JSON.stringify(doc.packages)} is not of type 'array'`);
    if (doc.runcmd !== undefined && !Array.isArray(doc.runcmd)) errors.push(`runcmd: ${JSON.stringify(doc.runcmd)} is not of type 'array'`);
    if (doc.users !== undefined && !Array.isArray(doc.users)) errors.push(`users: ${JSON.stringify(doc.users)} is not of type 'array'`);
    if (doc.write_files !== undefined && Array.isArray(doc.write_files)) doc.write_files.forEach((w, i) => { if (!w || !w.path) errors.push(`write_files.${i}: 'path' is a required property`); });
    return { kind: errors.length ? 'schema' : 'ok', errors, doc };
  }
  def('cloud-init', async (c, args) => {
    const sh = c.sh;
    const sub = args.find((a) => !a.startsWith('-'));
    if (args.includes('--version') || args.includes('-v') || sub === 'version') { c.out('/usr/bin/cloud-init 24.1.3-0ubuntu3\n'); return 0; }
    if (!sub || args.includes('--help') || args.includes('-h')) { c.out('usage: /usr/bin/cloud-init [-h] [--version] [--debug] [--force]\n                        {init,modules,single,query,features,analyze,devel,collect-logs,clean,status,schema} ...\n'); return 0; }
    if (sub === 'status') {
      if (args.includes('--long') || args.includes('-l')) c.out(`status: done\nextended_status: done\nboot_status_code: enabled-by-generator\nlast_update: ${strftime('%a, %d %b %Y %T +0000', new Date(Date.now() - 86400e3))}\ndetail: DataSourceEc2Local\nerrors: []\nrecoverable_errors: {}\n`);
      else if (args.includes('--format=json')) c.out('{"status": "done", "errors": [], "datasource": "ec2"}\n');
      else c.out('status: done\n');
      return 0;
    }
    if (sub === 'schema') {
      const fi = args.findIndex((a) => a === '--config-file' || a === '-c');
      const file = fi >= 0 ? args[fi + 1] : args.find((a) => a.startsWith('--config-file='));
      const f = file && file.startsWith('--config-file=') ? file.split('=')[1] : file;
      if (!f) { c.err('usage: cloud-init schema [-h] [-c CONFIG_FILE | --system] [--annotate]\ncloud-init schema: error: Expected either --config-file argument or --system\n'); return 2; }
      const n = sh.fs.lookup(c.abs(f));
      if (!n) { c.err(`Error: Config file ${f} does not exist\n`); return 1; }
      const r = validateCloudConfig(sh.readFile(c.abs(f)));
      if (r.kind === 'header') { c.err(`Cloud config schema errors: format-l1.c1: File ${f} needs to begin with "#cloud-config"\n`); c.err('Error: Cloud config schema errors: format-l1.c1: File needs to begin with "#cloud-config"\n'); return 1; }
      if (r.kind === 'yaml') { c.err(`Error: Cloud config schema errors: format-l1.c1: File ${f} is not valid YAML. ${r.msg}\n`); return 1; }
      if (r.kind === 'schema') { c.err(`Error: Cloud config schema errors: ${r.errors.join(', ')}\n`); return 1; }
      c.out(`Valid schema ${f}\n`);
      return 0;
    }
    if (sub === 'query') {
      const key = args.filter((a) => !a.startsWith('-')).pop();
      const map = { instance_id: INSTANCE.id, 'instance-id': INSTANCE.id, region: INSTANCE.region, availability_zone: INSTANCE.az, cloud_name: 'aws', platform: 'ec2', local_hostname: sh.hostname || 'linux-school', 'ds.meta_data.instance-type': INSTANCE.type };
      if (key in map) { c.out(map[key] + '\n'); return 0; }
      if (args.includes('--all') || args.includes('-a') || key === 'query') { c.out(JSON.stringify({ cloud_name: 'aws', instance_id: INSTANCE.id, platform: 'ec2', region: INSTANCE.region, availability_zone: INSTANCE.az, local_hostname: sh.hostname || 'linux-school' }, null, 1) + '\n'); return 0; }
      c.err(`ERROR: Undefined jinja variable: "${key}". Jinja tried accessing ds.${key}\n`);
      return 1;
    }
    if (sub === 'clean') {
      if (sh.eu() !== 'root') { c.err('Error: This command must be run as root: sudo cloud-init clean\n'); return 1; }
      for (const p of ['/var/lib/cloud/instance', '/var/lib/cloud/instances', '/var/lib/cloud/data', '/run/cloud-init']) { try { sh.fs.rm ? sh.fs.rm(p) : null; } catch (e) { /* ignore */ } }
      if (args.includes('--logs') || args.includes('-l')) { const lg = sh.fs.lookup('/var/log/cloud-init.log'); if (lg) lg.content = ''; }
      c.out('');
      return 0;
    }
    c.err(`cloud-init: ${sub}: not available in the sandbox (try: status, schema, query, --version)\n`);
    return 1;
  });

  /* ---------- cloudlab: sandbox-only helper (boots a "new server" from cloud-config and flips metadata options) ---------- */
  def('cloudlab', async (c, args) => {
    const sh = c.sh;
    const sub = args[0];
    if (!sub || sub === '--help') { c.out('cloudlab (SANDBOX ONLY, not a real command)\n  cloudlab boot USER-DATA.yml [--host demo-server]   boot a fresh server from a cloud-config file\n  cloudlab imds v2-required|optional                 make this instance require IMDSv2 tokens (or not)\n  cloudlab imds status\n'); return 0; }
    if (sub === 'imds') {
      sh.imds = sh.imds || { tokens: new Set(), v2: false };
      if (args[1] === 'v2-required') sh.imds.v2 = true;
      else if (args[1] === 'optional') sh.imds.v2 = false;
      c.out(`HttpTokens: ${sh.imds.v2 ? 'required (IMDSv2 only)' : 'optional (IMDSv1 and IMDSv2)'}\n`);
      return 0;
    }
    if (sub !== 'boot') { c.err(`cloudlab: unknown subcommand ${sub}\n`); return 1; }
    const file = args[1];
    const hi = args.indexOf('--host');
    const host = hi >= 0 ? args[hi + 1] : 'demo-server';
    if (!file) { c.err('usage: cloudlab boot USER-DATA.yml [--host demo-server]\n'); return 1; }
    const n = sh.fs.lookup(c.abs(file));
    if (!n) { c.err(`cloudlab: ${file}: No such file or directory\n`); return 1; }
    const r = validateCloudConfig(sh.readFile(c.abs(file)));
    const stamp = () => strftime('%a, %d %b %Y %T +0000');
    if (r.kind === 'header') { c.out('[    0.000000] cloud-init[411]: Unhandled non-multipart (text/x-not-multipart) userdata: \'b\'#!/bin/bash...\'\n(the file does not start with #cloud-config: treated as a plain script)\n'); }
    else if (r.kind === 'yaml') { c.out(`[    4.120000] cloud-init[411]: WARNING: Failed loading yaml blob. ${r.msg}\n[    4.121000] cloud-init[411]: the user-data was ignored: the server boots with defaults\n`); return 1; }
    else if (r.kind === 'schema') c.out(`[    4.120000] cloud-init[411]: WARNING: Invalid cloud-config provided: ${r.errors.join('; ')}\n`);
    const doc = r.doc || {};
    const T = LX.hostShell(sh, host === 'demo-server' ? 'demo-server' : host);
    const prev = { user: T.user, eu: T._eu, cwd: T.cwd };
    T.user = 'root';
    T._eu = null;
    T.cwd = '/root';
    const log = [];
    const L = (t) => { log.push(t); c.out(t + '\n'); };
    const run = async (cmd) => {
      let out2 = '';
      const st = await T.runSource(cmd, { stdin: '', stdout: (x) => (out2 += x), stderr: (x) => (out2 += x), tty: false });
      return [st, out2];
    };
    try {
      L(`Cloud-init v. 24.1.3-0ubuntu3 running 'init-local' at ${stamp()}. Up 3.20 seconds.`);
      L('Cloud-init v. 24.1.3-0ubuntu3 running \'init\': datasource DataSourceEc2Local found');
      const hn = doc.hostname || (doc.fqdn ? String(doc.fqdn).split('.')[0] : null);
      if (hn) { await run(`hostnamectl set-hostname ${hn}; echo ${hn} > /etc/hostname`); T.hostname = hn; L(`  [config] set_hostname: ${hn}`); }
      // users
      const users = Array.isArray(doc.users) ? doc.users : [];
      const toCreate = users.map((u) => (typeof u === 'string' ? { name: u } : u));
      if (doc.ssh_authorized_keys && !users.length) toCreate.push({ name: 'ubuntu', default: true, ssh_authorized_keys: doc.ssh_authorized_keys, sudo: 'ALL=(ALL) NOPASSWD:ALL', shell: '/bin/bash' });
      for (const u of toCreate) {
        if (u.name === 'default' || (!u.name && u === 'default')) { toCreate.push({ name: 'ubuntu', sudo: 'ALL=(ALL) NOPASSWD:ALL', shell: '/bin/bash', ssh_authorized_keys: u.ssh_authorized_keys }); continue; }
        if (!u.name) continue;
        const groups = [].concat(u.groups || []).join(',') || (u.sudo ? 'sudo' : '');
        const [st, out2] = await run(`id ${u.name} >/dev/null 2>&1 || useradd -m -s ${u.shell || '/bin/bash'} ${groups ? '-G ' + groups : ''} ${u.name}`);
        L(`  [users] ${u.name}: ${st ? 'FAILED ' + out2.trim() : 'created'}`);
        if (u.sudo) { const rule = [].concat(u.sudo)[0]; await run(`mkdir -p /etc/sudoers.d; echo '${u.name} ${rule}' > /etc/sudoers.d/90-cloud-init-users; chmod 440 /etc/sudoers.d/90-cloud-init-users`); }
        const keys = [].concat(u.ssh_authorized_keys || []);
        if (keys.length) {
          await run(`mkdir -p /home/${u.name}/.ssh; chmod 700 /home/${u.name}/.ssh`);
          T.writeFile(`/home/${u.name}/.ssh/authorized_keys`, keys.join('\n') + '\n', false);
          await run(`chmod 600 /home/${u.name}/.ssh/authorized_keys; chown -R ${u.name}:${u.name} /home/${u.name}/.ssh`);
          L(`  [ssh] ${keys.length} key(s) installed for ${u.name}`);
        }
      }
      // write_files
      for (const w of doc.write_files || []) {
        if (!w.path) continue;
        const dir = VFS.dirname(w.path);
        await run(`mkdir -p ${dir}`);
        let content = w.content === undefined ? '' : String(w.content);
        if (w.encoding === 'b64' || w.encoding === 'base64') { try { content = decodeURIComponent(escape(atob(content))); } catch (e) { /* keep as is */ } }
        T.writeFile(w.path, content, w.append === true);
        if (w.permissions) await run(`chmod ${String(w.permissions).replace(/^0o/, '')} ${w.path}`);
        if (w.owner) await run(`chown ${w.owner} ${w.path}`);
        L(`  [write_files] ${w.path}${w.permissions ? ' (' + w.permissions + ')' : ''}`);
      }
      L(`Cloud-init v. 24.1.3-0ubuntu3 running 'modules:config' at ${stamp()}. Up 11.40 seconds.`);
      if (doc.timezone) { await run(`timedatectl set-timezone ${doc.timezone}`); L(`  [timezone] ${doc.timezone}`); }
      // packages
      if (doc.package_update || doc.package_upgrade || (doc.packages || []).length) {
        if (doc.package_update || (doc.packages || []).length) { await run('apt-get update'); L('  [apt] package index updated'); }
        if (doc.package_upgrade) { await run('apt-get upgrade -y'); L('  [apt] packages upgraded'); }
        for (const p of doc.packages || []) {
          const pk = Array.isArray(p) ? p[0] : p;
          const [st, out2] = await run(`apt-get install -y ${pk}`);
          L(`  [apt] install ${pk}: ${st ? 'FAILED (' + out2.trim().split('\n').pop() + ')' : 'ok'}`);
        }
      }
      L(`Cloud-init v. 24.1.3-0ubuntu3 running 'modules:final' at ${stamp()}. Up 24.90 seconds.`);
      const cmds = [].concat(doc.runcmd || []);
      for (const cm of cmds) {
        const line = Array.isArray(cm) ? cm.map((x) => (/^[\w@%+=:,./-]+$/.test(x) ? x : "'" + String(x).replace(/'/g, "'\\''") + "'")).join(' ') : String(cm);
        const [st, out2] = await run(line);
        L(`  [runcmd] ${line} -> ${st ? 'exit ' + st + (out2.trim() ? ': ' + out2.trim().split('\n').pop() : '') : 'ok'}`);
      }
      const fm = doc.final_message ? String(doc.final_message).replace('$UPTIME', '39.8').replace('$TIMESTAMP', stamp()) : `Cloud-init v. 24.1.3-0ubuntu3 finished at ${stamp()}. Datasource DataSourceEc2Local.  Up 39.80 seconds`;
      L(fm);
      c.out(`\nThe new server is "${host}". Log in with: ssh ${doc.users && doc.users[0] && doc.users[0].name ? doc.users[0].name : 'ubuntu'}@${host}\n`);
      T.writeFile('/var/lib/cloud/instance/user-data.txt', sh.readFile(c.abs(file)), false);
    } finally {
      T.user = prev.user;
      T._eu = prev.eu;
      T.cwd = prev.cwd;
    }
    return 0;
  });

  /* ---------- qemu-img and a tiny virsh ---------- */
  const parseSize = (s) => { const m = /^(\d+(?:\.\d+)?)([kKmMgGtT]?)/.exec(s || ''); if (!m) return 0; return Math.round(+m[1] * ({ '': 1, k: 1024, m: 1048576, g: 1073741824, t: 1099511627776 }[m[2].toLowerCase()])); };
  const human = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(b % 1073741824 ? 1 : 0) + ' GiB' : b >= 1048576 ? (b / 1048576).toFixed(b % 1048576 ? 1 : 0) + ' MiB' : b >= 1024 ? (b / 1024).toFixed(0) + ' KiB' : b + ' B');
  def('qemu-img', async (c, args) => {
    const sh = c.sh;
    const sub = args[0];
    const rest = args.slice(1);
    const fmtI = rest.indexOf('-f');
    const fmt = fmtI >= 0 ? rest[fmtI + 1] : null;
    const pos = rest.filter((a, i) => !a.startsWith('-') && rest[i - 1] !== '-f' && rest[i - 1] !== '-O');
    if (sub === 'create') {
      const [file, size] = pos;
      if (!file || !size) { c.err('qemu-img: Expecting image file name and size\n'); return 1; }
      const vs = parseSize(size);
      if (!vs) { c.err(`qemu-img: Invalid image size specified: ${size}\n`); return 1; }
      const f = fmt || 'raw';
      try { sh.writeFile(c.abs(file), '', false); } catch (e) { c.err(`qemu-img: ${file}: Could not open: ${U.errTxt(e)}\n`); return 1; }
      const nd = sh.fs.lookup(c.abs(file));
      nd.bin = true;
      nd.disk = { format: f, vsize: vs, used: f === 'qcow2' ? 196608 : 0 };
      nd.size = nd.disk.used;
      c.out(`Formatting '${file}', fmt=${f} cluster_size=65536 extended_l2=off compression_type=zlib size=${vs} lazy_refcounts=off refcount_bits=16\n`);
      return 0;
    }
    if (sub === 'info') {
      const file = pos[0];
      const n = file && sh.fs.lookup(c.abs(file));
      if (!n || !n.disk) { c.err(`qemu-img: Could not open '${file}': ${n ? 'Image is not in a known format' : 'No such file or directory'}\n`); return 1; }
      const d = n.disk;
      c.out(`image: ${file}\nfile format: ${d.format}\nvirtual size: ${human(d.vsize)} (${d.vsize} bytes)\ndisk size: ${human(d.used)}\n${d.format === 'qcow2' ? 'cluster_size: 65536\nFormat specific information:\n    compat: 1.1\n    compression type: zlib\n    lazy refcounts: false\n    refcount bits: 16\n    corrupt: false\n    extended l2: false\n' : ''}`);
      return 0;
    }
    if (sub === 'resize') {
      const [file, delta] = pos;
      const n = file && sh.fs.lookup(c.abs(file));
      if (!n || !n.disk) { c.err(`qemu-img: Could not open '${file}'\n`); return 1; }
      const nv = /^[+-]/.test(delta) ? n.disk.vsize + (delta[0] === '-' ? -1 : 1) * parseSize(delta.slice(1)) : parseSize(delta);
      n.disk.vsize = nv;
      c.out(`Image resized.\n`);
      return 0;
    }
    if (sub === 'convert') {
      const oi = rest.indexOf('-O');
      const out = oi >= 0 ? rest[oi + 1] : 'raw';
      const [src, dst] = pos;
      const n = src && sh.fs.lookup(c.abs(src));
      if (!n || !n.disk) { c.err(`qemu-img: Could not open '${src}'\n`); return 1; }
      sh.writeFile(c.abs(dst), '', false);
      const nd = sh.fs.lookup(c.abs(dst));
      nd.bin = true;
      nd.disk = { format: out, vsize: n.disk.vsize, used: out === 'qcow2' ? Math.max(196608, n.disk.used) : n.disk.vsize };
      nd.size = nd.disk.used;
      return 0;
    }
    c.err(`qemu-img: Command not found: ${sub || ''}\n`);
    return 1;
  }, { pkg: 'qemu-utils' });

  const VM = (sh) => sh.virsh || (sh.virsh = { doms: [{ id: 1, name: 'web-vm', state: 'running', mem: 2097152, cpus: 2, autostart: true, os: 'hvm' }, { id: null, name: 'test-vm', state: 'shut off', mem: 1048576, cpus: 1, autostart: false, os: 'hvm' }], nextId: 2 });
  def('virsh', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root' && !sh.groupsOf(sh.eu()).includes('libvirt') && !args.includes('-c') ) {
      c.err('error: failed to connect to the hypervisor\nerror: Failed to connect socket to \'/var/run/libvirt/libvirt-sock\': Permission denied\n');
      return 1;
    }
    const v = VM(sh);
    const pos = args.filter((a) => !a.startsWith('-'));
    const sub = pos[0];
    const dom = () => v.doms.find((d) => d.name === pos[1] || String(d.id) === pos[1]);
    const nf = () => { c.err(`error: failed to get domain '${pos[1]}'\n`); return 1; };
    if (sub === 'list') {
      const all = args.includes('--all') || args.includes('-a');
      const rows = v.doms.filter((d) => all || d.state === 'running');
      c.out(' Id   Name       State\n------------------------------\n' + rows.map((d) => ` ${String(d.id === null ? '-' : d.id).padEnd(4)} ${d.name.padEnd(10)} ${d.state}\n`).join(''));
      return 0;
    }
    if (sub === 'version') { c.out('Compiled against library: libvirt 10.0.0\nUsing library: libvirt 10.0.0\nUsing API: QEMU 10.0.0\nRunning hypervisor: QEMU 8.2.2\n'); return 0; }
    if (sub === 'net-list') { c.out(' Name      State    Autostart   Persistent\n--------------------------------------------\n default   active   yes         yes\n'); return 0; }
    if (sub === 'pool-list') { c.out(' Name      State    Autostart\n-------------------------------\n default   active   yes\n'); return 0; }
    if (sub === 'nodeinfo') { c.out('CPU model:           x86_64\nCPU(s):              2\nMemory size:         2035472 KiB\n'); return 0; }
    const d = dom();
    if (['start', 'shutdown', 'destroy', 'reboot', 'suspend', 'resume', 'dominfo', 'domstate', 'autostart', 'undefine'].includes(sub)) {
      if (!d) return nf();
      if (sub === 'start') { if (d.state === 'running') { c.err(`error: Failed to start domain '${d.name}'\nerror: Requested operation is not valid: domain is already running\n`); return 1; } d.state = 'running'; d.id = v.nextId++; c.out(`Domain '${d.name}' started\n`); return 0; }
      if (sub === 'shutdown') { if (d.state !== 'running') { c.err(`error: Failed to shutdown domain '${d.name}'\nerror: Requested operation is not valid: domain is not running\n`); return 1; } d.state = 'shut off'; d.id = null; c.out(`Domain '${d.name}' is being shutdown\n`); return 0; }
      if (sub === 'destroy') { if (d.state !== 'running') { c.err(`error: Failed to destroy domain '${d.name}'\nerror: Requested operation is not valid: domain is not running\n`); return 1; } d.state = 'shut off'; d.id = null; c.out(`Domain '${d.name}' destroyed\n`); return 0; }
      if (sub === 'reboot') { c.out(`Domain '${d.name}' is being rebooted\n`); return 0; }
      if (sub === 'suspend') { d.state = 'paused'; c.out(`Domain '${d.name}' suspended\n`); return 0; }
      if (sub === 'resume') { d.state = 'running'; c.out(`Domain '${d.name}' resumed\n`); return 0; }
      if (sub === 'domstate') { c.out(d.state + '\n'); return 0; }
      if (sub === 'autostart') { d.autostart = !args.includes('--disable'); c.out(d.autostart ? `Domain '${d.name}' marked as autostarted\n` : `Domain '${d.name}' unmarked as autostarted\n`); return 0; }
      if (sub === 'undefine') { v.doms.splice(v.doms.indexOf(d), 1); c.out(`Domain '${d.name}' has been undefined\n`); return 0; }
      c.out(`Id:             ${d.id === null ? '-' : d.id}\nName:           ${d.name}\nUUID:           ${'8f2c1b04-7a3d-4c5e-9b61-' + d.name.length.toString().padStart(12, '0')}\nOS Type:        ${d.os}\nState:          ${d.state}\nCPU(s):         ${d.cpus}\nMax memory:     ${d.mem} KiB\nUsed memory:    ${d.state === 'running' ? d.mem : 0} KiB\nPersistent:     yes\nAutostart:      ${d.autostart ? 'enable' : 'disable'}\nManaged save:   no\n`);
      return 0;
    }
    c.err(`error: unknown command: '${sub || ''}'\n`);
    return 1;
  }, { pkg: 'libvirt-clients' });

  def('virt-install', async (c, args) => {
    const sh = c.sh;
    if (sh.eu() !== 'root') { c.err('ERROR    Could not access the hypervisor: Permission denied (run as root or join the libvirt group)\n'); return 1; }
    const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
    const name = get('--name');
    if (!name) { c.err('ERROR    --name is required\n'); return 1; }
    const v = VM(sh);
    if (v.doms.some((d) => d.name === name)) { c.err(`ERROR    Guest name '${name}' is already in use.\n`); return 1; }
    const mem = +get('--memory') || 1024;
    const cpus = +get('--vcpus') || 1;
    c.out(`\nStarting install...\nCreating domain...                                          |         00:00     \nDomain creation completed.\nYou can restart your domain by running:\n  virsh --connect qemu:///system start ${name}\n`);
    v.doms.push({ id: v.nextId++, name, state: 'running', mem: mem * 1024, cpus, autostart: false, os: 'hvm' });
    return 0;
  }, { pkg: 'virtinst' });

  Object.assign(LX.PKGS, {
    'qemu-utils': { ver: '1:8.2.2+ds-0ubuntu1.4', desc: 'QEMU utilities (qemu-img)', size: 8200, bins: ['qemu-img'] },
    'libvirt-clients': { ver: '10.0.0-2ubuntu8.3', desc: 'Programs for the libvirt library (virsh)', size: 1900, bins: ['virsh'] },
    virtinst: { ver: '1:4.1.0-3', desc: 'Programs to create and clone virtual machines (virt-install)', size: 700, bins: ['virt-install'] },
    'virt-what': { ver: '1.25-1ubuntu1', desc: 'detect if we are running in a virtual machine', size: 40, bins: ['virt-what'] },
  });
  // cloud-init ships with cloud images
  if (LX.DEFAULT_PKGS && !LX.DEFAULT_PKGS.includes('cloud-init')) LX.DEFAULT_PKGS.push('cloud-init', 'cloud-guest-utils');
})();
