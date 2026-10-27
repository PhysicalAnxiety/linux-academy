(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  LX.topics.push({
    id: 'navigate',
    no: 2,
    key: 'cd',
    mins: 25,
    title: T('Moving Around', 'Folders mein ghoomna'),
    blurb: T('Linux keeps everything in one big tree of folders. Learn where you are, what is around you and how to walk anywhere.', 'Linux sab kuch ek bade folders ke ped mein rakhta hai. Seekho tum kahan ho, aas-paas kya hai aur kahin bhi kaise jaana hai.'),
    blocks: [
      BIG(
        'Everything in Linux lives inside **folders** (also called directories). Folders sit inside other folders, like a tree. At the very top is one folder called **root**, written as a single slash **/**. Every file on the computer is somewhere below it.',
        'Linux mein sab kuch **folders** (directories bhi kehte hain) ke andar rehta hai. Folders ke andar aur folders hote hain, bilkul ped ki tarah. Sabse upar ek folder hota hai jise **root** kehte hain, aur use sirf ek slash **/** se likhte hain. Computer ki har file uske neeche kahin na kahin hai.'
      ),
      STORY(
        'Think of a big school building. The main gate is **/**. Inside are floors, inside floors are classrooms, inside classrooms are desks, and inside desks are your notebooks. To find a notebook you walk gate, floor, classroom, desk. That walk is called a **path**.',
        'Ek bade school ki building socho. Main gate hai **/**. Andar floors hain, floors ke andar classrooms, classrooms mein desks, aur desk ke andar tumhari copies. Copy dhoondhne ke liye tum chalte ho gate, floor, classroom, desk. Is raaste ko **path** kehte hain.'
      ),
      H('A map of the tree', 'Ped ka naksha'),
      PRE(`/                      the root, top of everything
├── home                   everybody's personal folders
│   └── learner            YOUR home folder, also written ~
│       ├── Documents
│       ├── Downloads
│       └── Pictures
├── etc                    settings of the whole system
├── var                    things that change: logs, websites
├── usr                    installed programs
├── bin                    the most basic commands (ls, cat ...)
├── tmp                    scratch space, cleaned often
└── root                   the administrator's private home`),
      H('Where am I? pwd', 'Main kahan hoon? pwd'),
      P('**pwd** means "print working directory". It tells you which folder you are standing in right now.', '**pwd** ka matlab "print working directory". Ye batata hai ki tum abhi kis folder mein khade ho.'),
      CMD('pwd', 'You start in your home folder, /home/learner.', 'Tum apne home folder, /home/learner, se shuru karte ho.'),
      H('What is around me? ls', 'Aas-paas kya hai? ls'),
      CMD('ls', 'Lists the files and folders here. Folders show in blue.', 'Yahan ki files aur folders list karta hai. Folders neele rang mein dikhte hain.'),
      CMD('ls -l', 'Long format: one item per line with permissions, owner, size and date.', 'Long format: har item ek line mein, permissions, owner, size aur date ke saath.'),
      CMD('ls -lh', 'Same, but sizes are human friendly (4.0K, 2.3M) instead of raw bytes.', 'Wahi, par sizes aasan padhne layak (4.0K, 2.3M) bytes ki jagah.'),
      CMD('ls -a', 'Also shows hidden files. Their names start with a dot. Look for something secret!', 'Hidden files bhi dikhata hai. Unke naam dot (.) se shuru hote hain. Kuch secret dhoondho!'),
      ANAT([
        ['ls', 'cmd', 'list things', 'cheezein list karo'],
        ['-l', 'opt', 'in the long, detailed format', 'lambe, detail wale format mein'],
        ['-a', 'opt', 'including hidden files (you can join options: **ls -la**)', 'hidden files ke saath bhi (options jod sakte ho: **ls -la**)'],
        ['/etc', 'arg', 'look inside this folder instead of the current one', 'is folder ke andar dekho, abhi wale ke bajaay'],
      ]),
      FUN('Why are some files hidden? Settings files like .bashrc would clutter your view. They start with a dot so that ls skips them unless you ask with -a.', 'Kuch files hidden kyun hain? .bashrc jaisi settings files tumhari list ko bhar deti. Ye dot se shuru hoti hain taaki ls unhe tab tak na dikhaye jab tak tum -a na lagao.'),
      H('Walking around: cd', 'Chalna: cd'),
      P('**cd** means "change directory". Give it the place you want to go.', '**cd** ka matlab "change directory". Use woh jagah do jahan jaana hai.'),
      CMD(['cd Documents', 'pwd', 'ls'], 'Step into Documents, confirm where you are and look around.', 'Documents ke andar jao, confirm karo kahan ho aur aas-paas dekho.'),
      CMD(['cd ..', 'pwd'], 'Two dots mean "the folder above me". This walks one step up.', 'Do dots ka matlab "mere upar wala folder". Ye ek kadam upar le jata hai.'),
      TABLE(
        [
          ['cd Documents', 'go into a folder that is right here', 'yahin maujood folder ke andar jao'],
          ['cd ..', 'go up one level', 'ek level upar jao'],
          ['cd ../..', 'go up two levels', 'do level upar jao'],
          ['cd ~', 'go to your home folder, from anywhere', 'kahin se bhi apne home folder jao'],
          ['cd', 'same as cd ~ (no argument)', 'cd ~ jaisa hi (bina argument)'],
          ['cd -', 'jump back to the folder you were just in', 'abhi jis folder mein the wahan wapas jao'],
          ['cd /', 'go to the very top, the root', 'sabse upar, root par jao'],
        ],
        'What it does',
        'Ye kya karta hai',
        true
      ),
      H('Absolute and relative paths', 'Absolute aur relative path'),
      P(
        'A path that starts with **/** is **absolute**: it begins at the root gate and works from anywhere, like a full home address. A path that does not start with / is **relative**: it starts from where you stand now, like "second door on your left".',
        'Jo path **/** se shuru hota hai woh **absolute** hai: wo root gate se shuru hota hai aur kahin se bhi chalta hai, poore ghar ke address ki tarah. Jo path / se shuru nahi hota woh **relative** hai: wo wahan se shuru hota hai jahan tum abhi khade ho, jaise "doosra darwaza baayein".'
      ),
      CMD(['cd /home/learner/Pictures', 'pwd'], 'Absolute: works no matter where you start.', 'Absolute: tum kahin se bhi shuru karo, chalega.'),
      CMD(['cd ~', 'cd Pictures/holiday', 'pwd'], 'Relative: from home, step into Pictures, then holiday.', 'Relative: home se Pictures, phir holiday ke andar.'),
      TIP('Press **Tab** after typing a few letters, like `cd Doc`, and Linux completes the name. It saves typing and avoids spelling mistakes.', 'Kuch akshar type karke, jaise `cd Doc`, **Tab** dabao aur Linux naam poora kar dega. Typing bachti hai aur spelling ki galti nahi hoti.'),
      CMD('ls /etc', 'You can look inside any folder without going there. Here: the settings folder.', 'Kisi bhi folder ke andar bina wahan gaye dekh sakte ho. Yahan: settings wala folder.'),
      THINK('you are in /home/learner/Documents. What does cd ../Music do?', 'tum /home/learner/Documents mein ho. cd ../Music karne par kya hoga?', 'The .. goes up to /home/learner, then Music goes down into it. You land in /home/learner/Music.', '.. tumhe /home/learner par le jata hai, phir Music ke andar utarta hai. Tum /home/learner/Music mein pahunchoge.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['pwd', 'where am I?', 'main kahan hoon?'],
        ['ls', 'what is here?', 'yahan kya hai?'],
        ['ls -la', 'everything, including hidden, in detail', 'sab kuch, hidden bhi, detail mein'],
        ['ls -lh /var/log', 'peek into another folder, readable sizes', 'doosre folder mein jhaank lo, aasan sizes'],
        ['cd folder', 'go in', 'andar jao'],
        ['cd ..', 'go up', 'upar jao'],
        ['cd ~', 'go home', 'ghar jao'],
        ['cd -', 'go back', 'wapas jao'],
      ]),
      WARN('Folder names with spaces need quotes: `cd "My Photos"`. Without quotes Linux thinks My and Photos are two separate things.', 'Spaces wale folder names ko quotes chahiye: `cd "My Photos"`. Bina quotes ke Linux sochta hai My aur Photos do alag cheezein hain.'),
    ],
    missions: [
      M('nav-m1', 'Find the hidden treasure', 'Chhupa khazana dhoondho', 'There is a hidden file in your home folder. Reveal it with ls and read it with cat to find the secret word.', 'Tumhare home folder mein ek hidden file hai. ls se dikhao aur cat se padho taaki secret word mile.', 'Hidden files start with a dot. Use ls -a, then cat .secret', 'Hidden files dot se shuru hoti hain. ls -a use karo, phir cat .secret', (sh) => sh.log.some((r) => /\.secret/.test(r.cmd) && r.out.includes('PENGUIN')), ['ls -a', 'cat .secret']),
      M('nav-m2', 'Visit the log library', 'Logs ki library jao', 'Walk into /var/log with cd, then list what is inside. Find the file called syslog.', 'cd se /var/log ke andar jao, phir andar kya hai list karo. syslog naam ki file dhoondho.', 'cd /var/log  and then  ls', 'cd /var/log  aur phir  ls', (sh) => sh.log.some((r) => /^\s*cd\s+\/var\/log\/?\s*$/.test(r.cmd)) && sh.log.some((r) => /^\s*ls\b/.test(r.cmd) && r.out.includes('syslog')), ['cd /var/log', 'ls']),
      M('nav-m3', 'Up the stairs', 'Seedhiyan chadho', 'Go down into Documents/recipes, then use .. to climb back up two levels and prove with pwd that you are home again.', 'Documents/recipes ke andar jao, phir .. se do level upar chadho aur pwd se saabit karo ki tum wapas home mein ho.', 'cd Documents/recipes, then cd ../.. and finally pwd.', 'cd Documents/recipes, phir cd ../.. aur aakhir mein pwd.', (sh, last) => !!last && /^\s*pwd\s*$/.test(last.cmd) && last.out.trim() === '/home/learner' && sh.log.some((r) => /cd\s+\.\./.test(r.cmd)) && sh.log.some((r) => /cd\s+.*recipes/.test(r.cmd)), ['cd Documents/recipes', 'cd ../..', 'pwd']),
    ],
    quiz: [
      mcq(1, 'Which command tells you which folder you are in right now?', 'Kaun si command batati hai ki tum abhi kis folder mein ho?', ['ls', 'pwd', 'cd', 'echo'], 1, 'pwd stands for print working directory.', 'pwd ka matlab print working directory.'),
      mcq(2, 'What does the tilde ~ stand for?', 'Tilde ~ ka matlab kya hai?', ['The root folder', 'The trash can', 'Your home folder', 'The previous folder'], 2, '~ is a shortcut to your home folder, here /home/learner.', '~ tumhare home folder ka shortcut hai, yahan /home/learner.'),
      mcq(3, 'What is the single slash / at the top of the folder tree called?', 'Folder ke ped ke sabse upar wale ek slash / ko kya kehte hain?', ['Home', 'Root', 'Desktop', 'Base'], 1, 'The root directory / contains every other file and folder.', 'Root directory / mein baaki har file aur folder aata hai.'),
      cmd(4, 'List ALL files in the current folder, including the hidden ones.', 'Current folder ki SAARI files list karo, hidden wali bhi.', { verify: (sh, r, c) => /^\s*ls\b/.test(c) && r.out.includes('.secret'), sample: 'ls -a', wrong: ['ls'], alt: ['ls -la', 'ls -A', 'ls -al'], hintEn: 'Add an option to ls. The letter is the first of all.', hintHi: 'ls mein ek option lagao. Akshar all ka pehla akshar hai.' }, 'ls -a (or -A) shows entries whose names start with a dot.', 'ls -a (ya -A) un entries ko dikhata hai jinke naam dot se shuru hote hain.'),
      mcq(5, 'You are in /home/learner/Documents. What does  cd ..  do?', 'Tum /home/learner/Documents mein ho.  cd ..  karne se kya hoga?', ['Goes to the root', 'Goes one folder up to /home/learner', 'Stays in the same place', 'Deletes the folder'], 1, 'Two dots always mean the parent folder, the one just above.', 'Do dots ka matlab hamesha parent folder, jo bilkul upar hota hai.'),
      cmd(6, 'In ONE line, go into Documents/recipes and then print where you are.', 'EK line mein Documents/recipes ke andar jao aur phir print karo ki tum kahan ho.', { verify: (sh, r) => r.out.trim() === '/home/learner/Documents/recipes', sample: 'cd Documents/recipes && pwd', wrong: ['cd Documents && pwd'], alt: ['cd ~/Documents/recipes; pwd', 'cd /home/learner/Documents/recipes && pwd'], hintEn: 'Join two commands with && or ;', hintHi: 'Do commands ko && ya ; se jodo.' }, 'cd moves you; pwd confirms it. && runs the second command only if the first worked.', 'cd tumhe le jata hai; pwd confirm karta hai. && doosri command tabhi chalata hai jab pehli kaamyab ho.'),
      mcq(7, 'You are in /home/learner/Documents. Which is the absolute path of  ../Pictures ?', 'Tum /home/learner/Documents mein ho.  ../Pictures  ka absolute path kaun sa hai?', ['/home/learner/Documents/Pictures', '/Pictures', '/home/learner/Pictures', '/home/Pictures'], 2, '.. climbs from Documents to /home/learner, then Pictures goes down. So /home/learner/Pictures.', '.. Documents se /home/learner par chadhta hai, phir Pictures mein utarta hai. To /home/learner/Pictures.'),
      cmd(8, 'Show the Downloads folder in the long format with human-readable sizes (like 700M).', 'Downloads folder ko long format mein human-readable sizes (jaise 700M) ke saath dikhao.', { verify: (sh, r, c) => /^\s*ls\b/.test(c) && r.out.includes('movie.mp4') && /\d\d+M/.test(r.out) && /^[-d]r/m.test(r.out), sample: 'ls -lh Downloads', alt: ['ls -hl Downloads', 'ls -l -h Downloads', 'ls -lh ~/Downloads'], wrong: ['ls -l Downloads'], hintEn: 'Two options: l for long, h for human.', hintHi: 'Do options: l matlab long, h matlab human.' }, '-l gives the long format and -h turns byte counts into K, M and G.', '-l long format deta hai aur -h byte counts ko K, M aur G mein badal deta hai.'),
      cmd(9, 'You are in ~/Documents. In ONE line jump to /etc and come straight back to where you were. The last thing printed must be your original folder.', 'Tum ~/Documents mein ho. EK line mein /etc par jao aur seedha wapas aao jahan the. Aakhir mein print hone wali cheez tumhara original folder honi chahiye.', { cwd: 'Documents', verify: (sh, r, c) => r.out.trim().split('\n').pop() === '/home/learner/Documents' && /cd\s+-/.test(c), sample: 'cd /etc && cd -', hintEn: 'There is a cd option that means "go back".', hintHi: 'cd ka ek option hai jiska matlab "wapas jao".' }, 'cd - jumps to the previous folder and prints its name.', 'cd - pichle folder par jata hai aur uska naam print karta hai.'),
      cmd(10, 'Boss level: you are in ~/Documents/recipes. List the files in ~/Pictures/holiday using a RELATIVE path: no ~ and no leading slash allowed.', 'Boss level: tum ~/Documents/recipes mein ho. ~/Pictures/holiday ki files RELATIVE path se list karo: ~ aur shuru ka slash nahi chalega.', { cwd: 'Documents/recipes', verify: (sh, r, c) => r.out.includes('beach.jpg') && !/~|(^|\s)\//.test(c), sample: 'ls ../../Pictures/holiday', hintEn: 'Climb two levels up with .. twice, then walk down.', hintHi: 'Do baar .. se do level upar jao, phir neeche utro.' }, 'From recipes: .. is Documents, ../.. is home, so ../../Pictures/holiday is the target.', 'recipes se: .. Documents hai, ../.. home hai, to ../../Pictures/holiday manzil hai.'),
    ],
  });
})();
