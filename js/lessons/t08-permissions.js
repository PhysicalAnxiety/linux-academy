(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  LX.topics.push({
    id: 'permissions',
    no: 8,
    key: 'chmod',
    mins: 30,
    title: T('Users and Permissions', 'Users aur Permissions'),
    blurb: T('Linux is a multi-person computer. Learn who may read, write and run what, and how the all-powerful root user fits in.', 'Linux ek multi-person computer hai. Seekho kaun kya padh, likh aur chala sakta hai, aur sabse taakatwar root user kahan fit hota hai.'),
    blocks: [
      BIG(
        'Linux was built for many people to share one computer safely. Every file has an **owner**, a **group** and three kinds of permission: **r** (read), **w** (write) and **x** (execute, meaning run it or enter the folder). The permissions are given separately to the owner, to the group and to everybody else.',
        'Linux ek computer ko kai log safely share karein isliye bana tha. Har file ka ek **owner**, ek **group** aur teen tarah ki permission hoti hai: **r** (read), **w** (write) aur **x** (execute, yaani use chalao ya folder ke andar jao). Ye permissions owner, group aur baaki sabko alag-alag di jati hain.'
      ),
      STORY('Think of a school. The class teacher (owner) can open and change the class register. The other teachers of the class (group) can open it but not change it. Visitors (everyone else) cannot touch it. The principal (root) has keys to every room.', 'School socho. Class teacher (owner) class register khol aur badal sakti hain. Class ke doosre teachers (group) use khol sakte hain par badal nahi sakte. Visitors (baaki sab) use chhu nahi sakte. Principal (root) ke paas har kamre ki chaabi hai.'),
      H('Reading the permission string', 'Permission string padhna'),
      CMD('ls -l poem.txt', 'Look at the first column: -rw-r--r--', 'Pehla column dekho: -rw-r--r--'),
      PRE(`  -  rw-  r--  r--   1 learner learner   67 Oct 21 20:59 poem.txt
  |   |    |    |         |       |
  |   |    |    |         |       +-- group that owns it
  |   |    |    |         +---------- user that owns it
  |   |    |    +-------------------- everybody else (other): read only
  |   |    +------------------------- group:                 read only
  |   +------------------------------ owner (user):          read and write
  +---------------------------------- type: - file, d directory, l link`),
      ANAT([
        ['-', 'op', 'a normal file (a d here would mean directory)', 'normal file (yahan d hota to directory)'],
        ['rw-', 'cmd', 'owner: can read, can write, cannot run', 'owner: padh sakta, likh sakta, chala nahi sakta'],
        ['r--', 'opt', 'group: can only read', 'group: sirf padh sakta'],
        ['r--', 'arg', 'others: can only read', 'baaki sab: sirf padh sakte'],
      ]),
      H('What r, w and x mean', 'r, w aur x ka matlab'),
      TABLE(
        [
          ['r  (read)', 'on a file: see the content. On a folder: list the names inside.', 'file par: content dekho. Folder par: andar ke naam list karo.'],
          ['w  (write)', 'on a file: change it. On a folder: add, rename or delete things inside.', 'file par: badlo. Folder par: andar cheezein jodo, rename ya delete karo.'],
          ['x  (execute)', 'on a file: run it as a program or script. On a folder: step inside with cd.', 'file par: program ya script ki tarah chalao. Folder par: cd se andar jao.'],
        ],
        'Letter',
        'Akshar'
      ),
      H('chmod: change the permissions', 'chmod: permissions badlo'),
      P('There are two ways to say what you want. The **symbolic** way uses letters: who (**u** owner, **g** group, **o** others, **a** all), then **+** to add or **-** to remove, then the permission. The **number** way adds up r=4, w=2, x=1 for each of the three groups.', 'Batane ke do tareeke hain. **Symbolic** tareeka akshar use karta hai: kiske liye (**u** owner, **g** group, **o** others, **a** sab), phir **+** jodne ke liye ya **-** hatane ke liye, phir permission. **Number** wala tareeka teeno groups ke liye r=4, w=2, x=1 jodta hai.'),
      TABLE(
        [
          ['chmod +x script.sh', 'let everybody run it', 'sabko chalane do'],
          ['chmod u+x script.sh', 'only the owner may run it', 'sirf owner chala sakta hai'],
          ['chmod go-w file', 'take write away from group and others', 'group aur others se write le lo'],
          ['chmod 644 file', 'owner rw-, group r--, others r--', 'owner rw-, group r--, others r--'],
          ['chmod 755 script.sh', 'owner rwx, group r-x, others r-x', 'owner rwx, group r-x, others r-x'],
          ['chmod 600 secret.txt', 'owner rw-, nobody else anything', 'owner rw-, baaki kisi ko kuch nahi'],
        ],
        'Command',
        'Command'
      ),
      PRE(`The number trick:       r = 4     w = 2     x = 1

  rwx = 4+2+1 = 7          r-x = 4+0+1 = 5
  rw- = 4+2+0 = 6          r-- = 4+0+0 = 4
  ---  = 0

  chmod 754 file  =  owner 7 (rwx)  group 5 (r-x)  others 4 (r--)`),
      THINK('what is the number for rw-r-----?', 'rw-r----- ka number kya hoga?', 'Owner rw- = 6, group r-- = 4, others --- = 0. So 640.', 'Owner rw- = 6, group r-- = 4, others --- = 0. To 640.'),
      H('Make a script runnable', 'Script ko runnable banao'),
      P('Files are not runnable by default. hello.sh in the projects folder is a script that says hello, but it has no x permission yet. Try to run it, fix it and run it again.', 'Files default mein runnable nahi hoti. projects folder ki hello.sh ek script hai jo hello bolti hai, par abhi uspe x permission nahi hai. Chalane ki koshish karo, theek karo aur dobara chalao.'),
      CMD(['cd projects', 'ls -l hello.sh', './hello.sh'], 'Permission denied: no x bit. (The ./ means "this file in this folder".)', 'Permission denied: x bit nahi hai. (./ ka matlab "is folder ki ye file".)'),
      CMD(['chmod +x hello.sh', 'ls -l hello.sh', './hello.sh'], 'Now the permission string has x and the script runs. Notice the file turns green in ls.', 'Ab permission string mein x hai aur script chalti hai. Dekho ls mein file hari ho gayi.'),
      H('root and sudo', 'root aur sudo'),
      P('The user called **root** is the administrator who can do anything. Because that is dangerous, you normally work as a regular user and borrow root powers for one command at a time by putting **sudo** in front of it ("super user do").', '**root** naam ka user administrator hai jo kuch bhi kar sakta hai. Ye khatarnaak hota hai, isliye tum normally regular user ki tarah kaam karte ho aur ek command ke liye root ki taakat udhaar lete ho uske aage **sudo** ("super user do") laga kar.'),
      CMD('cat /etc/shadow', 'This file holds password data, so only root may read it. Permission denied is the right answer.', 'Is file mein password data hota hai, isliye sirf root ise padh sakta hai. Permission denied sahi jawab hai.'),
      CMD('sudo cat /etc/shadow', 'Same command with sudo works. In a real terminal it asks for YOUR password first. In this sandbox type anything.', 'Wahi command sudo ke saath chalti hai. Asli terminal pehle TUMHARA password maangta hai. Is sandbox mein kuch bhi type karo.'),
      WARN('With sudo there is no safety net. `sudo rm -rf` can destroy the whole system. Use sudo only when you understand the command and only when you really need it.', 'sudo ke saath koi safety net nahi hota. `sudo rm -rf` poora system tabah kar sakta hai. sudo tabhi use karo jab command samajh aati ho aur sach mein zaroorat ho.'),
      H('Who am I? Users and groups', 'Main kaun hoon? Users aur groups'),
      CMD('id', 'Your user number, group number and every group you belong to. Being in the sudo group is what allows you to use sudo.', 'Tumhara user number, group number aur har group jisme tum ho. sudo group mein hona hi tumhe sudo use karne deta hai.'),
      CMD('groups', 'Just the names of your groups.', 'Sirf tumhare groups ke naam.'),
      CMD('cat /etc/passwd | head -n 3', 'The list of all users lives in /etc/passwd (despite the name, no passwords are inside).', 'Saare users ki list /etc/passwd mein hoti hai (naam ke bawajood, andar passwords nahi hote).'),
      CMD(['sudo useradd -m asha', 'tail -n 1 /etc/passwd', 'ls /home'], 'The administrator can add users. -m also makes the home folder.', 'Administrator users jod sakta hai. -m home folder bhi banata hai.'),
      CMD(['touch mine.txt', 'sudo chown root mine.txt', 'ls -l mine.txt', 'echo hi > mine.txt'], 'chown changes the owner. Now it belongs to root, and you can no longer write to it.', 'chown owner badalta hai. Ab wo root ki hai, aur tum usme likh nahi sakte.'),
      TIP('Permission denied is not a bug, it is the system doing its job. Read the error, then ask: who owns this? what are its permissions? do I really need to change it?', 'Permission denied bug nahi hai, system apna kaam kar raha hai. Error padho, phir pucho: iska owner kaun hai? permissions kya hain? kya mujhe sach mein ise badalna hai?'),
      FUN('A folder needs x to be entered. Try  cd /root  and see: only root can walk into that private home.', 'Folder mein jaane ke liye x chahiye. Try karo  cd /root  aur dekho: us private home mein sirf root ja sakta hai.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['ls -l', 'show permissions', 'permissions dikhao'],
        ['chmod +x file', 'make runnable', 'runnable banao'],
        ['chmod 644 file', 'rw-r--r--', 'rw-r--r--'],
        ['chmod 755 file', 'rwxr-xr-x', 'rwxr-xr-x'],
        ['chmod 600 file', 'private to owner', 'sirf owner ke liye private'],
        ['sudo cmd', 'run as administrator', 'administrator ki tarah chalao'],
        ['chown user file', 'change the owner (needs sudo)', 'owner badlo (sudo chahiye)'],
        ['id / groups / whoami', 'who am I?', 'main kaun hoon?'],
      ]),
    ],
    missions: [
      M('perm-m1', 'Wake up the script', 'Script ko jagao', 'The script ~/projects/hello.sh is not runnable. Give it the x permission and run it so that it prints its greeting.', '~/projects/hello.sh script runnable nahi hai. Use x permission do aur chalao taaki wo apna greeting print kare.', 'cd projects, chmod +x hello.sh, then ./hello.sh', 'cd projects, chmod +x hello.sh, phir ./hello.sh', (sh) => (sh.stat('~/projects/hello.sh').mode & 0o111) !== 0 && sh.log.some((r) => /hello\.sh/.test(r.cmd) && r.out.includes('Hello from my first script!')), ['cd projects', 'chmod +x hello.sh', './hello.sh']),
      M('perm-m2', 'Lock the diary', 'Diary par taala lagao', 'Create a file called secret_diary.txt and make it private: only you may read and write it, nobody else anything (600).', 'secret_diary.txt naam ki file banao aur use private banao: sirf tum padh aur likh sako, baaki kisi ko kuch nahi (600).', 'touch secret_diary.txt, then chmod 600 secret_diary.txt', 'touch secret_diary.txt, phir chmod 600 secret_diary.txt', (sh) => sh.modeOf('~/secret_diary.txt') === '600', ['touch secret_diary.txt', 'chmod 600 secret_diary.txt']),
      M('perm-m3', 'Borrow the boss powers', 'Boss ki taakat udhaar lo', 'Read the password-data file /etc/shadow by running cat with sudo in front.', 'cat ke aage sudo lagakar password-data wali file /etc/shadow padho.', 'sudo cat /etc/shadow', 'sudo cat /etc/shadow', (sh) => sh.log.some((r) => /^\s*sudo\s+cat\s+\/etc\/shadow/.test(r.cmd) && r.out.includes('root:')), ['sudo cat /etc/shadow']),
    ],
    quiz: [
      mcq(1, 'What do the letters r, w and x stand for?', 'Akshar r, w aur x ka kya matlab hai?', ['read, write, execute', 'run, wait, exit', 'remove, write, extract', 'root, white, xenon'], 0, 'Read, write and execute.', 'Read, write aur execute.'),
      mcq(2, 'A file shows  -rwxr-xr--  . What may the GROUP do?', 'Ek file  -rwxr-xr--  dikhati hai. GROUP kya kar sakta hai?', ['Read, write and execute', 'Read and execute', 'Only read', 'Nothing'], 1, 'The middle triple r-x means read and execute, but no write.', 'Beech ka triple r-x matlab read aur execute, par write nahi.'),
      mcq(3, 'What number stands for rwx?', 'rwx ka number kya hai?', ['3', '5', '6', '7'], 3, '4 + 2 + 1 = 7.', '4 + 2 + 1 = 7.'),
      cmd(4, 'You are in ~/projects. Make hello.sh executable.', 'Tum ~/projects mein ho. hello.sh ko executable banao.', { cwd: 'projects', verify: (sh) => (sh.stat('~/projects/hello.sh').mode & 0o111) !== 0, sample: 'chmod +x hello.sh', alt: ['chmod 755 hello.sh', 'chmod u+x hello.sh'], wrong: ['ls -l hello.sh'], hintEn: 'chmod, then +x, then the file.', hintHi: 'chmod, phir +x, phir file.' }, '+x adds the execute permission.', '+x execute permission jodta hai.'),
      mcq(5, 'What do the permissions look like after  chmod 644 file ?', ' chmod 644 file  ke baad permissions kaisi dikhti hain?', ['rwxr--r--', 'rw-r--r--', 'rw-rw-rw-', 'r--r--r--'], 1, '6 = rw-, 4 = r--, 4 = r--.', '6 = rw-, 4 = r--, 4 = r--.'),
      cmd(6, 'Make notes.txt private: owner can read and write, nobody else can do anything.', 'notes.txt ko private banao: owner padh aur likh sake, baaki koi kuch na kar sake.', { verify: (sh) => sh.modeOf('notes.txt') === '600', sample: 'chmod 600 notes.txt', alt: ['chmod u=rw,go= notes.txt', 'chmod go-rwx notes.txt'], wrong: ['chmod 644 notes.txt'], hintEn: 'rw- for owner is 6, --- for the rest is 0 and 0.', hintHi: 'Owner ke liye rw- yaani 6, baaki ke liye --- yaani 0 aur 0.' }, '600 means rw------- .', '600 matlab rw------- .'),
      cmd(7, 'Read /etc/shadow as the administrator.', 'Administrator ban kar /etc/shadow padho.', { verify: (sh, r, c) => /sudo/.test(c) && r.out.includes('root:'), sample: 'sudo cat /etc/shadow', wrong: ['cat /etc/shadow'], hintEn: 'Borrow root powers for one command.', hintHi: 'Ek command ke liye root ki taakat udhaar lo.' }, 'sudo runs just that one command with root powers.', 'sudo sirf wahi ek command root ki taakat se chalata hai.'),
      cmd(8, 'todo.txt is private right now. Make it so the owner can read and write, and everybody else can only read.', 'todo.txt abhi private hai. Aisa karo ki owner padh aur likh sake, aur baaki sab sirf padh sakein.', { setup: ['chmod 600 todo.txt'], verify: (sh) => sh.modeOf('todo.txt') === '644', sample: 'chmod 644 todo.txt', alt: ['chmod u=rw,go=r todo.txt', 'chmod go+r todo.txt'], hintEn: 'rw- r-- r-- as numbers.', hintHi: 'rw- r-- r-- ko numbers mein likho.' }, '644 = rw-r--r--.', '644 = rw-r--r--.'),
      cmd(9, 'Remove the write permission from the owner of poem.txt, so it becomes read-only for everybody.', 'poem.txt ke owner se write permission hata do, taaki wo sabke liye read-only ho jaye.', { verify: (sh) => sh.modeOf('poem.txt') === '444', sample: 'chmod u-w poem.txt', alt: ['chmod 444 poem.txt', 'chmod a-w poem.txt'], hintEn: 'u is the owner, minus removes, w is write.', hintHi: 'u matlab owner, minus hatata hai, w matlab write.' }, 'u-w removes write from the owner: 644 becomes 444.', 'u-w owner se write hata deta hai: 644 se 444 ho jata hai.'),
      cmd(10, 'Boss level: in ONE line create run.sh containing  echo Hi , make it executable and run it. The output must be Hi.', 'Boss level: EK line mein run.sh banao jisme  echo Hi  ho, use executable banao aur chalao. Output Hi hona chahiye.', { verify: (sh, r) => r.out.trim() === 'Hi' && (sh.stat('run.sh').mode & 0o111) !== 0, sample: "echo 'echo Hi' > run.sh && chmod +x run.sh && ./run.sh", alt: ['echo "echo Hi" > run.sh && chmod +x run.sh && ./run.sh'], hintEn: 'Three steps joined by &&: write, chmod, run with ./', hintHi: 'Teen steps && se jude: likho, chmod, ./ se chalao.' }, 'Write the script with >, add x with chmod, then run it with ./ .', 'Script > se likho, chmod se x jodo, phir ./ se chalao.'),
    ],
  });
})();
