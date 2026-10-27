(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, JOB, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  const S1 = ['sudo parted -s /dev/sdb mklabel gpt mkpart primary ext4 1MiB 2GiB', 'sudo mkfs.ext4 -L datadisk /dev/sdb1'];
  const S2 = S1.concat(['sudo mkdir -p /mnt/data', 'sudo mount /dev/sdb1 /mnt/data', 'echo hello | sudo tee /mnt/data/hello.txt']);
  const S3 = S2.concat(['echo "UUID=$(sudo blkid -s UUID -o value /dev/sdb1) /mnt/data ext4 defaults 0 2" | sudo tee -a /etc/fstab', 'sudo mount -a']);

  LX.topics.push({
    id: 'disks',
    part: 2,
    no: 20,
    key: 'mount',
    mins: 45,
    title: T('Disks, Partitions and Filesystems', 'Disks, Partitions aur Filesystems'),
    blurb: T('Add a new disk to a server: partition it, format it, mount it and make it permanent in fstab. Then learn to find out where the space went when a disk fills up.', 'Server mein nayi disk jodo: partition karo, format karo, mount karo aur fstab mein permanent banao. Phir seekho ki disk bhar jaye to space kahan gaya ye kaise dhundte hain.'),
    blocks: [
      BIG(
        'A hard disk is just a long row of empty storage. To store files you need three steps: **partition** it (cut it into pieces), put a **filesystem** on a piece (the filing system that tracks where every file is) and **mount** it (connect it to a folder so you can use it). Adding disk space to a server is one of the first real tasks a junior admin gets, and both the RHCSA and Linux+ exams test it.',
        'Hard disk bas khaali storage ki lambi patti hai. Files rakhne ke liye teen steps chahiye: **partition** (tukdon mein kaato), ek tukde par **filesystem** (filing system jo yaad rakhta hai har file kahan hai) aur **mount** (use folder se jodo taaki use kar sako). Server mein disk space badhana junior admin ka pehla asli kaam hota hai, aur RHCSA aur Linux+ dono ise test karte hain.'
      ),
      STORY('Buying a new warehouse plot. First you mark the land into plots (partitions). Then in each plot you build shelving and a catalogue book (the filesystem: ext4 or xfs). Finally you build a door from the street to the plot (mount). A plot without shelving is useless, and shelving without a door is unreachable.', 'Naya warehouse plot khareedna. Pehle zameen ko plots (partitions) mein baantte ho. Phir har plot mein shelving aur catalogue book (filesystem: ext4 ya xfs) banate ho. Aakhir mein sadak se plot tak darwaza (mount) banate ho. Bina shelving ka plot bekaar hai, aur bina darwaze ki shelving pahunch ke bahar.'),
      JOB('This sandbox has a spare 10 GB disk /dev/sdb and two 5 GB disks /dev/sdc and /dev/sdd. They are empty, so you can practise partitioning without any danger. On a real server, always double-check the device name: partitioning the wrong disk destroys data.', 'Is sandbox mein ek spare 10 GB disk /dev/sdb aur do 5 GB disks /dev/sdc aur /dev/sdd hain. Ye khaali hain, isliye bina khatre ke partitioning practice kar sakte ho. Asli server par device naam hamesha double-check karo: galat disk partition karne se data tabah hota hai.'),
      H('Look first: what disks do I have?', 'Pehle dekho: mere paas kaun si disks hain?'),
      CMD(['lsblk', 'lsblk -f', 'sudo fdisk -l /dev/sdb'], 'lsblk draws a tree: disk, partitions, sizes, where they are mounted. -f adds filesystem type, label and UUID. fdisk -l prints the low-level details.', 'lsblk tree banata hai: disk, partitions, sizes, kahan mount hain. -f filesystem type, label aur UUID jodta hai. fdisk -l low-level details print karta hai.'),
      TABLE(
        [
          ['/dev/sda, /dev/sdb ...', 'SATA/SCSI/virtual disks. sda is the first, sdb the second.', 'SATA/SCSI/virtual disks. sda pehli, sdb doosri.'],
          ['/dev/sda1, /dev/sda2', 'partitions of sda (a number is added)', 'sda ke partitions (number jud jata hai)'],
          ['/dev/nvme0n1, /dev/nvme0n1p1', 'NVMe SSDs (note the p before the partition number)', 'NVMe SSDs (partition number se pehle p dhyan do)'],
          ['/dev/vda', 'disks inside KVM / cloud virtual machines', 'KVM / cloud virtual machines ki disks'],
          ['/dev/mapper/vg0-lvdata', 'LVM logical volumes (next lesson)', 'LVM logical volumes (agla lesson)'],
        ],
        'Name',
        'Naam'
      ),
      H('Step 1: partition', 'Step 1: partition'),
      P('The partition table is a small map at the start of the disk. There are two kinds: **MBR** (old, limit 2 TB and 4 main partitions) and **GPT** (modern, huge disks, up to 128 partitions). Use GPT for anything new.', 'Partition table disk ke shuru mein ek chhota naksha hai. Do tarah ki hoti hain: **MBR** (purani, 2 TB aur 4 main partitions ki limit) aur **GPT** (modern, bahut badi disks, 128 partitions tak). Kuch bhi naya ho to GPT use karo.'),
      CMD(['sudo parted -s /dev/sdb mklabel gpt mkpart primary ext4 1MiB 2GiB', 'sudo parted /dev/sdb print', 'lsblk /dev/sdb'], 'parted -s runs the commands without asking questions, which makes it perfect for scripts: mklabel gpt (new table), mkpart (new partition from 1 MiB to 2 GiB).', 'parted -s bina sawaal puche commands chalata hai, isliye scripts ke liye perfect: mklabel gpt (nayi table), mkpart (1 MiB se 2 GiB ka naya partition).'),
      P('The classic alternative is **fdisk**, an interactive tool. Its keystrokes are worth knowing:', 'Classic alternative **fdisk** hai, ek interactive tool. Iske keystrokes jaanne layak hain:'),
      TABLE(
        [
          ['g  /  o', 'create a new GPT / MBR table (erases everything!)', 'nayi GPT / MBR table (sab kuch mita deta hai!)'],
          ['n', 'new partition (it asks number, first sector, size like +2G)', 'naya partition (number, first sector, size jaise +2G puchta hai)'],
          ['p', 'print the table so far', 'ab tak ki table print karo'],
          ['t', 'change a partition type (e.g. Linux LVM)', 'partition type badlo (jaise Linux LVM)'],
          ['d', 'delete a partition', 'partition delete karo'],
          ['w', 'WRITE to disk and exit. Nothing is real until you press w.', 'disk par LIKHO aur exit. w dabane tak kuch asli nahi hota.'],
          ['q', 'quit without saving', 'bina save kiye quit'],
        ],
        'fdisk key',
        'fdisk key'
      ),
      CMD(['printf "n\\n\\n\\n+1G\\nw\\n" | sudo fdisk /dev/sdc', 'lsblk /dev/sdc'], 'The same job through fdisk: we pipe the keystrokes in. (In a real terminal you type them one at a time and press Enter after each.)', 'Wahi kaam fdisk se: keystrokes pipe karke dete hain. (Asli terminal mein ek-ek karke type karte ho aur har ek ke baad Enter dabate ho.)'),
      WARN('Partitioning and formatting DESTROY data on the disk. The one rule of the trade: run `lsblk` and check the size and name of the disk three times before you press Enter. "I formatted the wrong disk" is how people lose jobs.', 'Partitioning aur formatting disk ka data TABAH karte hain. Is kaam ka ek hi niyam: Enter dabane se pehle `lsblk` chalao aur disk ka size aur naam teen baar check karo. "Galat disk format ho gayi" se log naukri khote hain.'),
      H('Step 2: make a filesystem', 'Step 2: filesystem banao'),
      TABLE(
        [
          ['ext4', 'the safe default on Debian/Ubuntu. Can grow AND shrink. Good for everything.', 'Debian/Ubuntu ka safe default. Badh bhi sakta hai AUR ghat bhi. Sab kaam ke liye achha.'],
          ['xfs', 'the default on Red Hat family. Excellent with huge files and big disks. Can grow but CANNOT shrink.', 'Red Hat family ka default. Bade files aur badi disks ke saath behtareen. Badh sakta hai par ghat NAHI sakta.'],
          ['vfat / exfat', 'USB sticks and the EFI boot partition; works with Windows too', 'USB sticks aur EFI boot partition; Windows ke saath bhi chalta hai'],
          ['btrfs / zfs', 'advanced: snapshots, checksums, built-in RAID. Know the names.', 'advanced: snapshots, checksums, built-in RAID. Naam jaan lo.'],
          ['swap', 'not a filesystem for files: space the kernel uses when RAM is full', 'files ke liye filesystem nahi: RAM bhar jane par kernel ka use kiya hua space'],
        ],
        'Type',
        'Type'
      ),
      CMD(['sudo mkfs.ext4 -L datadisk /dev/sdb1', 'sudo blkid /dev/sdb1', 'lsblk -f /dev/sdb'], 'mkfs.ext4 builds the filesystem (-L gives it a label). blkid shows the UUID: a unique ID that never changes, even if the disk name does.', 'mkfs.ext4 filesystem banata hai (-L label deta hai). blkid UUID dikhata hai: ek unique ID jo kabhi nahi badalti, chahe disk ka naam badal jaye.'),
      THINK('why is UUID better than /dev/sdb1 in config files?', 'config files mein /dev/sdb1 ke bajay UUID behtar kyun hai?', 'Device names depend on the order in which the kernel finds disks. Add a new disk, or boot with a USB stick plugged in, and the old /dev/sdb can become /dev/sdc. A UUID stays attached to the filesystem itself.', 'Device naam is par depend karte hain ki kernel ko disks kis order mein milti hain. Nayi disk jodo ya USB stick lagakar boot karo to purana /dev/sdb /dev/sdc ban sakta hai. UUID filesystem se hi juda rehta hai.'),
      H('Step 3: mount', 'Step 3: mount'),
      CMD(['sudo mkdir -p /mnt/data', 'sudo mount /dev/sdb1 /mnt/data', 'df -hT /mnt/data', 'echo hello | sudo tee /mnt/data/hello.txt', 'ls -l /mnt/data'], 'The folder /mnt/data now IS the new disk. lost+found is a normal folder ext4 creates for recovery. Write something and see it.', '/mnt/data folder ab nayi disk HI hai. lost+found ek normal folder hai jo ext4 recovery ke liye banata hai. Kuch likho aur dekho.'),
      CMD(['findmnt /mnt/data', 'mountpoint /mnt/data', 'sudo umount /mnt/data', 'mountpoint /mnt/data'], 'umount is spelled without the n. A disk must be unmounted before you repair or remove it.', 'umount mein n nahi hota. Repair ya hatane se pehle disk unmount honi chahiye.'),
      TIP('"umount: target is busy" means a process is using the mount (maybe your own shell is standing inside it!). Find it with `sudo lsof /mnt/data` or `sudo fuser -vm /mnt/data`, `cd` out of it, and try again. Never use the force option on a busy disk unless you accept possible data loss.', '"umount: target is busy" ka matlab koi process mount use kar raha hai (shayad tumhara apna shell andar khada hai!). `sudo lsof /mnt/data` ya `sudo fuser -vm /mnt/data` se dhundo, usse `cd` karke bahar niklo aur phir try karo. Busy disk par force option tab tak mat lagao jab tak data khone ko taiyar na ho.'),
      CMD(['sudo mount -o ro /dev/sdb1 /mnt/data', 'echo test | sudo tee /mnt/data/new.txt', 'sudo mount -o remount,rw /mnt/data', 'echo test | sudo tee /mnt/data/new.txt', 'mount | grep sdb1'], 'Mount options change behaviour: ro is read-only, then remount,rw changes it on the fly. Others you will meet: noexec (no programs), nosuid, noatime.', 'Mount options behaviour badalte hain: ro read-only, phir remount,rw ise turant badalta hai. Aur jo milenge: noexec (programs nahi), nosuid, noatime.'),
      H('Step 4: make it survive a reboot: /etc/fstab', 'Step 4: reboot ke baad bhi rakho: /etc/fstab'),
      P('A mount made with the mount command vanishes at reboot. The file **/etc/fstab** lists what to mount at boot. One line per filesystem, six fields.', 'mount command se kiya mount reboot par ud jata hai. **/etc/fstab** file batati hai boot par kya mount karna hai. Har filesystem ki ek line, chhe fields.'),
      ANAT([
        ['UUID=9c71faf8-...', 'cmd', '1. what to mount: UUID= (best), LABEL= or a device path', '1. kya mount karna hai: UUID= (best), LABEL= ya device path'],
        ['/mnt/data', 'arg', '2. where to mount it', '2. kahan mount karna hai'],
        ['ext4', 'opt', '3. filesystem type', '3. filesystem type'],
        ['defaults', 'opt', '4. options (defaults = rw,suid,dev,exec,auto,nouser,async). Add nofail for non-vital disks.', '4. options (defaults = rw,suid,dev,exec,auto,nouser,async). Zaroori na ho wali disks ke liye nofail jodo.'],
        ['0', 'op', '5. dump: old backup flag, always 0', '5. dump: purana backup flag, hamesha 0'],
        ['2', 'op', '6. fsck order at boot: 1 for /, 2 for others, 0 = skip', '6. boot par fsck ka order: / ke liye 1, baaki 2, 0 = chhodo'],
      ]),
      CMD(['sudo blkid -s UUID -o value /dev/sdb1', 'echo "UUID=$(sudo blkid -s UUID -o value /dev/sdb1) /mnt/data ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab', 'tail -n 2 /etc/fstab'], 'Add the line without typing the long UUID by hand. -a on tee APPENDS; forget it and you overwrite the whole fstab!', 'Lambi UUID haath se likhe bina line jodo. tee ka -a APPEND karta hai; bhoolo to poori fstab overwrite ho jati hai!'),
      CMD(['sudo umount /mnt/data', 'sudo mount -a', 'findmnt /mnt/data'], 'THE safety test: `mount -a` mounts everything from fstab right now. If it complains, you found the typo while the machine is still running, not at 3 a.m. during a reboot.', 'SAFETY test: `mount -a` fstab ka sab kuch abhi mount karta hai. Wo shikayat kare to typo tab mil gayi jab machine chal rahi hai, raat 3 baje reboot mein nahi.'),
      WARN('A wrong line in /etc/fstab can stop a server from booting (it drops into emergency mode). Always run `sudo mount -a` after editing, keep a console or recovery plan, and use `nofail` for disks that are not essential.', '/etc/fstab ki galat line server ko boot hone se rok sakti hai (emergency mode mein gir jata hai). Edit ke baad hamesha `sudo mount -a` chalao, console ya recovery plan rakho, aur zaroori na hone wali disks ke liye `nofail` use karo.'),
      H('Checking and repairing', 'Check aur repair'),
      CMD(['sudo umount /mnt/data', 'sudo fsck.ext4 -n /dev/sdb1', 'sudo tune2fs -l /dev/sdb1 | head -n 6', 'sudo mount -a'], 'fsck checks a filesystem; run it only on an UNMOUNTED disk. -n means "look, do not change". For xfs the tool is xfs_repair. tune2fs -l reads the ext4 settings.', 'fsck filesystem check karta hai; sirf UNMOUNTED disk par chalao. -n matlab "dekho, badlo mat". xfs ke liye tool xfs_repair hai. tune2fs -l ext4 settings padhta hai.'),
      H('Where did my space go? (a daily job)', 'Mera space kahan gaya? (roz ka kaam)'),
      TABLE(
        [
          ['df -h', 'free space per mounted filesystem (watch the Use% column)', 'har mounted filesystem ka free space (Use% column dekho)'],
          ['df -i', 'INODES: a filesystem can run out of file slots even with free space (millions of tiny files)', 'INODES: filesystem ke file slots khatam ho sakte hain chahe space bacha ho (lakhon chhoti files)'],
          ['du -sh /var/*', 'size of each item in a folder', 'folder ki har cheez ka size'],
          ['sudo du -ah / 2>/dev/null | sort -rh | head -n 10', 'the 10 biggest files and folders on the machine', 'machine ke 10 sabse bade files aur folders'],
          ['find / -size +100M 2>/dev/null', 'files bigger than 100 MB', '100 MB se bade files'],
          ['sudo lsof +L1', 'files that were deleted but are still held open by a program (space not freed until the program restarts)', 'files jo delete ho gayi par program ne abhi khuli rakhi hain (program restart tak space free nahi hota)'],
        ],
        'Command',
        'Command'
      ),
      P('Let us have a disk emergency. A huge file appears and fills the disk. Notice how df, writes and du behave.', 'Chalo disk emergency karte hain. Ek bahut badi file aati hai aur disk bhar deti hai. Dekho df, writes aur du kaise behave karte hain.'),
      CMD(['df -h /', 'sudo fallocate -l 16G /var/backup-old.img', 'sudo fallocate -l 4G /var/other.img', 'df -h /', 'echo test | sudo tee /var/notes.txt'], 'The root filesystem is now 100% full. New writes fail with "No space left on device", and services start failing in strange ways. This is a classic outage.', 'Root filesystem ab 100% full hai. Nayi writes "No space left on device" ke saath fail hoti hain, aur services ajeeb tareeke se fail hone lagti hain. Ye classic outage hai.'),
      CMD(['sudo du -ah / 2>/dev/null | sort -rh | head -n 5', 'sudo rm /var/backup-old.img /var/other.img', 'df -h /'], 'Find the culprit with du | sort -rh, delete it, and the space comes back. Always look before you delete.', 'du | sort -rh se gunehgar dhundo, delete karo, aur space wapas. Delete karne se pehle hamesha dekho.'),
      JOB('Interview scenario: "df says 100% but du shows less than that, why?" Answer: a deleted file is still held open by a running process (lsof +L1 shows it), or the filesystem is out of inodes (df -i), or a mount point hides files under it. Saying these three shows real experience.', 'Interview scenario: "df 100% dikhata hai par du kam dikhata hai, kyun?" Jawab: ek delete ki hui file ab bhi chalte process ne khuli rakhi hai (lsof +L1 dikhata hai), ya filesystem ke inodes khatam hain (df -i), ya mount point ke neeche files chhup gayi hain. Ye teen kehna asli experience dikhata hai.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['lsblk -f / blkid', 'see disks, filesystems, UUIDs', 'disks, filesystems, UUIDs dekho'],
        ['parted -s DISK mklabel gpt mkpart primary ext4 1MiB 100%', 'partition a disk', 'disk partition karo'],
        ['mkfs.ext4 -L name DEV  /  mkfs.xfs DEV', 'make a filesystem', 'filesystem banao'],
        ['mount DEV DIR  /  umount DIR', 'attach / detach', 'jodo / hatao'],
        ['UUID=... /dir ext4 defaults,nofail 0 2', 'an fstab line', 'ek fstab line'],
        ['mount -a', 'test fstab', 'fstab test karo'],
        ['fsck -n DEV / xfs_repair -n DEV', 'check (unmounted)', 'check (unmounted)'],
        ['df -h / df -i / du -sh * / find / -size +100M', 'where is the space?', 'space kahan hai?'],
      ]),
    ],
    missions: [
      M('disks-m1', 'Prepare the new disk', 'Nayi disk taiyar karo', 'On the empty disk /dev/sdb create a GPT partition table, one 2 GiB partition (/dev/sdb1) and format it as ext4 with the label datadisk.', 'Khaali disk /dev/sdb par GPT partition table, ek 2 GiB partition (/dev/sdb1) banao aur use label datadisk ke saath ext4 mein format karo.', 'parted -s /dev/sdb mklabel gpt mkpart primary ext4 1MiB 2GiB, then mkfs.ext4 -L datadisk /dev/sdb1', 'parted -s /dev/sdb mklabel gpt mkpart primary ext4 1MiB 2GiB, phir mkfs.ext4 -L datadisk /dev/sdb1', (sh) => { const d = sh.devs['/dev/sdb1']; return !!d && d.fs === 'ext4' && d.label === 'datadisk'; }, S1),
      M('disks-m2', 'Plug it in', 'Ise jodo', 'Mount /dev/sdb1 on a new folder /mnt/data and create the file /mnt/data/hello.txt containing hello (you need sudo).', '/dev/sdb1 ko naye folder /mnt/data par mount karo aur usme hello wali file /mnt/data/hello.txt banao (sudo chahiye).', 'mkdir -p, mount, then echo hello | sudo tee /mnt/data/hello.txt', 'mkdir -p, mount, phir echo hello | sudo tee /mnt/data/hello.txt', (sh) => sh.mounts.some((m) => m.dev === '/dev/sdb1' && m.target === '/mnt/data') && /hello/.test(LX.cat(sh, '/mnt/data/hello.txt')), S2),
      M('disks-m3', 'Make it permanent', 'Ise permanent banao', 'Add a line to /etc/fstab that mounts /dev/sdb1 (by its UUID) on /mnt/data as ext4 with the options defaults, and verify with sudo mount -a.', '/etc/fstab mein ek line jodo jo /dev/sdb1 ko (UUID se) /mnt/data par ext4 ke roop mein defaults options ke saath mount kare, aur sudo mount -a se verify karo.', 'Use blkid to get the UUID, then tee -a /etc/fstab, then mount -a', 'UUID ke liye blkid, phir tee -a /etc/fstab, phir mount -a', (sh) => { const d = sh.devs['/dev/sdb1']; return !!d && !!d.uuid && new RegExp('^UUID=' + d.uuid + '\\s+/mnt/data\\s+ext4\\s+defaults', 'm').test(LX.cat(sh, '/etc/fstab')) && sh.log.some((r) => /mount -a/.test(r.cmd)); }, S3),
    ],
    quiz: [
      mcq(1, 'Which command draws a tree of disks and partitions?', 'Kaunsi command disks aur partitions ka tree banati hai?', ['lsblk', 'lsdisk', 'diskfree', 'tree /dev'], 0, 'lsblk lists block devices as a tree.', 'lsblk block devices ko tree ki tarah list karta hai.'),
      mcq(2, 'What is the correct order of steps for a new disk?', 'Nayi disk ke steps ka sahi order kya hai?', ['mount, partition, format', 'format, mount, partition', 'partition, format (mkfs), mount', 'mount, format, partition'], 2, 'Partition it, create the filesystem, then mount it.', 'Partition karo, filesystem banao, phir mount karo.'),
      cmd(3, 'Show only the filesystem TYPE of /dev/sda1 (just the word, nothing else). You need root.', 'Sirf /dev/sda1 ka filesystem TYPE dikhao (bas wo shabd). Root chahiye.', { verify: (sh, r) => r.out.trim() === 'ext4', sample: 'sudo blkid -s TYPE -o value /dev/sda1', alt: ['sudo blkid -o value -s TYPE /dev/sda1', 'lsblk -no FSTYPE /dev/sda1'], wrong: ['sudo blkid /dev/sda1'], hintEn: 'blkid has -s to select a tag and -o value to print only the value.', hintHi: 'blkid ka -s tag chunta hai aur -o value sirf value print karta hai.' }, '-s TYPE picks the tag, -o value prints it without decoration.', '-s TYPE tag chunta hai, -o value bina sajawat ke print karta hai.'),
      cmd(4, 'Create a GPT partition table and one partition covering the whole disk /dev/sdc, using parted in script mode.', 'parted ko script mode mein chalakar poori disk /dev/sdc par GPT partition table aur ek partition banao.', { verify: (sh) => !!sh.devs['/dev/sdc1'] && sh.devs['/dev/sdc'].table === 'gpt' && sh.devs['/dev/sdc1'].size > 4.9e9, sample: 'sudo parted -s /dev/sdc mklabel gpt mkpart primary ext4 1MiB 100%', alt: ['sudo parted -s /dev/sdc mklabel gpt mkpart data xfs 1MiB 100%'], wrong: ['sudo parted -s /dev/sdc mklabel gpt'], hintEn: 'parted -s DISK mklabel gpt mkpart primary ext4 START END', hintHi: 'parted -s DISK mklabel gpt mkpart primary ext4 START END' }, '100% means the end of the disk.', '100% matlab disk ka ant.'),
      mcq(5, 'Why do we write UUID=... in /etc/fstab instead of /dev/sdb1?', '/etc/fstab mein /dev/sdb1 ke bajay UUID=... kyun likhte hain?', ['UUID is shorter', 'Device names can change when disks are added; the UUID does not', 'UUID makes the disk faster', 'It is required by xfs only'], 1, 'The UUID is stored in the filesystem itself.', 'UUID filesystem ke andar hi store hoti hai.'),
      cmd(6, 'The partition /dev/sdc1 exists but has no filesystem. Make it an xfs filesystem.', 'Partition /dev/sdc1 maujood hai par usme filesystem nahi hai. Use xfs filesystem banao.', { setup: ['sudo parted -s /dev/sdc mklabel gpt mkpart primary xfs 1MiB 100%'], verify: (sh) => sh.devs['/dev/sdc1'].fs === 'xfs', sample: 'sudo mkfs.xfs /dev/sdc1', alt: ['sudo mkfs -t xfs /dev/sdc1', 'sudo mkfs.xfs -f /dev/sdc1'], wrong: ['sudo mkfs.ext4 /dev/sdc1'], hintEn: 'mkfs.xfs and the device.', hintHi: 'mkfs.xfs aur device.' }, 'mkfs.xfs creates an xfs filesystem.', 'mkfs.xfs xfs filesystem banata hai.'),
      cmd(7, 'Mount /dev/sdb1 (it already has an ext4 filesystem) on /mnt/disk. Create the folder first, in the same command line.', '/dev/sdb1 (usme ext4 filesystem pehle se hai) ko /mnt/disk par mount karo. Folder usi command line mein pehle banao.', { setup: S1, verify: (sh) => sh.mounts.some((m) => m.dev === '/dev/sdb1' && m.target === '/mnt/disk'), sample: 'sudo mkdir -p /mnt/disk && sudo mount /dev/sdb1 /mnt/disk', alt: ['sudo mkdir /mnt/disk; sudo mount /dev/sdb1 /mnt/disk'], wrong: ['sudo mount /dev/sdb1 /mnt/disk'], hintEn: 'mkdir -p first, then mount, joined with &&.', hintHi: 'Pehle mkdir -p, phir mount, && se jude.' }, 'The mount point (folder) must exist before mounting.', 'Mount karne se pehle mount point (folder) ka hona zaroori hai.'),
      cmd(8, 'Find every file bigger than 5 MB under /var (errors hidden). There is a 20 MB file waiting for you.', '/var ke andar 5 MB se bade saare files dhundo (errors chhupa kar). Ek 20 MB ki file tumhara intezaar kar rahi hai.', { setup: ['sudo fallocate -l 20M /var/log/surprise.bin'], verify: (sh, r) => /\/var\/log\/surprise\.bin/.test(r.out) && !/Permission denied/.test(r.all), sample: 'find /var -size +5M 2>/dev/null', alt: ['sudo find /var -type f -size +5M'], wrong: ['find /var -name surprise.bin'], hintEn: 'find with -size +5M.', hintHi: 'find ke saath -size +5M.' }, '+5M means larger than 5 megabytes.', '+5M matlab 5 megabyte se bada.'),
      cmd(9, 'The disk looks full. Show the 3 biggest items directly inside /var (human sizes, biggest first). A hidden big file is hiding there.', 'Disk bhari lagti hai. /var ke andar seedhe 3 sabse bade items dikhao (human sizes, bada pehle). Wahan ek chhupi hui badi file hai.', { setup: ['sudo fallocate -l 6G /var/hidden-hog.img'], verify: (sh, r) => /6\.0G\s+\/var\/hidden-hog\.img/.test(r.out) && r.out.trim().split('\n').length === 3, sample: 'sudo du -sh /var/* 2>/dev/null | sort -rh | head -n 3', alt: ['sudo du -sh /var/* | sort -hr | head -3'], wrong: ['df -h'], hintEn: 'du -sh on /var/*, sort -rh, head -n 3.', hintHi: '/var/* par du -sh, sort -rh, head -n 3.' }, 'du measures, sort -rh orders human sizes biggest first, head cuts.', 'du naapta hai, sort -rh human sizes ko bada-pehle order karta hai, head kaat deta hai.'),
      cmd(10, 'Boss level: in ONE line make /dev/sdb1 permanent: create /mnt/vault, add its UUID line to /etc/fstab (ext4, defaults,nofail) and prove it works by running mount -a and showing it with findmnt /mnt/vault.', 'Boss level: EK line mein /dev/sdb1 ko permanent banao: /mnt/vault banao, uski UUID wali line /etc/fstab mein jodo (ext4, defaults,nofail) aur mount -a chalakar findmnt /mnt/vault se saabit karo.', { setup: S1, verify: (sh, r) => { const d = sh.devs['/dev/sdb1']; return sh.mounts.some((m) => m.dev === '/dev/sdb1' && m.target === '/mnt/vault') && new RegExp('UUID=' + d.uuid + '\\s+/mnt/vault\\s+ext4\\s+defaults,nofail').test(LX.cat(sh, '/etc/fstab')) && /\/mnt\/vault/.test(r.out); }, sample: 'sudo mkdir -p /mnt/vault && echo "UUID=$(sudo blkid -s UUID -o value /dev/sdb1) /mnt/vault ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab && sudo mount -a && findmnt /mnt/vault', wrong: ['sudo mkdir -p /mnt/vault'], hintEn: 'mkdir, tee -a the UUID line, mount -a, findmnt, all joined with &&.', hintHi: 'mkdir, UUID line tee -a, mount -a, findmnt, sab && se jude.' }, 'mount -a proves the fstab line works before the next reboot.', 'mount -a agle reboot se pehle saabit karta hai ki fstab line chalti hai.'),
    ],
  });
})();
