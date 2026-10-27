(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, CMD, TABLE, ANAT, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  LX.topics.push({
    id: 'intro',
    no: 1,
    key: '$',
    mins: 15,
    title: T('Hello, Linux!', 'Namaste, Linux!'),
    blurb: T('What Linux is, what a terminal is, and your very first commands. No experience needed.', 'Linux kya hai, terminal kya hai, aur tumhari pehli commands. Pehle se kuch aana zaroori nahi.'),
    blocks: [
      BIG(
        "**Linux** is an operating system (OS). An OS is the boss program that runs a computer: it makes the screen, keyboard, memory and apps work together. Windows, macOS and Android are operating systems too. Linux is free, and anyone can read it and make it better.",
        "**Linux** ek operating system (OS) hai. OS woh boss program hota hai jo computer ko chalata hai: screen, keyboard, memory aur apps ko saath mein kaam karwata hai. Windows, macOS aur Android bhi operating system hain. Linux free hai, aur koi bhi use padh kar behtar bana sakta hai."
      ),
      H('Where is Linux hiding?', 'Linux kahan chhupa hai?'),
      P(
        'You use Linux every day without knowing it. Most websites run on Linux computers. Android phones are built on Linux. Smart TVs, WiFi routers and even computers on space missions use it too.',
        'Tum roz Linux use karte ho par pata nahi chalta. Zyada tar websites Linux computers par chalti hain. Android phones Linux par bane hain. Smart TV, WiFi router aur space missions ke computers bhi Linux use karte hain.'
      ),
      STORY(
        'Imagine a restaurant. You are the customer. The kitchen cooks the food: that is the **kernel**, the part that really works with the hardware. You never walk into the kitchen. You talk to a waiter, the **shell**, who understands your order and tells the kitchen. The little notepad you write your order on is the **terminal**.',
        'Socho ek restaurant hai. Tum customer ho. Kitchen khana banata hai: yahi **kernel** hai, jo hardware ke saath asli kaam karta hai. Tum seedha kitchen mein nahi jaate. Tum waiter se baat karte ho, yaani **shell**, jo tumhara order samajh kar kitchen ko batata hai. Jis chhote notepad par tum order likhte ho, wahi **terminal** hai.'
      ),
      H('Four words to remember', 'Chaar words yaad rakho'),
      STEPS([
        ['**Kernel**: the heart of Linux. It talks to the hardware (CPU, memory, disk).', '**Kernel**: Linux ka dil. Ye hardware (CPU, memory, disk) se baat karta hai.'],
        ['**Shell**: the program that reads the commands you type. The most popular one is called **bash**.', '**Shell**: woh program jo tumhari type ki hui commands padhta hai. Sabse popular ka naam **bash** hai.'],
        ['**Terminal**: the window where you type. It is just a screen for the shell.', '**Terminal**: woh window jahan tum type karte ho. Ye shell ki ek screen hai bas.'],
        ['**Distribution (distro)**: Linux packed together with apps, like Ubuntu, Debian or Fedora. Same ice cream, different flavours!', '**Distribution (distro)**: Linux apps ke saath pack hokar, jaise Ubuntu, Debian ya Fedora. Ek hi ice cream, alag flavours!'],
      ]),
      FUN(
        'Linux was started in 1991 by a student in Finland called Linus Torvalds, as a hobby. Its mascot is a penguin named **Tux**.',
        'Linux ko 1991 mein Finland ke ek student Linus Torvalds ne hobby ke taur par shuru kiya tha. Iska mascot ek penguin hai jiska naam **Tux** hai.'
      ),
      H('Why type when I can click?', 'Click kar sakte hain to type kyun?'),
      P(
        'Clicking is great for small jobs. Typing wins for big jobs: rename 1000 photos in one second, search inside thousands of files, or control a computer that is far away. Almost every programmer and server administrator uses the terminal every day.',
        'Click karna chhote kaamon ke liye badhiya hai. Bade kaamon mein typing jeet jaati hai: 1000 photos ka naam ek second mein badlo, hazaaron files ke andar search karo, ya door rakhe computer ko control karo. Lagbhag har programmer aur server administrator roz terminal use karta hai.'
      ),
      H('Read your prompt', 'Apna prompt padho'),
      P(
        'Look at the terminal next to this lesson. Before every command you see a prompt. It is the computer saying: I am ready, tell me what to do.',
        'Is lesson ke bagal wale terminal ko dekho. Har command se pehle ek prompt dikhta hai. Ye computer ka tareeka hai kehne ka: main ready hoon, batao kya karna hai.'
      ),
      ANAT([
        ['learner', 'cmd', 'Your **user name**: who is logged in.', 'Tumhara **user name**: kaun logged in hai.'],
        ['@', 'op', 'Just the word "at".', 'Bas "at" ka matlab.'],
        ['linux-school', 'arg', 'The **computer name**.', 'Computer ka **naam**.'],
        ['~', 'opt', 'Where you are right now. **~** means your home folder.', 'Tum abhi kahan ho. **~** matlab tumhara home folder.'],
        ['$', 'op', 'I am ready. (A normal user sees $, the administrator sees #.)', 'Main ready hoon. (Normal user ko $ dikhta hai, administrator ko #.)'],
      ]),
      H('Anatomy of a command', 'Command ka anatomy'),
      P(
        'Most commands have three parts in a row: the **command**, then **options**, then **arguments**.',
        'Zyada tar commands mein teen hisse ek line mein hote hain: **command**, phir **options**, phir **arguments**.'
      ),
      ANAT([
        ['ls', 'cmd', 'The **command**: what to do (list things).', '**Command**: kya karna hai (cheezein list karo).'],
        ['-l', 'opt', 'An **option** (also called a flag): how to do it. Here: long and detailed.', 'Ek **option** (flag bhi kehte hain): kaise karna hai. Yahan: lamba aur detail mein.'],
        ['Documents', 'arg', 'The **argument**: what to do it on. Here: the Documents folder.', '**Argument**: kis par karna hai. Yahan: Documents folder.'],
      ]),
      CMD('ls -l Documents', 'Run it and look. Spaces matter: they separate the three parts.', 'Chala kar dekho. Spaces zaroori hain: ye teeno hisson ko alag karte hain.'),
      H('Your first commands', 'Tumhari pehli commands'),
      CMD('whoami', 'Asks: who am I? It prints your user name.', 'Poochta hai: main kaun hoon? Tumhara user name print karta hai.'),
      CMD('hostname', 'Prints the name of this computer.', 'Is computer ka naam print karta hai.'),
      CMD('date', 'Shows today\'s date and time.', 'Aaj ki date aur time dikhata hai.'),
      CMD('echo "Namaste, Linux!"', 'echo repeats whatever you give it, like a parrot. The quotes keep the words together.', 'echo jo bhi do use dohrata hai, tote ki tarah. Quotes shabdon ko saath rakhte hain.'),
      CMD('uname -a', 'Tells you which system you are on: the word Linux, its version and more.', 'Batata hai tum kis system par ho: Linux ka naam, uska version aur bhi kaafi kuch.'),
      H('Little boxes called variables', 'Variables: chhote dabbe'),
      P(
        'The computer keeps small facts in labelled boxes. A box name starts with **$**. Try printing what is inside a few of them.',
        'Computer chhoti baatein naam wale dabbon mein rakhta hai. Dabbe ka naam **$** se shuru hota hai. Kuch dabbon ke andar kya hai print karke dekho.'
      ),
      TRY('Print the content of these boxes:', 'In dabbon ke andar kya hai print karo:', ['echo $USER', 'echo $HOSTNAME', 'echo $HOME', 'echo "I am $USER on $HOSTNAME"']),
      H('Three tricks that save hours', 'Teen tricks jo ghanton bachate hain'),
      STEPS([
        ['Press the **Up arrow** to bring back your previous command.', '**Up arrow** dabao, pichli command wapas aa jayegi.'],
        ['Press **Tab** while typing and Linux finishes the word for you.', 'Type karte waqt **Tab** dabao, Linux shabd khud poora kar deta hai.'],
        ['Press **Ctrl+C** to stop anything that is stuck or running too long. **Ctrl+L** (or the command clear) cleans the screen.', 'Kuch atak jaye ya bahut der chale to **Ctrl+C** dabao. Screen saaf karne ke liye **Ctrl+L** (ya command clear) dabao.'],
      ]),
      WARN(
        'Linux is **case-sensitive**: `date` works but `Date` does not. Also, almost nothing says "Success!". When a command prints nothing, that usually means it worked.',
        'Linux **case-sensitive** hai: `date` chalega par `Date` nahi. Aur lagbhag kuch bhi "Success!" nahi bolta. Jab command kuch print na kare, to aksar matlab hota hai ki kaam ho gaya.'
      ),
      THINK(
        'what happens if you type Date with a capital D?',
        'agar capital D se Date type karo to kya hoga?',
        'You will see **Date: command not found**. Linux treats Date and date as two different names. Try it below!',
        'Tumhe **Date: command not found** dikhega. Linux ke liye Date aur date do alag naam hain. Neeche try karo!'
      ),
      CMD('Date', 'Run it on purpose and read the error. Errors are friends: they tell you what to fix.', 'Jaan-boojh kar chalao aur error padho. Errors dost hote hain: batate hain kya theek karna hai.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['whoami', 'prints your user name', 'tumhara user name print karta hai'],
        ['hostname', 'prints the computer name', 'computer ka naam print karta hai'],
        ['date', 'shows date and time', 'date aur time dikhata hai'],
        ['echo hello', 'prints the words you give it', 'jo shabd do wahi print karta hai'],
        ['uname -a', 'shows system information', 'system ki jaankari dikhata hai'],
        ['clear', 'cleans the screen', 'screen saaf karta hai'],
      ]),
    ],
    missions: [
      M('intro-m1', 'Make it speak', 'Isse bulwao', 'Use echo to make the computer say your own name, or any sentence you like.', 'echo ka use karke computer se apna naam ya koi bhi sentence bulwao.', 'Type echo, a space, then your words. Example: echo Hello Aarav', 'echo likho, ek space, phir apne shabd. Jaise: echo Hello Aarav', (sh) => sh.log.some((r) => /^\s*echo\s+\S/.test(r.cmd) && r.code === 0), ['echo Hello from me']),
      M('intro-m2', 'Who and where?', 'Kaun aur kahan?', 'Find out your user name and the name of this computer. Run both whoami and hostname.', 'Apna user name aur is computer ka naam pata karo. whoami aur hostname dono chalao.', 'Two separate commands. Run one, press Enter, then the other.', 'Do alag commands. Ek chalao, Enter dabao, phir doosri.', (sh) => sh.log.some((r) => /^\s*whoami\s*$/.test(r.cmd)) && sh.log.some((r) => /^\s*hostname\s*$/.test(r.cmd)), ['whoami', 'hostname']),
      M('intro-m3', 'Break it on purpose', 'Jaan-boojh kar galti karo', 'Type a command that does not exist, like pizza, and read the error message.', 'Aisi command type karo jo exist nahi karti, jaise pizza, aur error message padho.', 'Any made-up word works. Linux will answer: command not found.', 'Koi bhi banaya hua shabd chalega. Linux jawab dega: command not found.', (sh) => sh.log.some((r) => r.code === 127), ['pizza']),
    ],
    quiz: [
      mcq(1, 'What is Linux?', 'Linux kya hai?', ['An operating system', 'A web browser', 'A video game', 'A phone brand'], 0, 'Linux is an operating system: the boss program that runs a computer.', 'Linux ek operating system hai: woh boss program jo computer ko chalata hai.'),
      mcq(2, 'What is the name of the Linux penguin mascot?', 'Linux ke penguin mascot ka naam kya hai?', ['Tux', 'Pingu', 'Linus', 'Gnu'], 0, 'The penguin is called Tux. Linus is the person who started Linux.', 'Penguin ka naam Tux hai. Linus woh insaan hain jinhone Linux shuru kiya.'),
      mcq(3, 'Which program reads the commands you type and understands them?', 'Kaun sa program tumhari type ki hui commands padhta aur samajhta hai?', ['The monitor', 'The mouse', 'The shell', 'The WiFi router'], 2, 'The shell (like bash) is the waiter: it reads your order and passes it on.', 'Shell (jaise bash) waiter hai: wo tumhara order padhta hai aur aage pahunchata hai.'),
      cmd(4, 'Type the command that prints your user name.', 'Wo command type karo jo tumhara user name print kare.', {
        verify: (sh, r, c) => r.out.trim() === 'learner' && !/learner/.test(c.replace(/\$USER/g, '')),
        sample: 'whoami',
        hintEn: 'Think of the question: who am I?', hintHi: 'Sawaal socho: main kaun hoon? (who am I)',
      }, 'whoami prints the user name of whoever is logged in.', 'whoami us insaan ka user name print karta hai jo logged in hai.'),
      mcq(5, 'In the command  ls -l Documents  which part is the option?', 'Command  ls -l Documents  mein option kaun sa hissa hai?', ['ls', '-l', 'Documents', 'The first space'], 1, 'ls is the command, -l is the option (it changes how ls works), Documents is the argument.', 'ls command hai, -l option hai (ye ls ke kaam karne ka tareeka badalta hai), Documents argument hai.'),
      cmd(6, 'Make the terminal print exactly: Hello Linux', 'Terminal se bilkul ye print karwao: Hello Linux', {
        verify: (sh, r, c) => r.out.trim() === 'Hello Linux' && /^\s*echo\b/.test(c),
        sample: 'echo Hello Linux',
        hintEn: 'The parrot command starts with e.', hintHi: 'Tote wali command e se shuru hoti hai.',
      }, 'echo prints the words you give it. Quotes are optional here.', 'echo jo shabd do wahi print karta hai. Yahan quotes zaroori nahi.'),
      mcq(7, 'You type  Date  and see "command not found". Why?', 'Tumne  Date  type kiya aur "command not found" aaya. Kyun?', ['The internet is off', 'Linux is case-sensitive, the command is date', 'You need to type sudo first', 'The clock is broken'], 1, 'Linux treats uppercase and lowercase as different letters. The real command is date.', 'Linux ke liye bade aur chhote akshar alag hote hain. Asli command date hai.'),
      cmd(8, 'Print only the name of today\'s weekday (like Monday) using the date command.', 'date command se sirf aaj ke din ka naam print karo (jaise Monday).', {
        verify: (sh, r, c) => /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.test(r.out.trim()) && /^\s*date\b/.test(c),
        sample: 'date +%A',
        hintEn: 'date can take a format that starts with a plus sign. %A means the full weekday name.', hintHi: 'date plus sign se shuru hone wala format le sakta hai. %A ka matlab poore din ka naam.',
      }, 'date +%A prints the full weekday name. Other codes: %Y year, %m month, %d day.', 'date +%A poore din ka naam print karta hai. Aur codes: %Y saal, %m mahina, %d tareekh.'),
      cmd(9, 'In ONE line, print the words Linux, is and fun on three separate lines.', 'EK hi line mein Linux, is aur fun teen alag lines par print karo.', {
        verify: (sh, r) => r.out.trim() === 'Linux\nis\nfun',
        sample: 'echo Linux; echo is; echo fun',
        hintEn: 'You can put several commands on one line if you separate them with a semicolon.', hintHi: 'Ek line mein kai commands likh sakte ho agar unke beech semicolon (;) lagao.',
      }, 'A semicolon runs the next command after the first one finishes. (echo -e "Linux\\nis\\nfun" works too.)', 'Semicolon pehli command ke baad agli command chalata hai. (echo -e "Linux\\nis\\nfun" bhi chalega.)'),
      cmd(10, 'Boss level: print  learner:linux-school  but do NOT type either of those two words. Use the variable boxes!', 'Boss level: print karo  learner:linux-school  par ye dono shabd khud type MAT karo. Variable dabbon ka use karo!', {
        verify: (sh, r, c) => r.out.trim() === 'learner:linux-school' && !/learner|linux-school/.test(c),
        sample: 'echo $USER:$HOSTNAME',
        hintEn: 'The user name box is $USER and the computer name box is $HOSTNAME.', hintHi: 'User name ka dabba $USER hai aur computer ke naam ka dabba $HOSTNAME.',
      }, '$USER and $HOSTNAME hold your name and the computer name. echo prints them with a colon between.', '$USER aur $HOSTNAME mein tumhara naam aur computer ka naam rehta hai. echo unhe beech mein colon ke saath print karta hai.'),
    ],
  });
})();
