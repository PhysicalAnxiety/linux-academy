(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, JOB, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  const L1 = ['sudo pvcreate /dev/sdb', 'sudo vgcreate vg0 /dev/sdb', 'sudo lvcreate -L 3G -n lvdata vg0', 'sudo mkfs.ext4 /dev/vg0/lvdata', 'sudo mkdir -p /srv/data', 'sudo mount /dev/vg0/lvdata /srv/data'];
  const L2 = L1.concat(['sudo lvextend -L +2G -r /dev/vg0/lvdata']);

  LX.topics.push({
    id: 'lvm',
    part: 2,
    no: 21,
    key: 'lvm',
    mins: 45,
    title: T('LVM, RAID and Swap', 'LVM, RAID aur Swap'),
    blurb: T('Disks that grow while the server runs (LVM), disks that survive a failure (RAID) and the emergency room for memory (swap).', 'Disks jo server chalte hue badhti hain (LVM), disks jo kharabi se bachti hain (RAID) aur memory ka emergency room (swap).'),
    blocks: [
      BIG(
        'A plain partition is a fixed box: when it fills up, you are in trouble. **LVM** (Logical Volume Manager) puts a flexible layer between disks and filesystems, so you can **grow a volume while it is mounted and in use**. **RAID** joins several disks so that one can die without losing data. **Swap** is disk space the system borrows when RAM is full. These three are everyday tools on real servers and big topics in RHCSA.',
        'Normal partition ek fixed dabba hai: bhar jaye to museebat. **LVM** (Logical Volume Manager) disks aur filesystems ke beech ek lachili layer daalta hai, jisse tum **volume ko mounted aur use mein hote hue badha sakte ho**. **RAID** kai disks ko jodta hai taaki ek mar jaye to data na jaye. **Swap** wo disk space hai jo RAM bharne par system udhaar leta hai. Ye teen asli servers par roz ke tools hain aur RHCSA ke bade topics.'
      ),
      STORY('Think of water. Barrels (physical volumes, PV) are poured into one big tank (volume group, VG). From the tank you fill buckets of any size (logical volumes, LV). Need a bigger bucket tomorrow? Take more water from the tank. Tank running low? Bring one more barrel and pour it in. The buckets and barrels never have to be the same size.', 'Paani socho. Barrels (physical volumes, PV) ek bade tank (volume group, VG) mein daale jate hain. Tank se kisi bhi size ki balti (logical volume, LV) bharte ho. Kal badi balti chahiye? Tank se aur paani lo. Tank kam pad raha hai? Ek aur barrel laakar daal do. Baltiyon aur barrels ka same size hona zaroori nahi.'),
      PRE(`   disks / partitions        volume group            logical volumes        filesystems
   ┌───────────┐
   │ /dev/sdb  │── PV ─┐
   └───────────┘       │      ┌───────────────┐      ┌─ lvdata (3G) ── ext4 ── /srv/data
   ┌───────────┐       ├─────▶│  vg0  (15 G)  │─────▶┤
   │ /dev/sdc  │── PV ─┘      └───────────────┘      └─ lvlogs (2G) ── xfs  ── /var/log/app
   └───────────┘                  free: 10 G                  (can grow any time)`),
      H('Build the stack (PV, VG, LV)', 'Stack banao (PV, VG, LV)'),
      STEPS([
        ['`pvcreate DISK`: mark a disk or partition as an LVM Physical Volume.', '`pvcreate DISK`: disk ya partition ko LVM Physical Volume ke roop mein mark karo.'],
        ['`vgcreate NAME PV...`: pour PVs into a new Volume Group.', '`vgcreate NAME PV...`: PVs ko naye Volume Group mein daalo.'],
        ['`lvcreate -L SIZE -n NAME VG`: carve a Logical Volume out of the group.', '`lvcreate -L SIZE -n NAME VG`: group mein se Logical Volume kaato.'],
        ['`mkfs` and `mount` the LV like any disk: /dev/VG/LV.', 'LV par `mkfs` aur `mount` kisi bhi disk ki tarah: /dev/VG/LV.'],
      ]),
      CMD(['sudo pvcreate /dev/sdb', 'sudo vgcreate vg0 /dev/sdb', 'sudo lvcreate -L 3G -n lvdata vg0', 'sudo mkfs.ext4 /dev/vg0/lvdata', 'sudo mkdir -p /srv/data', 'sudo mount /dev/vg0/lvdata /srv/data', 'df -h /srv/data'], 'Five commands from a bare disk to a mounted 3 GB volume.', 'Khaali disk se mounted 3 GB volume tak paanch commands.'),
      CMD(['sudo pvs', 'sudo vgs', 'sudo lvs'], 'Three short report commands: pvs, vgs, lvs. Look at VFree: that is the free water in the tank.', 'Teen chhoti report commands: pvs, vgs, lvs. VFree dekho: ye tank ka free paani hai.'),
      CMD(['sudo lvdisplay /dev/vg0/lvdata | head -n 8', 'ls -l /dev/vg0 /dev/mapper'], 'The long versions (pvdisplay, vgdisplay, lvdisplay) show every detail. The volume appears twice: /dev/vg0/lvdata and /dev/mapper/vg0-lvdata are the same thing.', 'Lambe versions (pvdisplay, vgdisplay, lvdisplay) har detail dikhate hain. Volume do jagah dikhta hai: /dev/vg0/lvdata aur /dev/mapper/vg0-lvdata ek hi cheez hain.'),
      H('Grow while running: the superpower', 'Chalte hue badhao: asli taakat'),
      P('The disk is nearly full. With LVM you give the volume more space in ONE command. The **-r** flag also grows the filesystem inside (without it you must resize the filesystem yourself).', 'Disk lagbhag full hai. LVM ke saath volume ko ek hi command mein aur space dete ho. **-r** flag andar ka filesystem bhi badhata hai (iske bina filesystem khud resize karna padta hai).'),
      CMD(['sudo lvextend -L +2G -r /dev/vg0/lvdata', 'df -h /srv/data'], 'From 3 GB to 5 GB with the volume mounted, no downtime, nobody noticed. This is why LVM is loved.', 'Mounted volume ke saath 3 GB se 5 GB, bina downtime, kisi ko pata nahi chala. Isi liye LVM pasand kiya jata hai.'),
      TABLE(
        [
          ['lvextend -L +2G -r LV', 'grow by 2 GB and grow the filesystem', '2 GB badhao aur filesystem bhi badhao'],
          ['lvextend -l +100%FREE -r LV', 'use ALL the remaining free space', 'bacha hua SAARA free space use karo'],
          ['resize2fs LV  /  xfs_growfs MOUNTPOINT', 'grow the filesystem by hand: ext4 uses resize2fs, xfs uses xfs_growfs on the mount point', 'filesystem haath se badhao: ext4 resize2fs, xfs mount point par xfs_growfs'],
          ['vgextend vg0 /dev/sdd', 'add a new disk to the group when the tank is empty (pvcreate is done for you)', 'tank khaali ho to group mein nayi disk jodo'],
        ],
        'Growing',
        'Badhana'
      ),
      CMD(['sudo vgextend vg0 /dev/sdd', 'sudo vgs', 'sudo lvextend -l +100%FREE -r /dev/vg0/lvdata', 'df -h /srv/data'], 'Out of water in the tank? Add a new disk to the group, then use all the free space.', 'Tank mein paani khatam? Group mein nayi disk jodo, phir saara free space use karo.'),
      WARN('Growing is easy and safe. SHRINKING is dangerous: xfs cannot shrink at all, and for ext4 you must shrink the FILESYSTEM first and the volume second. Doing it in the wrong order (lvreduce first) destroys data. The saying is "grow with confidence, shrink with a backup".', 'Badhana aasaan aur safe hai. GHATANA khatarnaak hai: xfs ghat hi nahi sakta, aur ext4 mein pehle FILESYSTEM ghatao phir volume. Galat order (pehle lvreduce) data tabah karta hai. Kehawat hai "bharose se badhao, backup ke saath ghatao".'),
      CMD(['sudo umount /srv/data', 'echo y | sudo lvreduce -L 1G vg0/lvdata', 'sudo mount /dev/vg0/lvdata /srv/data'], 'The mistake on purpose: the volume was cut below the filesystem size, so the filesystem can no longer be mounted. (A fresh start with the Reset sandbox button repairs it for the next exercises.)', 'Jaanbujhkar galti: volume filesystem ke size se neeche kaat diya gaya, isliye filesystem ab mount nahi ho sakta. (Agle exercises ke liye Reset sandbox button naya shuru kar deta hai.)'),
      H('Snapshots: freeze a moment in time', 'Snapshots: ek pal ko jama do'),
      P('An LVM snapshot is a frozen, read-only-ish copy of a volume at one moment. Great before an upgrade or a risky change, or to take a consistent backup of a busy volume. If something goes wrong you still have the old state.', 'LVM snapshot ek pal par volume ki jami hui copy hai. Upgrade ya risky badlav se pehle, ya busy volume ka consistent backup lene ke liye bahut achha. Kuch galat ho to purani halat tumhare paas hai.'),
      CMD(['sudo lvcreate -s -n snap1 -L 1G /dev/vg0/lvdata', 'sudo lvs'], '-s makes a snapshot. The Origin column shows what it belongs to. (Re-create the volume first if you shrank it above.)', '-s snapshot banata hai. Origin column dikhata hai ki ye kiski hai. (Upar ghatane ke baad pehle volume dobara banao.)'),
      H('RAID: do disks are safer than one', 'RAID: do disks ek se zyada safe'),
      TABLE(
        [
          ['RAID 0', 'striping: fast, uses all space, but ONE dead disk loses EVERYTHING. Not redundancy!', 'striping: tez, saara space, par EK disk marne par SAB KUCH jata hai. Redundancy nahi!'],
          ['RAID 1', 'mirror: two copies of everything. Survives 1 failure. Half the space usable. Min 2 disks.', 'mirror: sab kuch ki do copies. 1 failure sah leta hai. Aadha space. Kam se kam 2 disks.'],
          ['RAID 5', 'striping with parity: survives 1 failure, (N-1) disks of space. Min 3 disks.', 'parity ke saath striping: 1 failure sah leta hai, (N-1) disks ka space. Kam se kam 3 disks.'],
          ['RAID 6', 'two parities: survives 2 failures. Min 4 disks.', 'do parity: 2 failures sah leta hai. Kam se kam 4 disks.'],
          ['RAID 10', 'mirrors of stripes: fast AND safe, half the space. Min 4 disks. Popular for databases.', 'stripes ke mirror: tez AUR safe, aadha space. Kam se kam 4 disks. Databases ke liye popular.'],
        ],
        'Level',
        'Level'
      ),
      FUN('The big rule: **RAID is not a backup.** It protects against a dead disk, not against you typing `rm -rf`, a virus, a fire, or a corrupted file that is faithfully copied to both disks. You need backups too (a later lesson).', 'Bada niyam: **RAID backup nahi hai.** Ye marti disk se bachata hai, tumhare `rm -rf` type karne, virus, aag, ya kharab file se nahi jo dono disks par imaandari se copy ho jati hai. Backups bhi chahiye (aage ka lesson).'),
      CMD(['sudo apt install -y mdadm', 'sudo mdadm --create /dev/md0 --level=1 --raid-devices=2 /dev/sdc /dev/sdd', 'cat /proc/mdstat', 'sudo mdadm --detail /dev/md0'], 'mdadm manages Linux software RAID. /proc/mdstat is the quick status board: [UU] means both disks are Up.', 'mdadm Linux software RAID sambhalta hai. /proc/mdstat quick status board hai: [UU] matlab dono disks Up hain.'),
      CMD(['sudo mkfs.ext4 /dev/md0', 'sudo mdadm /dev/md0 --fail /dev/sdd', 'cat /proc/mdstat', 'sudo mdadm /dev/md0 --remove /dev/sdd', 'sudo mdadm /dev/md0 --add /dev/sdd', 'sudo mdadm --detail --scan'], 'A disk dies: mark it failed, remove it, add the replacement. [U_] means degraded: the array still works but has no redundancy until it rebuilds. The scan line is what you save in /etc/mdadm/mdadm.conf so the array assembles at boot.', 'Ek disk marti hai: failed mark karo, hatao, replacement jodo. [U_] matlab degraded: array chalta hai par rebuild hone tak redundancy nahi. Scan line wahi hai jo /etc/mdadm/mdadm.conf mein save karte ho taaki array boot par assemble ho.'),
      JOB('Monitoring RAID is part of the job: a degraded array nobody noticed turns into a data-loss story when the second disk dies. Check `cat /proc/mdstat` or set up mail alerts. In the cloud you mostly use managed disks instead, but on physical servers RAID is everywhere.', 'RAID monitor karna kaam ka hissa hai: kisi ne dhyan nahi diya degraded array doosri disk marne par data-loss ki kahani ban jata hai. `cat /proc/mdstat` check karo ya mail alerts lagao. Cloud mein zyadatar managed disks use hote hain, par physical servers par RAID har jagah hai.'),
      H('Swap: the memory emergency room', 'Swap: memory ka emergency room'),
      P('When RAM fills up, the kernel can move rarely-used memory pages out to **swap** space on disk to make room. Disk is thousands of times slower than RAM, so swap is a safety net, not a way to add speed. Without swap, a memory spike makes the **OOM killer** kill programs.', 'RAM bharne par kernel kam use hone wale memory pages ko disk par **swap** space mein bhej deta hai. Disk RAM se hazaaron guna dheemi hai, isliye swap safety net hai, speed badhane ka tareeka nahi. Swap ke bina memory spike par **OOM killer** programs ko maar deta hai.'),
      CMD(['free -h', 'swapon --show', 'cat /proc/swaps'], 'See how much swap exists and how much is used.', 'Dekho kitna swap hai aur kitna use ho raha hai.'),
      STEPS([
        ['`sudo fallocate -l 1G /swapfile`: make a 1 GB file.', '`sudo fallocate -l 1G /swapfile`: 1 GB ki file banao.'],
        ['`sudo chmod 600 /swapfile`: ONLY root may read it (swap can contain passwords!).', '`sudo chmod 600 /swapfile`: ise SIRF root padh sake (swap mein passwords ho sakte hain!).'],
        ['`sudo mkswap /swapfile`: format it as swap.', '`sudo mkswap /swapfile`: ise swap ke roop mein format karo.'],
        ['`sudo swapon /swapfile`: switch it on now.', '`sudo swapon /swapfile`: ise abhi chalu karo.'],
        ['Add `/swapfile none swap sw 0 0` to /etc/fstab so it survives a reboot.', 'Reboot ke baad bhi rakhne ke liye /etc/fstab mein `/swapfile none swap sw 0 0` jodo.'],
      ]),
      CMD(['sudo fallocate -l 1G /swapfile', 'sudo chmod 600 /swapfile', 'sudo mkswap /swapfile', 'sudo swapon /swapfile', 'echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab', 'swapon --show', 'free -h'], 'The whole recipe. A swap PARTITION works the same way: mkswap and swapon on /dev/sdX instead of a file.', 'Poori recipe. Swap PARTITION bhi aise hi chalta hai: file ki jagah /dev/sdX par mkswap aur swapon.'),
      CMD(['sysctl vm.swappiness', 'cat /proc/sys/vm/swappiness'], 'swappiness (0 to 100) says how eagerly the kernel uses swap; the default is 60. Database servers often lower it to 10. Change it for the session with `sudo sysctl vm.swappiness=10`, permanently in /etc/sysctl.d/.', 'swappiness (0 se 100) batata hai kernel swap ko kitni jaldi use kare; default 60. Database servers aksar ise 10 kar dete hain. Session ke liye `sudo sysctl vm.swappiness=10`, permanent ke liye /etc/sysctl.d/.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['pvcreate / vgcreate / lvcreate -L 3G -n lv vg', 'build the stack', 'stack banao'],
        ['pvs / vgs / lvs', 'quick reports', 'quick reports'],
        ['lvextend -L +2G -r /dev/vg/lv', 'grow online with the filesystem', 'filesystem ke saath online badhao'],
        ['vgextend vg /dev/sdX', 'add a disk to the group', 'group mein disk jodo'],
        ['lvcreate -s -n snap -L 1G /dev/vg/lv', 'snapshot', 'snapshot'],
        ['mdadm --create /dev/md0 --level=1 --raid-devices=2 A B', 'RAID 1', 'RAID 1'],
        ['cat /proc/mdstat / mdadm --detail /dev/md0', 'RAID health', 'RAID health'],
        ['fallocate; chmod 600; mkswap; swapon', 'swap file recipe', 'swap file recipe'],
      ]),
    ],
    missions: [
      M('lvm-m1', 'Build your first logical volume', 'Apna pehla logical volume banao', 'Turn the empty disk /dev/sdb into an LVM physical volume, create a volume group vg0, a 3 GB logical volume lvdata, format it ext4 and mount it on /srv/data.', 'Khaali disk /dev/sdb ko LVM physical volume banao, volume group vg0 banao, 3 GB ka logical volume lvdata banao, use ext4 mein format karo aur /srv/data par mount karo.', 'pvcreate, vgcreate, lvcreate, mkfs.ext4, mkdir -p, mount', 'pvcreate, vgcreate, lvcreate, mkfs.ext4, mkdir -p, mount', (sh) => { const vg = sh.vgs.vg0; const lv = vg && vg.lvs.lvdata; return !!lv && lv.fs === 'ext4' && sh.mounts.some((m) => m.dev === '/dev/vg0/lvdata' && m.target === '/srv/data'); }, L1),
      M('lvm-m2', 'Out of space? Grow it', 'Space khatam? Badhao', 'The volume is too small. Add 2 GB to lvdata while it stays mounted, growing the filesystem in the same command. (Do mission 1 first.)', 'Volume chhota pad gaya. lvdata mein 2 GB jodo jabki wo mounted rahe, aur usi command mein filesystem bhi badhao. (Pehle mission 1 karo.)', 'lvextend -L +2G -r /dev/vg0/lvdata', 'lvextend -L +2G -r /dev/vg0/lvdata', (sh) => { const vg = sh.vgs.vg0; const lv = vg && vg.lvs.lvdata; const row = sh.dfRows().find((r) => r.target === '/srv/data'); return !!lv && lv.size >= 5 * 1024 ** 3 && !!row && row.size > 4.5e9; }, L2),
      M('lvm-m3', 'Mirror two disks', 'Do disks ka mirror', 'Install mdadm and create the RAID 1 array /dev/md0 from the two 5 GB disks /dev/sdc and /dev/sdd.', 'mdadm install karo aur do 5 GB disks /dev/sdc aur /dev/sdd se RAID 1 array /dev/md0 banao.', 'sudo apt install -y mdadm, then mdadm --create /dev/md0 --level=1 --raid-devices=2 /dev/sdc /dev/sdd', 'sudo apt install -y mdadm, phir mdadm --create /dev/md0 --level=1 --raid-devices=2 /dev/sdc /dev/sdd', (sh) => !!(sh.md && sh.md['/dev/md0'] && sh.md['/dev/md0'].raid.level === '1' && sh.md['/dev/md0'].raid.members.length === 2), ['sudo apt install -y mdadm', 'sudo mdadm --create /dev/md0 --level=1 --raid-devices=2 /dev/sdc /dev/sdd']),
      M('lvm-m4', 'Give memory a safety net', 'Memory ko safety net do', 'Create a 1 GB swap file /swapfile (permission 600), switch it on and make it permanent with a line in /etc/fstab.', '1 GB ka swap file /swapfile banao (permission 600), use chalu karo aur /etc/fstab ki line se permanent karo.', 'fallocate, chmod 600, mkswap, swapon, then tee -a /etc/fstab', 'fallocate, chmod 600, mkswap, swapon, phir tee -a /etc/fstab', (sh) => sh.swaps.some((s) => s.file === '/swapfile') && /^\/swapfile\s+none\s+swap\s+sw/m.test(LX.cat(sh, '/etc/fstab')) && (sh.fs.lookup('/swapfile').mode & 0o777) === 0o600, ['sudo fallocate -l 1G /swapfile', 'sudo chmod 600 /swapfile', 'sudo mkswap /swapfile', 'sudo swapon /swapfile', 'echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab']),
    ],
    quiz: [
      mcq(1, 'In LVM, what does "VG" stand for?', 'LVM mein "VG" ka matlab?', ['Virtual Gateway', 'Volume Group', 'Video Graphics', 'Very Good'], 1, 'PV (physical volumes) are pooled into a VG (volume group); LVs are carved from it.', 'PV (physical volumes) VG (volume group) mein jama hote hain; LVs usme se kate jate hain.'),
      mcq(2, 'What is the correct order to build LVM?', 'LVM banane ka sahi order kya hai?', ['lvcreate, vgcreate, pvcreate', 'pvcreate, vgcreate, lvcreate', 'vgcreate, pvcreate, lvcreate', 'mkfs, lvcreate, vgcreate'], 1, 'Disk to PV, PVs to VG, then LVs.', 'Disk se PV, PVs se VG, phir LVs.'),
      cmd(3, 'Show a short report of the volume groups.', 'Volume groups ki chhoti report dikhao.', { setup: ['sudo pvcreate /dev/sdb', 'sudo vgcreate vg0 /dev/sdb'], verify: (sh, r) => /vg0\s+1\s+0/.test(r.out) && /VFree/.test(r.out), sample: 'sudo vgs', wrong: ['sudo vgdisplay'], hintEn: 'Three report commands: pvs, vgs, lvs.', hintHi: 'Teen report commands: pvs, vgs, lvs.' }, 'vgs is the short report for volume groups.', 'vgs volume groups ki chhoti report hai.'),
      cmd(4, 'In the existing volume group vg0, create a 2 GB logical volume called lvapp.', 'Maujood volume group vg0 mein lvapp naam ka 2 GB logical volume banao.', { setup: ['sudo pvcreate /dev/sdb', 'sudo vgcreate vg0 /dev/sdb'], verify: (sh) => { const lv = sh.vgs.vg0.lvs.lvapp; return !!lv && lv.size === 2 * 1024 ** 3; }, sample: 'sudo lvcreate -L 2G -n lvapp vg0', alt: ['sudo lvcreate --size 2G --name lvapp vg0'], wrong: ['sudo lvcreate -L 2G vg0'], hintEn: 'lvcreate -L size -n name vg', hintHi: 'lvcreate -L size -n name vg' }, '-L sets the size and -n the name.', '-L size set karta hai aur -n naam.'),
      mcq(5, 'You extended an LV but df still shows the old size. What did you most likely forget?', 'Tumne LV extend kiya par df abhi bhi purana size dikhata hai. Tum shayad kya bhool gaye?', ['To reboot', 'To grow the filesystem (use -r, resize2fs or xfs_growfs)', 'To run lvs', 'To create a new VG'], 1, 'The LV grew, but the filesystem inside still has the old size until you grow it.', 'LV badha, par andar ka filesystem tab tak purane size ka rehta hai jab tak use na badhao.'),
      cmd(6, 'Grow the mounted logical volume /dev/vg0/lvdata by 1 GB, including its filesystem, in one command.', 'Mounted logical volume /dev/vg0/lvdata ko 1 GB badhao, filesystem samet, ek hi command mein.', { setup: L1, verify: (sh) => sh.vgs.vg0.lvs.lvdata.size === 4 * 1024 ** 3 && sh.dfRows().find((r) => r.target === '/srv/data').size > 3.8e9, sample: 'sudo lvextend -L +1G -r /dev/vg0/lvdata', alt: ['sudo lvextend --size +1G --resizefs /dev/vg0/lvdata'], wrong: ['sudo lvextend -L +1G /dev/vg0/lvdata'], hintEn: 'lvextend with a plus size and the -r flag.', hintHi: 'lvextend, plus wala size aur -r flag.' }, '-r (resizefs) grows the filesystem together with the volume.', '-r (resizefs) volume ke saath filesystem bhi badhata hai.'),
      mcq(7, 'Which RAID level gives NO protection against a failed disk?', 'Kaunsa RAID level failed disk se KOI suraksha nahi deta?', ['RAID 1', 'RAID 5', 'RAID 0', 'RAID 6'], 2, 'RAID 0 stripes data over disks: faster, but losing one disk loses everything.', 'RAID 0 data ko disks par stripe karta hai: tez, par ek disk khone par sab kuch jata hai.'),
      cmd(8, 'Show the health of all software RAID arrays by reading the kernel status file.', 'Kernel status file padhkar saare software RAID arrays ki health dikhao.', { setup: ['sudo apt install -y mdadm', 'sudo mdadm --create /dev/md0 --level=1 --raid-devices=2 /dev/sdc /dev/sdd'], verify: (sh, r) => /md0 : active raid1/.test(r.out) && /\[UU\]/.test(r.out), sample: 'cat /proc/mdstat', wrong: ['cat /proc/mounts'], hintEn: 'A file in /proc with "md" and "stat".', hintHi: '/proc ki file jisme "md" aur "stat" ho.' }, '/proc/mdstat is the quick RAID dashboard; [UU] means healthy.', '/proc/mdstat quick RAID dashboard hai; [UU] matlab healthy.'),
      cmd(9, 'Create a 512 MB swap file at /swap2, secure it and turn it on, in a single line.', 'Ek line mein /swap2 par 512 MB ka swap file banao, use secure karo aur chalu karo.', { verify: (sh) => sh.swaps.some((s) => s.file === '/swap2') && (sh.fs.lookup('/swap2').mode & 0o777) === 0o600, sample: 'sudo fallocate -l 512M /swap2 && sudo chmod 600 /swap2 && sudo mkswap /swap2 && sudo swapon /swap2', alt: ['sudo fallocate -l 512M /swap2; sudo chmod 600 /swap2; sudo mkswap /swap2; sudo swapon /swap2'], wrong: ['sudo fallocate -l 512M /swap2'], hintEn: 'fallocate, chmod 600, mkswap, swapon, joined with &&.', hintHi: 'fallocate, chmod 600, mkswap, swapon, && se jude.' }, 'The four steps: create, secure, format, enable.', 'Chaar steps: banao, secure karo, format karo, chalu karo.'),
      cmd(10, 'Boss level: before a risky upgrade take a 1 GB snapshot called pre-upgrade of the mounted volume /dev/vg0/lvdata and show the logical volume list.', 'Boss level: risky upgrade se pehle mounted volume /dev/vg0/lvdata ka pre-upgrade naam ka 1 GB snapshot lo aur logical volume list dikhao.', { setup: L1, verify: (sh, r) => { const s = sh.vgs.vg0.lvs['pre-upgrade']; return !!s && s.snapOf === 'lvdata' && /pre-upgrade/.test(r.out) && /swi/.test(r.out); }, sample: 'sudo lvcreate -s -n pre-upgrade -L 1G /dev/vg0/lvdata && sudo lvs', alt: ['sudo lvcreate --snapshot --name pre-upgrade --size 1G /dev/vg0/lvdata; sudo lvs'], wrong: ['sudo lvcreate -L 1G -n pre-upgrade vg0'], hintEn: 'lvcreate -s (snapshot) with -n, -L and the origin volume path.', hintHi: 'lvcreate -s (snapshot), -n, -L aur origin volume ka path.' }, '-s turns lvcreate into a snapshot of an existing volume.', '-s lvcreate ko maujood volume ka snapshot banane wala bana deta hai.'),
    ],
  });
})();
