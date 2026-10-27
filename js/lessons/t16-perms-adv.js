(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, JOB, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  LX.topics.push({
    id: 'perms-adv',
    part: 2,
    no: 16,
    key: 'setgid',
    mins: 40,
    title: T('Special Permissions, ACLs and Links', 'Special Permissions, ACLs aur Links'),
    blurb: T('Shared team folders, sticky /tmp, the setuid trick behind passwd, umask, ACLs for one-off access, immutable files and hard vs soft links.', 'Team ke shared folders, sticky /tmp, passwd ke peeche ka setuid trick, umask, ek-do logon ko access dene ke ACLs, immutable files aur hard vs soft links.'),
    blocks: [
      BIG(
        'rwx for owner, group and others cannot solve every problem. How do you let a whole team share one folder? How can an ordinary user change their own password, when /etc/shadow belongs to root? This lesson covers the extra tools: **special bits** (setuid, setgid, sticky), **umask**, **ACLs**, **attributes** and **links**.',
        'Owner, group aur others ke liye rwx har problem hal nahi kar sakta. Poori team ek folder kaise share kare? Ek normal user apna password kaise badle jab /etc/shadow root ki hai? Ye lesson extra tools batata hai: **special bits** (setuid, setgid, sticky), **umask**, **ACLs**, **attributes** aur **links**.'
      ),
      H('Three special bits', 'Teen special bits'),
      TABLE(
        [
          ['setuid  (4000, s in the owner x slot)', 'on a program: run it with the power of the FILE\'S OWNER, not yours. This is why /usr/bin/passwd can edit /etc/shadow.', 'program par: use FILE KE OWNER ki taakat se chalao, tumhari nahi. Isi liye /usr/bin/passwd /etc/shadow edit kar sakta hai.'],
          ['setgid  (2000, s in the group x slot)', 'on a FOLDER: new files inside get the folder\'s group. Perfect for team folders.', 'FOLDER par: andar ki nayi files ko folder ka group milta hai. Team folders ke liye perfect.'],
          ['sticky  (1000, t at the end)', 'on a shared folder: you may delete only YOUR OWN files, even if the folder is writable by everyone. That is /tmp.', 'shared folder par: tum sirf APNI files delete kar sakte ho, chahe folder sabke liye writable ho. Yehi /tmp hai.'],
        ],
        'Bit',
        'Bit'
      ),
      CMD(['ls -l /usr/bin/passwd /usr/bin/sudo', 'ls -ld /tmp'], 'Spot the s in rwsr-xr-x (setuid) and the t in drwxrwxrwt (sticky).', 'rwsr-xr-x mein s (setuid) aur drwxrwxrwt mein t (sticky) dhundo.'),
      PRE(`-rwsr-xr-x  root root  /usr/bin/passwd      s = setuid: runs as root
drwxrwxrwt  root root  /tmp                 t = sticky: delete only your own
drwxrws---  root team  /srv/team             s = setgid: new files get group "team"`),
      FUN('If the bit is on but the underlying x is missing, ls shows a CAPITAL letter (S or T). A capital S means "setuid is set but the file is not even executable", which is almost always a mistake.', 'Agar bit on hai par neeche ka x nahi hai, ls CAPITAL letter (S ya T) dikhata hai. Capital S ka matlab "setuid laga hai par file executable bhi nahi", jo lagbhag hamesha galti hoti hai.'),
      WARN('Setuid programs are a favourite target for attackers: a bug in a setuid-root program can turn into a full takeover. Auditors list them with `find / -perm -4000 -type f`, and you should know why each one is there.', 'Setuid programs attackers ka favourite nishana hain: setuid-root program ki ek bug poora kabza dila sakti hai. Auditors inhe `find / -perm -4000 -type f` se list karte hain, aur tumhe pata hona chahiye har ek kyun hai.'),
      CMD('find / -perm -4000 -type f 2>/dev/null', 'List every setuid file. A new, unknown name here is a red flag.', 'Har setuid file list karo. Yahan koi naya, anjaana naam dikhe to khatre ki ghanti hai.'),
      H('Build a team folder (the real-world recipe)', 'Team folder banao (real-world recipe)'),
      P('Goal: the group "team" shares /srv/team. Everybody in the team can read and write everybody\'s files, and outsiders see nothing.', 'Goal: group "team" /srv/team share karta hai. Team ka har member har kisi ki files padh aur likh sake, aur bahar walon ko kuch na dikhe.'),
      STEPS([
        ['Create the group and the folder: `sudo groupadd team`, `sudo mkdir -p /srv/team`.', 'Group aur folder banao: `sudo groupadd team`, `sudo mkdir -p /srv/team`.'],
        ['Give it to the group: `sudo chown root:team /srv/team`.', 'Group ko do: `sudo chown root:team /srv/team`.'],
        ['Set **2770**: setgid (2) + rwx for owner and group (770) + nothing for others.', '**2770** lagao: setgid (2) + owner aur group ke liye rwx (770) + others ko kuch nahi.'],
        ['Put people in the group: `sudo usermod -aG team asha`.', 'Logon ko group mein daalo: `sudo usermod -aG team asha`.'],
      ]),
      CMD(['sudo groupadd team', 'sudo mkdir -p /srv/team', 'sudo chown root:team /srv/team', 'sudo chmod 2770 /srv/team', 'sudo useradd -m -G team asha', 'sudo -u asha touch /srv/team/a.txt', 'sudo ls -l /srv/team'], 'Look: a.txt belongs to group team because of the setgid bit, even though asha\'s own group is asha. That is the whole trick.', 'Dekho: a.txt group team ki hai setgid bit ki wajah se, chahe asha ka apna group asha hai. Poora trick yehi hai.'),
      H('umask: the default permissions', 'umask: default permissions'),
      P('New files do not start at 777. The **umask** is a number of bits that get SWITCHED OFF. With umask 022, new files become 666 minus 022 = 644 (rw-r--r--) and new folders 777 minus 022 = 755.', 'Nayi files 777 se shuru nahi hoti. **umask** un bits ka number hai jo BAND kar diye jate hain. umask 022 ke saath nayi files 666 minus 022 = 644 (rw-r--r--) aur nayi folders 777 minus 022 = 755 ban te hain.'),
      CMD(['umask', 'touch normal.txt && mkdir normal_dir', 'umask 077', 'touch private.txt && mkdir private_dir', 'ls -ld normal.txt normal_dir private.txt private_dir', 'umask 022'], 'With umask 077 everything new is private to you. Servers often use 027 or 077.', 'umask 077 ke saath har nayi cheez sirf tumhari hoti hai. Servers par aksar 027 ya 077 hota hai.'),
      TABLE(
        [
          ['022', 'files 644, folders 755 (default on most systems)', 'files 644, folders 755 (zyadatar systems ka default)'],
          ['027', 'files 640, folders 750 (others get nothing)', 'files 640, folders 750 (others ko kuch nahi)'],
          ['077', 'files 600, folders 700 (only the owner)', 'files 600, folders 700 (sirf owner)'],
        ],
        'umask',
        'umask'
      ),
      H('ACLs: permissions for one specific person', 'ACLs: kisi ek khaas insaan ke liye permissions'),
      P('Owner/group/others has only three slots. What if the file belongs to you, and you want asha (who is not in your group) to read it, and ben to write it? That is what **ACLs** (Access Control Lists) are for.', 'Owner/group/others ke sirf teen slot hain. Agar file tumhari hai aur tum chahte ho asha (jo tumhare group mein nahi) padh sake aur ben likh sake? Iske liye **ACLs** (Access Control Lists) hain.'),
      CMD(['echo "quarterly numbers" > report.txt', 'sudo useradd -m asha', 'sudo useradd -m ben', 'setfacl -m u:asha:r report.txt', 'setfacl -m u:ben:rw report.txt', 'getfacl report.txt', 'ls -l report.txt'], 'The + at the end of the ls -l line tells you that ACL entries exist. getfacl shows them all.', 'ls -l ki line ke ant ka + batata hai ki ACL entries maujood hain. getfacl sab dikhata hai.'),
      TABLE(
        [
          ['setfacl -m u:asha:r file', 'give user asha read', 'user asha ko read do'],
          ['setfacl -m g:devs:rw file', 'give group devs read+write', 'group devs ko read+write do'],
          ['setfacl -x u:asha file', 'remove asha\'s entry', 'asha ki entry hatao'],
          ['setfacl -b file', 'remove ALL ACL entries', 'SAARI ACL entries hatao'],
          ['setfacl -d -m g:team:rwx dir', 'default ACL: new files in dir inherit it', 'default ACL: dir ki nayi files ise inherit karti hain'],
          ['getfacl file', 'show owner, group, ACL entries and the mask', 'owner, group, ACL entries aur mask dikhao'],
        ],
        'Command',
        'Command'
      ),
      TIP('The **mask** is a ceiling for all named users and groups. If getfacl shows `#effective:r--` next to an entry, the mask is cutting it down. Fix the mask with `setfacl -m m::rw file`.', '**Mask** saare named users aur groups ke liye chhat hai. Agar getfacl kisi entry ke saath `#effective:r--` dikhaye to mask use kaat raha hai. Mask `setfacl -m m::rw file` se theek karo.'),
      H('Attributes: even root can be stopped', 'Attributes: root ko bhi roka ja sakta hai'),
      P('**chattr +i** makes a file **immutable**: nobody, not even root, can change, rename or delete it until the flag is removed. It is a seatbelt for files like /etc/resolv.conf or a precious config. **lsattr** shows the flags.', '**chattr +i** file ko **immutable** bana deta hai: jab tak flag nahi hatta koi bhi, root bhi, use badal, rename ya delete nahi kar sakta. Ye /etc/resolv.conf jaisi ya kisi qeemti config ke liye seatbelt hai. **lsattr** flags dikhata hai.'),
      CMD(['echo precious > important.txt', 'sudo chattr +i important.txt', 'lsattr important.txt', 'sudo rm important.txt', 'sudo chattr -i important.txt', 'rm important.txt && echo "removed now"'], 'While the i flag is on, even sudo rm says "Operation not permitted". A great trick when a delete fails mysteriously for root.', 'Jab tak i flag on hai, sudo rm bhi "Operation not permitted" kehta hai. Jab root se delete bhi rahasyamay tareeke se fail ho to ye jaanna kaam aata hai.'),
      H('Links: two names for one thing', 'Links: ek cheez ke do naam'),
      P('A file really lives in an **inode** (a numbered record: owner, size, where the data is). A name is just a label pointing to an inode. There are two kinds of link.', 'File asal mein ek **inode** mein rehti hai (ek numbered record: owner, size, data kahan hai). Naam sirf ek label hai jo inode ki taraf point karta hai. Link do tarah ke hote hain.'),
      TABLE(
        [
          ['ln original hardlink', 'HARD link: a second name for the SAME inode. Both are equal. The data lives until the last name is deleted. Cannot cross filesystems or point to folders.', 'HARD link: SAME inode ka doosra naam. Dono barabar hain. Data tab tak rehta hai jab tak aakhri naam delete na ho. Filesystems ke paar ya folders ko point nahi kar sakta.'],
          ['ln -s target softlink', 'SOFT (symbolic) link: a tiny file that holds the PATH. Can point anywhere, even to folders. If the target is deleted the link BREAKS.', 'SOFT (symbolic) link: ek chhoti file jisme PATH likha hota hai. Kahin bhi point kar sakta hai, folders ko bhi. Target delete ho to link TOOT jata hai.'],
        ],
        'Command',
        'Command'
      ),
      CMD(['echo hello > original.txt', 'ln original.txt hard.txt', 'ln -s original.txt soft.txt', 'ls -li original.txt hard.txt soft.txt', 'rm original.txt', 'cat hard.txt', 'cat soft.txt'], 'Same inode number for original and hard.txt (and a link count of 2). After rm, the hard link still has the data; the soft link is now dangling and gives an error.', 'original aur hard.txt ka inode number same hai (aur link count 2). rm ke baad hard link ke paas data hai; soft link ab latak gaya hai aur error deta hai.'),
      JOB('Soft links are everywhere on servers: /etc/nginx/sites-enabled/* are soft links to sites-available, and /usr/bin/python3 points to a versioned binary. The command `ln -sfn newdir current` is how many deployments switch to a new release instantly and roll back by pointing back.', 'Servers par soft links har jagah hain: /etc/nginx/sites-enabled/* sites-available ke soft links hain, aur /usr/bin/python3 versioned binary ko point karta hai. `ln -sfn newdir current` se kai deployments turant naye release par switch hote hain aur wapas point karke rollback karte hain.'),
      CMD(['mkdir -p releases/v1 releases/v2', 'ln -sfn releases/v1 current', 'readlink current', 'ln -sfn releases/v2 current', 'readlink current'], 'Switch "current" from v1 to v2 in one step. This is the heart of simple zero-downtime deploys.', '"current" ko v1 se v2 par ek step mein badlo. Simple zero-downtime deploys ka dil yehi hai.'),
      THINK('what number does stat show for "Links:" on a normal file? What happens when it reaches 0?', 'normal file ke liye stat "Links:" mein kaunsa number dikhata hai? 0 hone par kya hota hai?', 'Normally 1: one name points to the inode. Each hard link adds one. When the count reaches 0 (and no program has the file open), the data is freed. That is what rm really does: remove one name.', 'Normally 1: ek naam inode ko point karta hai. Har hard link ek jodta hai. Count 0 ho jaye (aur koi program file khole na ho) to data free ho jata hai. rm asal mein yehi karta hai: ek naam hata deta hai.'),
      H('stat: the detailed view', 'stat: detail wala view'),
      CMD(['stat report.txt', 'stat -c "%a %U:%G %n" report.txt /tmp /usr/bin/passwd'], 'stat shows everything about a file. With -c you choose the format: %a octal mode, %U owner, %G group, %n name. Super handy in scripts.', 'stat file ke baare mein sab dikhata hai. -c se format chunte ho: %a octal mode, %U owner, %G group, %n naam. Scripts mein bahut kaam ka.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['chmod u+s / g+s / +t', 'setuid / setgid / sticky', 'setuid / setgid / sticky'],
        ['chmod 2770 dir', 'team folder (setgid)', 'team folder (setgid)'],
        ['find / -perm -4000', 'audit setuid files', 'setuid files ka audit'],
        ['umask 027', 'new files 640, folders 750', 'nayi files 640, folders 750'],
        ['setfacl -m u:name:rw f / getfacl f', 'per-user permission', 'har user ke liye permission'],
        ['chattr +i f / lsattr f', 'make immutable / look', 'immutable banao / dekho'],
        ['ln a b / ln -s a b', 'hard link / soft link', 'hard link / soft link'],
        ['ls -li, stat, readlink', 'inspect links', 'links dekho'],
      ]),
    ],
    missions: [
      M('padv-m1', 'Team folder', 'Team folder', 'Build /srv/team: group team, the folder owned by root:team with mode 2770, and make asha a member of team. (Create asha and the group if needed.)', '/srv/team banao: group team, folder root:team ka mode 2770 ke saath, aur asha ko team ka member banao. (Zaroorat ho to asha aur group banao.)', 'groupadd, mkdir -p, chown root:team, chmod 2770, usermod -aG', 'groupadd, mkdir -p, chown root:team, chmod 2770, usermod -aG', (sh) => { const n = sh.fs.lookup('/srv/team'); return !!n && n.group === 'team' && (n.mode & 0o7777) === 0o2770 && !!sh.users.asha && sh.users.asha.groups.includes('team'); }, ['sudo groupadd team', 'sudo mkdir -p /srv/team', 'sudo chown root:team /srv/team', 'sudo chmod 2770 /srv/team', 'sudo useradd -m asha', 'sudo usermod -aG team asha']),
      M('padv-m2', 'One person, one file', 'Ek insaan, ek file', 'Create report.txt in your home and give the user asha (who must exist) read-only access with an ACL.', 'Apne home mein report.txt banao aur user asha (jo maujood ho) ko ACL se read-only access do.', 'setfacl -m u:asha:r report.txt', 'setfacl -m u:asha:r report.txt', (sh) => { const n = sh.fs.lookup(sh.abs('~/report.txt')); return !!n && (n.acl || []).some((e) => e.t === 'u' && e.n === 'asha' && e.p === 4); }, ['touch report.txt', 'sudo useradd -m asha', 'setfacl -m u:asha:r report.txt']),
      M('padv-m3', 'Two names, one release', 'Do naam, ek release', 'Make a soft link called  current  in your home that points to  releases/v2  (create the folders first).', 'Apne home mein  current  naam ka soft link banao jo  releases/v2  ko point kare (pehle folders banao).', 'mkdir -p releases/v2, then ln -s releases/v2 current', 'mkdir -p releases/v2, phir ln -s releases/v2 current', (sh) => { const n = sh.fs.lookup(sh.abs('~/current'), false); return !!n && n.t === 'l' && /releases\/v2\/?$/.test(n.target); }, ['mkdir -p releases/v2', 'ln -s releases/v2 current']),
    ],
    quiz: [
      mcq(1, 'What does the t at the end of  drwxrwxrwt  (like /tmp) mean?', ' drwxrwxrwt  (jaise /tmp) ke ant ka t kya batata hai?', ['The folder is temporary', 'Sticky bit: you can only delete your own files there', 'The folder is encrypted', 'Tracking is on'], 1, 'The sticky bit lets everyone write in the folder but delete only their own files.', 'Sticky bit sabko folder mein likhne deta hai par delete sirf apni files.'),
      mcq(2, 'Why can a normal user run passwd and still change /etc/shadow?', 'Normal user passwd chalakar /etc/shadow kaise badal sakta hai?', ['passwd is a virus', 'passwd has the setuid bit and runs as root', 'Users secretly have root', 'shadow is world-writable'], 1, 'setuid makes the program run with the power of its owner (root).', 'setuid program ko uske owner (root) ki taakat se chalata hai.'),
      cmd(3, 'Set the permissions of the folder ~/projects/website so that its mode is exactly 2775 (setgid, rwx for owner and group, r-x for others).', '~/projects/website folder ka mode theek 2775 karo (setgid, owner aur group ke liye rwx, others ke liye r-x).', { verify: (sh) => (sh.stat('~/projects/website').mode & 0o7777) === 0o2775, sample: 'chmod 2775 ~/projects/website', alt: ['chmod g+s ~/projects/website && chmod 775 ~/projects/website'], wrong: ['chmod 775 ~/projects/website'], hintEn: 'A fourth digit in front holds the special bits. setgid is 2.', hintHi: 'Aage ka chautha digit special bits rakhta hai. setgid 2 hai.' }, '2 = setgid, then 775.', '2 = setgid, phir 775.'),
      cmd(4, 'List all the files on the system that have the setuid bit (errors hidden).', 'System ki saari files list karo jinpar setuid bit hai (errors chhupa kar).', { verify: (sh, r) => /\/usr\/bin\/passwd/.test(r.out) && !/Permission denied/.test(r.all), sample: 'find / -perm -4000 -type f 2>/dev/null', alt: ['find / -type f -perm -4000 2>/dev/null', 'find / -perm /4000 -type f 2>/dev/null'], wrong: ['find / -perm 4000'], hintEn: 'find with -perm and the number 4000, minus sign in front, and send errors away.', hintHi: 'find, -perm aur 4000 number, aage minus, aur errors ko hata do.' }, '-perm -4000 means "setuid bit is set". 2>/dev/null hides permission errors.', '-perm -4000 matlab "setuid bit laga hai". 2>/dev/null permission errors chhupata hai.'),
      mcq(5, 'With umask 027, what permissions does a NEW file get?', 'umask 027 ke saath NAYI file ko kaunsi permissions milti hain?', ['640', '750', '027', '777'], 0, 'Files start at 666; removing 027 leaves 640 (rw-r-----).', 'Files 666 se shuru hoti hain; 027 hatane par 640 (rw-r-----) bachta hai.'),
      cmd(6, 'Make a new file called safe.txt that is created with umask 077 and prove its mode is 600, all in one line using stat.', 'umask 077 ke saath safe.txt naam ki nayi file banao aur stat se ek hi line mein saabit karo ki mode 600 hai.', { verify: (sh, r) => /600/.test(r.out) && !!sh.fs.lookup(sh.abs('~/safe.txt')), sample: 'umask 077; touch safe.txt; stat -c %a safe.txt', alt: ['(umask 077; touch safe.txt); stat -c "%a" safe.txt'], wrong: ['touch safe.txt; stat -c %a safe.txt'], hintEn: 'Set the umask, touch, then stat -c %a.', hintHi: 'umask set karo, touch, phir stat -c %a.' }, 'umask 077 removes all access for group and others from new files.', 'umask 077 nayi files se group aur others ka sab access hata deta hai.'),
      cmd(7, 'The file data.txt must be readable by the user asha (not in your group) without changing its normal permissions. Give her read access with an ACL.', 'data.txt user asha (jo tumhare group mein nahi) ko padhne ke liye milni chahiye, uski normal permissions badle bina. ACL se read access do.', { setup: ['touch data.txt', 'sudo useradd -m asha'], verify: (sh) => { const n = sh.fs.lookup(sh.abs('~/data.txt')); return (n.acl || []).some((e) => e.t === 'u' && e.n === 'asha' && (e.p & 4)) && (n.mode & 0o777) === 0o644; }, sample: 'setfacl -m u:asha:r data.txt', alt: ['setfacl -m user:asha:r data.txt', 'setfacl -m u:asha:r-- data.txt'], wrong: ['chmod 666 data.txt'], hintEn: 'setfacl -m, then u:name:permission, then the file.', hintHi: 'setfacl -m, phir u:naam:permission, phir file.' }, 'setfacl -m u:asha:r adds one named-user entry.', 'setfacl -m u:asha:r ek named-user entry jodta hai.'),
      cmd(8, 'Protect the file keep.txt so that nobody, not even root, can delete or change it.', 'keep.txt file ko aise protect karo ki koi bhi, root bhi, use delete ya badal na sake.', { setup: ['touch keep.txt'], verify: (sh) => /i/.test(sh.fs.lookup(sh.abs('~/keep.txt')).attrs || ''), sample: 'sudo chattr +i keep.txt', wrong: ['chmod 000 keep.txt'], hintEn: 'An attribute, not a permission. The immutable flag is i.', hintHi: 'Ye permission nahi attribute hai. Immutable flag i hota hai.' }, 'chattr +i sets the immutable flag.', 'chattr +i immutable flag lagata hai.'),
      cmd(9, 'There is a file notes.txt. Create a HARD link to it called notes-hard.txt and show both names with their inode numbers on one screen.', 'notes.txt file hai. Uska HARD link notes-hard.txt banao aur dono naam inode number ke saath ek screen par dikhao.', { verify: (sh, r) => { const a = sh.fs.lookup(sh.abs('~/notes.txt')); const b = sh.fs.lookup(sh.abs('~/notes-hard.txt')); return !!b && b.t === 'f' && (a.nlink || 1) >= 2 && /notes-hard\.txt/.test(r.out) && /notes\.txt/.test(r.out) && /\d{4,}/.test(r.out); }, sample: 'ln notes.txt notes-hard.txt && ls -li notes.txt notes-hard.txt', alt: ['ln notes.txt notes-hard.txt; ls -i notes.txt notes-hard.txt'], wrong: ['ln -s notes.txt notes-hard.txt && ls -li notes.txt notes-hard.txt'], hintEn: 'ln without -s, then ls with the -i flag.', hintHi: '-s ke bina ln, phir ls ka -i flag.' }, 'ln makes a hard link, ls -i prints the inode number.', 'ln hard link banata hai, ls -i inode number print karta hai.'),
      cmd(10, 'Boss level: create /srv/shared as a team folder in one go: group qa, owner root, group qa, mode 3770 (setgid AND sticky, rwx for owner and group).', 'Boss level: /srv/shared ko ek hi baar mein team folder banao: group qa, owner root, group qa, mode 3770 (setgid AUR sticky, owner aur group ke liye rwx).', { verify: (sh) => { const n = sh.fs.lookup('/srv/shared'); return !!n && n.group === 'qa' && n.owner === 'root' && (n.mode & 0o7777) === 0o3770; }, sample: 'sudo groupadd qa && sudo mkdir -p /srv/shared && sudo chown root:qa /srv/shared && sudo chmod 3770 /srv/shared', alt: ['sudo groupadd qa; sudo mkdir -p /srv/shared; sudo chgrp qa /srv/shared; sudo chmod 3770 /srv/shared'], wrong: ['sudo mkdir -p /srv/shared'], hintEn: 'groupadd, mkdir, chown root:qa, then chmod with leading 3 (2 + 1).', hintHi: 'groupadd, mkdir, chown root:qa, phir chmod aage 3 ke saath (2 + 1).' }, 'setgid (2) + sticky (1) = 3, then 770.', 'setgid (2) + sticky (1) = 3, phir 770.'),
    ],
  });
})();
