(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, JOB, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  LX.topics.push({
    id: 'users',
    part: 2,
    no: 14,
    key: 'useradd',
    mins: 40,
    title: T('Users and Groups (account management)', 'Users aur Groups (account management)'),
    blurb: T('Create, change, lock and remove accounts. Read /etc/passwd like a pro. Set password rules and handle new joiners and leavers.', 'Accounts banao, badlo, lock karo aur hatao. /etc/passwd pro ki tarah padho. Password rules lagao aur naye aane wale aur jaane wale logon ko sambhalo.'),
    blocks: [
      BIG(
        'Every program on Linux runs **as** somebody. That somebody is a **user** with a number (UID), and users can be put in **groups** with a number (GID). Files remember the NUMBER of their owner, and the system turns numbers into names when it shows them to you. Managing accounts is a junior admin\'s most common task.',
        'Linux par har program kisi ke **roop** mein chalta hai. Wo "kisi" ek **user** hai jiska ek number (UID) hota hai, aur users ko **groups** (number GID) mein rakha ja sakta hai. Files apne owner ka NUMBER yaad rakhti hain, aur system tumhe dikhate waqt number ko naam mein badal deta hai. Accounts sambhalna junior admin ka sabse common kaam hai.'
      ),
      STORY('An apartment building. Each resident (user) has a flat number (UID) and a key card. Residents also join clubs (groups): the gym club, the library club. A club card opens the club room for all its members. The building manager (root) can make new residents, change cards and remove people who move out.', 'Ek apartment building. Har resident (user) ka flat number (UID) aur key card hota hai. Residents clubs (groups) mein bhi judte hain: gym club, library club. Club card se club ka kamra sab members ke liye khulta hai. Building manager (root) naye resident bana sakta hai, cards badal sakta hai aur jaane wale logon ko hata sakta hai.'),
      H('Where accounts live: three plain text files', 'Accounts kahan rehte hain: teen simple text files'),
      TABLE(
        [
          ['/etc/passwd', 'one line per user: name, UID, GID, comment, home folder, login shell. Everyone can read it.', 'har user ki ek line: naam, UID, GID, comment, home folder, login shell. Sab padh sakte hain.'],
          ['/etc/shadow', 'the password HASHES and ageing rules. Only root can read it.', 'password ke HASH aur ageing rules. Sirf root padh sakta hai.'],
          ['/etc/group', 'one line per group: name, GID, list of members.', 'har group ki ek line: naam, GID, members ki list.'],
        ],
        'File',
        'File'
      ),
      CMD('grep learner /etc/passwd', 'One account line. Let us take it apart in the next picture.', 'Ek account ki line. Ise agli picture mein todenge.'),
      ANAT([
        ['learner', 'cmd', 'login name', 'login naam'],
        ['x', 'op', 'the password is NOT here; "x" means look in /etc/shadow', 'password yahan NAHI hai; "x" matlab /etc/shadow dekho'],
        ['1000', 'opt', 'UID: the user number', 'UID: user number'],
        ['1000', 'opt', 'GID: the number of the main (primary) group', 'GID: main (primary) group ka number'],
        ['Linux Learner,,,', 'arg', 'comment (full name and contact info)', 'comment (poora naam aur contact info)'],
        ['/home/learner', 'arg', 'home folder', 'home folder'],
        ['/bin/bash', 'arg', 'login shell. /usr/sbin/nologin means "nobody can log in with this account"', 'login shell. /usr/sbin/nologin matlab "is account se koi login nahi kar sakta"'],
      ]),
      TIP('UID 0 is root, UIDs below 1000 are system accounts for programs (like www-data for the web server), and normal people start at 1000. Anyone with UID 0 IS root, so checking `awk -F: \'$3==0\' /etc/passwd` is a classic security check.', 'UID 0 root hai, 1000 se neeche ke UID programs ke system accounts hain (jaise web server ka www-data), aur normal log 1000 se shuru hote hain. Jiska UID 0 hai wo root HI hai, isliye `awk -F: \'$3==0\' /etc/passwd` ek classic security check hai.'),
      CMD(['id', 'id root', 'getent passwd www-data', 'getent group sudo'], 'id shows UID, GID and all groups. getent asks the system (not just the file), so it also finds LDAP users on big company networks.', 'id UID, GID aur saare groups dikhata hai. getent system se puchta hai (sirf file se nahi), isliye badi company networks par LDAP users bhi milte hain.'),
      H('Create a user', 'User banao'),
      P('Two commands exist. **useradd** is the low-level tool found on every distro: you must give it options. **adduser** is a friendly Debian/Ubuntu wrapper that asks questions. In scripts and in interviews, know **useradd**.', 'Do commands hain. **useradd** low-level tool hai jo har distro par milta hai: tumhe options dene padte hain. **adduser** Debian/Ubuntu ka friendly wrapper hai jo sawaal puchta hai. Scripts aur interviews mein **useradd** aana chahiye.'),
      ANAT([
        ['sudo useradd', 'cmd', 'create an account (needs root)', 'account banao (root chahiye)'],
        ['-m', 'opt', 'also create the home folder (without -m there is none!)', 'home folder bhi banao (-m ke bina nahi banta!)'],
        ['-s /bin/bash', 'opt', 'login shell', 'login shell'],
        ['-c "Asha Sharma"', 'opt', 'comment: real name', 'comment: asli naam'],
        ['asha', 'arg', 'the login name', 'login naam'],
      ]),
      CMD(['sudo useradd -m -s /bin/bash -c "Asha Sharma" asha', 'getent passwd asha', 'ls -la /home/asha', 'id asha'], 'The new home folder is filled from /etc/skel: a few starter files like .bashrc.', 'Naya home folder /etc/skel se bharta hai: kuch starter files jaise .bashrc.'),
      CMD(['sudo passwd asha'], 'Give the account a password. In the real world you type it twice, and you must NOT see it on the screen. (In this sandbox it just accepts.)', 'Account ko password do. Asli duniya mein do baar type karte ho aur screen par dikhna NAHI chahiye. (Is sandbox mein bas accept ho jata hai.)'),
      CMD(['sudo grep asha /etc/shadow'], 'Now the shadow line has the password hash, or "!" if the account is locked or has no password yet.', 'Ab shadow line mein password hash hai, ya "!" agar account lock hai ya abhi password nahi hai.'),
      H('Groups', 'Groups'),
      P('Each user has one **primary group** (listed in passwd, and new files get this group) and any number of **secondary groups** (listed in /etc/group). Secondary groups are how you give a team access to something.', 'Har user ka ek **primary group** hota hai (passwd mein likha, aur nayi files ko yehi group milta hai) aur kitne bhi **secondary groups** (/etc/group mein). Secondary groups se hi kisi team ko kisi cheez ka access dete ho.'),
      CMD(['sudo groupadd devs', 'sudo usermod -aG devs asha', 'id asha', 'getent group devs'], 'usermod -aG: **a**ppend to the **G**roup list.', 'usermod -aG: group list mein **a**ppend karo.'),
      WARN('Never forget the **-a**. `usermod -G devs asha` (without -a) REPLACES all her secondary groups with just devs, silently removing her from sudo, docker and everything else. This mistake locks people out in real companies.', '**-a** kabhi mat bhoolo. `usermod -G devs asha` (-a ke bina) uske SAARE secondary groups ko sirf devs se BADAL deta hai, chupchap sudo, docker sab se nikal deta hai. Ye galti real companies mein logon ko bahar kar deti hai.'),
      TABLE(
        [
          ['sudo groupadd devs', 'create a group', 'group banao'],
          ['sudo usermod -aG devs asha', 'add asha to devs (keep her other groups)', 'asha ko devs mein jodo (baaki groups rakho)'],
          ['sudo gpasswd -d asha devs', 'remove asha from devs', 'asha ko devs se hatao'],
          ['id -nG asha', 'list her group names', 'uske group ke naam list karo'],
          ['sudo groupdel devs', 'delete a group (must not be anyone\'s primary group)', 'group delete karo (kisi ka primary group nahi hona chahiye)'],
          ['newgrp devs', 'start a shell that uses devs now (or just log out and in)', 'devs ke saath abhi shell shuru karo (ya logout-login)'],
        ],
        'Group commands',
        'Group commands'
      ),
      FUN('Group changes only apply to NEW login sessions. If you add yourself to a group and nothing seems to change, log out and back in, or use newgrp. This confuses beginners all the time.', 'Group badlav sirf NAYE login sessions par lagu hote hain. Khud ko kisi group mein jodne ke baad kuch na badle to logout-login karo ya newgrp use karo. Beginners ko ye hamesha confuse karta hai.'),
      H('Change, lock and remove', 'Badlo, lock karo aur hatao'),
      TABLE(
        [
          ['sudo usermod -s /usr/sbin/nologin asha', 'stop interactive logins (keep the account)', 'interactive login band (account rakho)'],
          ['sudo usermod -L asha  /  sudo passwd -l asha', 'LOCK the password (adds ! to the hash)', 'password LOCK karo (hash mein ! jodta hai)'],
          ['sudo usermod -U asha  /  sudo passwd -u asha', 'unlock', 'unlock'],
          ['sudo usermod -c "A. Sharma" asha', 'change the comment', 'comment badlo'],
          ['sudo userdel asha', 'delete the account (home folder stays)', 'account delete (home folder rehta hai)'],
          ['sudo userdel -r asha', 'delete the account AND its home folder', 'account AUR uska home folder delete'],
          ['passwd -S asha', 'status: L locked, P has a password, NP none', 'status: L locked, P password hai, NP nahi'],
        ],
        'Command',
        'Command'
      ),
      CMD(['sudo passwd -l asha', 'sudo passwd -S asha', 'sudo passwd -u asha'], 'Lock and unlock. A locked account cannot log in with a password, but files and processes stay untouched.', 'Lock aur unlock. Locked account password se login nahi kar sakta, par files aur processes jaise ke taise rehte hain.'),
      H('Password rules: chage', 'Password ke rules: chage'),
      P('Companies force passwords to expire. **chage** (change age) sets the rules per user and shows them with -l.', 'Companies passwords ko expire karwati hain. **chage** (change age) har user ke liye rules set karta hai aur -l se dikhata hai.'),
      CMD(['sudo chage -M 90 -m 1 -W 7 asha', 'sudo chage -l asha'], '-M maximum days, -m minimum days between changes, -W warning days before expiry.', '-M max din, -m badlav ke beech minimum din, -W expiry se pehle warning ke din.'),
      CMD(['sudo chage -d 0 asha', 'sudo chage -l asha | head -2'], 'Make a password expire right now, so the user must choose a new one at the next login. (sudo passwd -e asha does the same.)', 'Password abhi expire karwao, taaki user ko agle login par naya chunna pade. (sudo passwd -e asha bhi yehi karta hai.)'),
      H('Service accounts', 'Service accounts'),
      P('Programs should not run as root. Each service gets its own **system account** with no home and no login. If somebody hacks the program, they only get that little account\'s power.', 'Programs root ke roop mein nahi chalne chahiye. Har service ko apna **system account** milta hai jisme na home hota hai na login. Agar koi program hack kare, use sirf us chhote account ki taakat milti hai.'),
      CMD(['sudo useradd -r -s /usr/sbin/nologin svcapp', 'getent passwd svcapp', 'sudo -u svcapp whoami'], '-r makes a system account (UID below 1000, no home).', '-r system account banata hai (UID 1000 se neeche, home nahi).'),
      H('Who is on the machine?', 'Machine par kaun hai?'),
      TABLE(
        [
          ['whoami', 'my user name', 'mera user naam'],
          ['who  /  w', 'who is logged in now (w also shows what they run)', 'abhi kaun logged in hai (w ye bhi dikhata hai ki wo kya chala rahe hain)'],
          ['last | head', 'history of logins and reboots', 'logins aur reboots ki history'],
          ['lastlog', 'last login time of every account', 'har account ka aakhri login time'],
          ['sudo lastb | head', 'FAILED logins (guessing attacks show up here)', 'FAIL hue logins (guessing attacks yahan dikhte hain)'],
          ['su - asha', 'become asha with her full environment (the - matters)', 'asha ban jao uske poore environment ke saath (- zaroori hai)'],
          ['sudo -u asha cmd', 'run ONE command as asha', 'EK command asha ki tarah chalao'],
        ],
        'Command',
        'Command'
      ),
      THINK('what is the difference between su asha and su - asha?', 'su asha aur su - asha mein kya fark hai?', 'Plain su keeps YOUR folder, variables and PATH, so things can behave oddly. su - (login shell) gives you asha\'s home folder and environment, as if she had logged in. Prefer su -.', 'Simple su TUMHARA folder, variables aur PATH rakhta hai, to cheezein ajeeb ho sakti hain. su - (login shell) tumhe asha ka home folder aur environment deta hai, jaise usne khud login kiya ho. su - prefer karo.'),
      JOB('New joiner checklist: create the account, put them in the right groups, set a password that expires at first login (`chage -d 0`), install their SSH public key. Leaver checklist: lock the account, remove from sudo and other groups, kill their processes, archive the home folder, then delete. Companies audit this, so write it down.', 'Naye joiner ki checklist: account banao, sahi groups mein daalo, aisa password do jo pehle login par expire ho (`chage -d 0`), unki SSH public key lagao. Jaane wale ki checklist: account lock karo, sudo aur doosre groups se hatao, unke processes kill karo, home folder archive karo, phir delete. Companies isko audit karti hain, isliye likh kar rakho.'),
      JOB('Interview favourite: "How do you list all users that can log in?" Answer: look at /etc/passwd for shells that are not nologin or false: `grep -v -E "nologin|false" /etc/passwd`.', 'Interview ka favourite: "Jo users login kar sakte hain unki list kaise nikaloge?" Jawab: /etc/passwd mein wo shells dekho jo nologin ya false nahi hain: `grep -v -E "nologin|false" /etc/passwd`.'),
      CMD('grep -v -E "nologin|false" /etc/passwd', 'Only the accounts that can open a shell.', 'Sirf wo accounts jo shell khol sakte hain.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['useradd -m -s /bin/bash name', 'new user with home', 'home ke saath naya user'],
        ['passwd name', 'set password', 'password set karo'],
        ['usermod -aG group name', 'add to group (keep others)', 'group mein jodo (baaki rakho)'],
        ['usermod -L / -U name', 'lock / unlock', 'lock / unlock'],
        ['chage -l name', 'show password rules', 'password rules dikhao'],
        ['userdel -r name', 'delete with home', 'home ke saath delete'],
        ['id, groups, getent', 'inspect accounts', 'accounts dekho'],
        ['last, lastb, who, w', 'who logged in', 'kaun login hua'],
      ]),
    ],
    missions: [
      M('users-m1', 'Welcome Asha', 'Asha ka swagat karo', 'Create a user called asha with a home folder, the bash shell and the comment "Asha Sharma" (you need sudo).', 'asha naam ka user banao: home folder ke saath, bash shell aur comment "Asha Sharma" (sudo chahiye).', 'useradd needs -m, -s /bin/bash and -c "Asha Sharma". Do not forget sudo.', 'useradd ko -m, -s /bin/bash aur -c "Asha Sharma" chahiye. sudo mat bhoolo.', (sh) => { const u = sh.users.asha; return !!u && u.shell === '/bin/bash' && /Asha Sharma/.test(u.gecos || '') && !!sh.fs.lookup('/home/asha'); }, ['sudo useradd -m -s /bin/bash -c "Asha Sharma" asha']),
      M('users-m2', 'Join the team', 'Team mein shamil ho', 'Create a group called devs and add asha to it WITHOUT removing her other groups. (Create asha first if she does not exist.)', 'devs naam ka group banao aur asha ko usme jodo, uske baaki groups HATAYE BINA. (Asha na ho to pehle banao.)', 'groupadd devs, then usermod -aG devs asha', 'groupadd devs, phir usermod -aG devs asha', (sh) => !!sh.users.asha && sh.users.asha.groups.includes('devs') && sh.users.asha.groups.includes('asha'), ['sudo useradd -m asha', 'sudo groupadd devs', 'sudo usermod -aG devs asha']),
      M('users-m3', 'Offboarding', 'Offboarding', 'Asha is leaving. Lock her account with passwd (or usermod) and set her password to expire after at most 30 days with chage -M 30.', 'Asha ja rahi hai. Uska account passwd (ya usermod) se lock karo aur chage -M 30 se uska password adhiktam 30 din mein expire karwao.', 'sudo passwd -l asha and sudo chage -M 30 asha', 'sudo passwd -l asha aur sudo chage -M 30 asha', (sh) => !!sh.users.asha && sh.users.asha.locked === true && sh.users.asha.maxDays === 30, ['sudo useradd -m asha', 'sudo passwd -l asha', 'sudo chage -M 30 asha']),
    ],
    quiz: [
      mcq(1, 'Which file lists the user accounts of the system?', 'System ke user accounts kis file mein listed hote hain?', ['/etc/users', '/etc/passwd', '/var/accounts', '/home/list'], 1, '/etc/passwd has one line per account.', '/etc/passwd mein har account ki ek line hoti hai.'),
      mcq(2, 'In a /etc/passwd line the second field is "x". What does it mean?', '/etc/passwd line ka doosra field "x" hai. Matlab?', ['The account is disabled', 'The password hash is stored in /etc/shadow', 'The user is an administrator', 'The password is x'], 1, 'The x is a placeholder. The real hash is in /etc/shadow where only root can read it.', 'x sirf placeholder hai. Asli hash /etc/shadow mein hai jise sirf root padh sakta hai.'),
      cmd(3, 'Show only the /etc/passwd line of the user learner.', 'Sirf user learner ki /etc/passwd line dikhao.', { verify: (sh, r) => r.out.trim().startsWith('learner:x:1000') && r.out.trim().split('\n').length === 1, sample: 'grep ^learner /etc/passwd', alt: ['grep "^learner:" /etc/passwd', 'getent passwd learner'], wrong: ['cat /etc/passwd'], hintEn: 'grep for the name in that file.', hintHi: 'Us file mein naam ke liye grep karo.' }, 'grep filters the one line you want. getent passwd learner works too.', 'grep wo ek line nikalta hai jo chahiye. getent passwd learner bhi chalta hai.'),
      cmd(4, 'Create the user bob and make sure his home folder is created too.', 'User bob banao aur dhyan rakho ki uska home folder bhi bane.', { verify: (sh) => !!sh.users.bob && !!sh.fs.lookup('/home/bob'), sample: 'sudo useradd -m bob', alt: ['sudo adduser bob'], wrong: ['sudo useradd bob'], hintEn: 'useradd needs a flag for the home folder.', hintHi: 'Home folder ke liye useradd ko flag chahiye.' }, '-m creates the home folder. Without it the account has none.', '-m home folder banata hai. Iske bina account ka home nahi hota.'),
      mcq(5, 'Which option adds a user to a group while KEEPING the groups they already have?', 'Kaunsa option user ko group mein jodta hai aur uske MAUJOODA groups RAKHTA hai?', ['usermod -G', 'usermod -aG', 'usermod -g', 'usermod -L'], 1, '-a (append) together with -G. Without -a the old secondary groups are replaced.', '-a (append) aur -G saath mein. -a ke bina purane secondary groups badal jate hain.'),
      cmd(6, 'bob is in the group users. Add him to the group team as well, keeping users.', 'bob group users mein hai. Use group team mein bhi jodo, users rakhte hue.', { setup: ['sudo useradd -m -G users bob', 'sudo groupadd team'], verify: (sh) => sh.users.bob.groups.includes('team') && sh.users.bob.groups.includes('users'), sample: 'sudo usermod -aG team bob', alt: ['sudo gpasswd -a bob team', 'sudo adduser bob team'], wrong: ['sudo usermod -G team bob'], hintEn: 'Append, do not replace.', hintHi: 'Append karo, replace nahi.' }, 'usermod -aG appends. usermod -G team would have removed him from users.', 'usermod -aG append karta hai. usermod -G team use users se hata deta.'),
      cmd(7, 'A contractor, bob, has left. Lock his account (do not delete it).', 'Contractor bob chala gaya. Uska account lock karo (delete mat karo).', { setup: ['sudo useradd -m bob'], verify: (sh) => sh.users.bob && sh.users.bob.locked === true, sample: 'sudo passwd -l bob', alt: ['sudo usermod -L bob', 'sudo usermod --lock bob'], wrong: ['sudo userdel bob'], hintEn: 'There is a lock flag on passwd and on usermod.', hintHi: 'passwd aur usermod dono mein lock flag hota hai.' }, 'A locked account cannot log in with a password but keeps its files.', 'Locked account password se login nahi kar sakta par files rehti hain.'),
      cmd(8, 'Force bob to choose a new password at his next login.', 'Bob ko agle login par naya password chunne par majboor karo.', { setup: ['sudo useradd -m bob', 'sudo passwd bob'], verify: (sh) => sh.users.bob.pwdLast === 0, sample: 'sudo chage -d 0 bob', alt: ['sudo passwd -e bob', 'sudo passwd --expire bob'], hintEn: 'Make the password already expired: chage -d 0 or passwd -e.', hintHi: 'Password ko pehle se expired bana do: chage -d 0 ya passwd -e.' }, 'Setting the last-change date to day 0 means the password is expired.', 'Last-change date ko din 0 karne ka matlab password expired hai.'),
      cmd(9, 'Print only the names of accounts with UID 0 (administrator power), using awk on /etc/passwd.', 'awk se /etc/passwd mein sirf UID 0 (administrator power) wale accounts ke naam print karo.', { verify: (sh, r) => r.out.trim() === 'root', sample: "awk -F: '$3==0 {print $1}' /etc/passwd", alt: ['awk -F: \'($3 == 0) { print $1 }\' /etc/passwd'], wrong: ['cat /etc/passwd'], hintEn: 'Fields are separated by a colon. UID is field 3.', hintHi: 'Fields colon se alag hain. UID teesra field hai.' }, 'awk -F: splits on colons, $3==0 tests the UID and $1 is the name.', 'awk -F: colon par todta hai, $3==0 UID check karta hai aur $1 naam hai.'),
      cmd(10, 'Boss level: create a SYSTEM account called svcapp (UID below 1000) that has a nologin shell and no home folder, in one command.', 'Boss level: svcapp naam ka SYSTEM account banao (UID 1000 se neeche) jiska shell nologin ho aur home folder na ho, ek hi command mein.', { verify: (sh) => { const u = sh.users.svcapp; return !!u && u.uid < 1000 && /nologin/.test(u.shell) && !sh.fs.lookup('/home/svcapp'); }, sample: 'sudo useradd -r -s /usr/sbin/nologin svcapp', alt: ['sudo useradd --system --shell /usr/sbin/nologin svcapp', 'sudo useradd -r -s /sbin/nologin svcapp'], wrong: ['sudo useradd -m svcapp'], hintEn: '-r for a system account, -s for the shell.', hintHi: 'System account ke liye -r, shell ke liye -s.' }, '-r makes a low-UID system account without a home, and -s nologin blocks logins.', '-r kam UID ka system account bina home ke banata hai, aur -s nologin login rokta hai.'),
    ],
  });
})();
