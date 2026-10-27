(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  LX.topics.push({
    id: 'reading',
    no: 4,
    key: 'cat',
    mins: 25,
    title: T('Reading and Writing Text', 'Text padhna aur likhna'),
    blurb: T('Look inside files, peek at the top or bottom, count lines and write your own text files from the terminal.', 'Files ke andar dekho, upar ya neeche jhaanko, lines gino aur terminal se apni text files likho.'),
    blocks: [
      BIG(
        'In Linux most things are plain text files: notes, settings, logs, even programs. So learning to read and write text is a superpower. **cat** shows a file, **head** and **tail** show its start and end, **wc** counts, and the arrows **>** and **>>** write text into files.',
        'Linux mein zyada tar cheezein simple text files hoti hain: notes, settings, logs, programs bhi. Isliye text padhna aur likhna ek superpower hai. **cat** file dikhata hai, **head** aur **tail** shuru aur aakhir dikhate hain, **wc** ginta hai, aur arrows **>** aur **>>** text ko files mein likhte hain.'
      ),
      H('cat: show the whole file', 'cat: poori file dikhao'),
      CMD('cat poem.txt', 'cat is short for "concatenate" but everyone uses it to display files.', 'cat "concatenate" ka short hai, par sab ise files dikhane ke liye use karte hain.'),
      CMD('cat -n poem.txt', 'The -n option numbers the lines. Handy when you talk about "line 3".', '-n option lines ko number deta hai. "line 3" ki baat karte waqt kaam aata hai.'),
      H('head and tail: the start and the end', 'head aur tail: shuru aur aakhir'),
      STORY('A log file is like a diary that a program writes every minute. It can be thousands of lines long. You rarely read all of it. You look at the first page (head) or at the latest entries at the end (tail).', 'Log file ek diary jaisi hai jo program har minute likhta hai. Wo hazaaron lines lambi ho sakti hai. Tum use poora kam hi padhte ho. Ya to pehla page (head) dekhte ho ya sabse naye entries jo end mein hote hain (tail).'),
      CMD('head -n 3 server.log', 'Shows the first 3 lines. Without -n you get 10.', 'Pehli 3 lines dikhata hai. -n ke bina 10 lines milti hain.'),
      CMD('tail -n 3 server.log', 'Shows the last 3 lines: the newest events.', 'Aakhri 3 lines dikhata hai: sabse naye events.'),
      TIP('`tail -f server.log` keeps the file open and prints new lines the moment they are written. It is how admins watch a server live. Press Ctrl+C to stop watching.', '`tail -f server.log` file ko khula rakhta hai aur nayi lines likhe jaate hi print kar deta hai. Admins aise server ko live dekhte hain. Rukne ke liye Ctrl+C dabao.'),
      H('wc: count things', 'wc: ginti karo'),
      CMD('wc -l server.log', 'Counts lines. wc means "word count": -l lines, -w words, -c bytes.', 'Lines ginta hai. wc ka matlab "word count": -l lines, -w words, -c bytes.'),
      CMD('wc poem.txt', 'With no option it shows lines, words and bytes together.', 'Bina option ke ye lines, words aur bytes teeno ek saath dikhata hai.'),
      H('Long files: less', 'Lambi files: less'),
      P('For a very long file, **less** shows one screen at a time. Press Space for the next page, **/word** to search and **q** to quit. In this sandbox it prints the file and reminds you of the keys.', 'Bahut lambi file ke liye **less** ek baar mein ek screen dikhata hai. Agle page ke liye Space, search ke liye **/word** aur bahar nikalne ke liye **q** dabao. Is sandbox mein ye file print karke keys yaad dilata hai.'),
      H('Writing text: echo and the arrows', 'Text likhna: echo aur arrows'),
      P('Normally output appears on the screen. The arrow **>** redirects it into a file instead. Be careful: **>** replaces everything already in the file. The double arrow **>>** adds to the end and keeps the old text.', 'Normal tareeke se output screen par aata hai. Arrow **>** use ek file mein bhej deta hai. Dhyaan rakho: **>** file ka purana sab kuch mita kar naya likhta hai. Double arrow **>>** end mein jodta hai aur purana text rakhta hai.'),
      CMD(['echo "Day 1: I learned cd" > diary.txt', 'cat diary.txt'], 'Creates diary.txt (or replaces it) with one line.', 'diary.txt banata hai (ya badal deta hai) ek line ke saath.'),
      CMD(['echo "Day 2: I learned ls" >> diary.txt', 'cat diary.txt'], 'The second arrow adds a line to the end. Now the diary has two.', 'Doosra arrow end mein ek line jodta hai. Ab diary mein do lines hain.'),
      WARN('Mixing up **>** and **>>** is the most common way to erase a file by accident. If you want to keep what is there, use >>.', '**>** aur **>>** mein galti karna file galti se mitane ka sabse aam tareeka hai. Jo hai use rakhna ho to >> use karo.'),
      TRY('Write your own file with the arrows, then read it back:', 'Arrows se apni file likho, phir use wapas padho:', ["echo 'My favourite colour is blue' > fav.txt", "echo 'My favourite food is pizza' >> fav.txt", 'cat fav.txt', 'wc -l fav.txt']),
      H('Typing a whole file: cat > and nano', 'Poori file type karna: cat > aur nano'),
      P('You can also type a file live. Run **cat > story.txt**, type your lines, then press **Ctrl+D** on an empty line to finish. For bigger edits use the friendly editor **nano**: type **nano story.txt**, write, press **Ctrl+O** to save and **Ctrl+X** to leave.', 'File live bhi type kar sakte ho. **cat > story.txt** chalao, apni lines type karo, phir khali line par **Ctrl+D** dabao. Bade edits ke liye friendly editor **nano** use karo: **nano story.txt** type karo, likho, save ke liye **Ctrl+O** aur bahar jaane ke liye **Ctrl+X** dabao.'),
      CMD('nano hello.txt', 'Opens the nano editor in the terminal panel. Type something, press Ctrl+O to save, then Ctrl+X.', 'Terminal panel mein nano editor kholta hai. Kuch type karo, save ke liye Ctrl+O, phir Ctrl+X dabao.'),
      FUN('The famous editor **vim** is loved by programmers but is famous for being hard to quit. (Type :q! and Enter.) nano is much friendlier for beginners.', 'Mashhoor editor **vim** programmers ko pasand hai par band karna mushkil hone ke liye mashhoor hai. (:q! type karke Enter dabao.) Beginners ke liye nano zyada friendly hai.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['cat file', 'show a whole file', 'poori file dikhao'],
        ['cat -n file', 'show with line numbers', 'line numbers ke saath dikhao'],
        ['head -n 5 file', 'first 5 lines', 'pehli 5 lines'],
        ['tail -n 5 file', 'last 5 lines', 'aakhri 5 lines'],
        ['tail -f file', 'watch a file grow live', 'file ko badhte live dekho'],
        ['wc -l file', 'count lines', 'lines gino'],
        ['echo text > file', 'write (replaces the file)', 'likho (file badal deta hai)'],
        ['echo text >> file', 'append (keeps old text)', 'end mein jodo (purana text rehta hai)'],
        ['nano file', 'edit with a friendly editor', 'friendly editor se edit karo'],
      ]),
    ],
    missions: [
      M('read-m1', 'Last two lines', 'Aakhri do lines', 'Show only the LAST TWO lines of poem.txt.', 'poem.txt ki sirf AAKHRI DO lines dikhao.', 'tail with the -n option: tail -n 2 poem.txt', 'tail ke saath -n option: tail -n 2 poem.txt', (sh, last) => !!last && /^\s*tail\b/.test(last.cmd) && last.out.trim() === 'Linux is awesome,\nAnd so are you!', ['tail -n 2 poem.txt']),
      M('read-m2', 'Start a diary', 'Diary shuru karo', 'Create diary.txt with one line using >, then add a second line to the same file using >>. The file must end up with two lines.', 'diary.txt ek line ke saath > se banao, phir usi file mein >> se doosri line jodo. File mein aakhir mein do lines honi chahiye.', 'First echo Dear diary > diary.txt, then echo I learned Linux >> diary.txt', 'Pehle echo Dear diary > diary.txt, phir echo I learned Linux >> diary.txt', (sh) => sh.isFile('~/diary.txt') && sh.cat('~/diary.txt').trim().split('\n').length === 2, ['echo Dear diary > diary.txt', 'echo I learned Linux >> diary.txt']),
      M('read-m3', 'Count the log', 'Log gino', 'How many lines does server.log have? Find out with wc.', 'server.log mein kitni lines hain? wc se pata karo.', 'wc -l server.log', 'wc -l server.log', (sh) => sh.log.some((r) => /^\s*wc\b.*server\.log/.test(r.cmd) && /\b20\b/.test(r.out)), ['wc -l server.log']),
    ],
    quiz: [
      mcq(1, 'Which command shows the whole content of a file?', 'Kaun si command file ka poora content dikhati hai?', ['cat', 'mkdir', 'cd', 'pwd'], 0, 'cat prints a file to the screen.', 'cat file ko screen par print karta hai.'),
      mcq(2, 'Which arrow ADDS text to the end of a file and keeps the old text?', 'Kaun sa arrow file ke end mein text JODTA hai aur purana text rakhta hai?', ['>', '>>', '<', '|'], 1, '>> appends. A single > replaces the whole file.', '>> end mein jodta hai. Akela > poori file badal deta hai.'),
      mcq(3, 'Which command shows the last lines of a file?', 'Kaun si command file ki aakhri lines dikhati hai?', ['head', 'tail', 'last', 'end'], 1, 'tail shows the end of the file. head shows the beginning.', 'tail file ka end dikhata hai. head shuruaat dikhata hai.'),
      cmd(4, 'Show the first 3 lines of server.log.', 'server.log ki pehli 3 lines dikhao.', { verify: (sh, r, c) => /^\s*head\b/.test(c) && r.out.trim().split('\n').length === 3 && r.out.startsWith('2026-10-26 09:00:01'), sample: 'head -n 3 server.log', alt: ['head -3 server.log'], wrong: ['head server.log'], hintEn: 'head, with the number of lines you want.', hintHi: 'head, aur jitni lines chahiye utni ginti.' }, 'head -n 3 prints the first three lines. head -3 is the short form.', 'head -n 3 pehli teen lines print karta hai. head -3 uska chhota roop hai.'),
      mcq(5, 'What does  wc -l  count?', ' wc -l  kya ginta hai?', ['Words', 'Lines', 'Letters', 'Files'], 1, '-l is for lines, -w for words and -c for bytes.', '-l lines ke liye, -w words ke liye aur -c bytes ke liye hai.'),
      cmd(6, 'Save the word Hello into a new file called greeting.txt.', 'Hello shabd ko greeting.txt naam ki nayi file mein save karo.', { verify: (sh) => sh.cat('greeting.txt') === 'Hello\n', sample: 'echo Hello > greeting.txt', hintEn: 'echo plus the arrow that writes into a file.', hintHi: 'echo aur file mein likhne wala arrow.' }, 'echo prints Hello, and > sends it into greeting.txt.', 'echo Hello print karta hai, aur > use greeting.txt mein bhej deta hai.'),
      cmd(7, 'greeting.txt already contains Hello. Add a second line Bye WITHOUT erasing Hello.', 'greeting.txt mein pehle se Hello hai. Hello mitaye bina doosri line Bye jodo.', { setup: ['echo Hello > greeting.txt'], verify: (sh) => sh.cat('greeting.txt') === 'Hello\nBye\n', sample: 'echo Bye >> greeting.txt', wrong: ['echo Bye > greeting.txt'], hintEn: 'Use the double arrow.', hintHi: 'Double arrow use karo.' }, '>> appends to the end of the file.', '>> file ke end mein jodta hai.'),
      cmd(8, 'Print poem.txt with line numbers.', 'poem.txt ko line numbers ke saath print karo.', { verify: (sh, r) => /^\s+1\tRoses/.test(r.out) && /^\s+4\tAnd/m.test(r.out), sample: 'cat -n poem.txt', hintEn: 'cat has an option -n.', hintHi: 'cat ka ek option -n hai.' }, 'cat -n numbers every line.', 'cat -n har line ko number deta hai.'),
      cmd(9, 'Save the last 3 lines of server.log into a file called last3.txt.', 'server.log ki aakhri 3 lines last3.txt naam ki file mein save karo.', { verify: (sh) => { const all = sh.cat('server.log').trim().split('\n'); return sh.cat('last3.txt') === all.slice(-3).join('\n') + '\n'; }, sample: 'tail -n 3 server.log > last3.txt', alt: ['tail -3 server.log > last3.txt'], hintEn: 'Combine tail with the arrow.', hintHi: 'tail ko arrow ke saath jodo.' }, 'tail picks the last 3 lines and > stores them in last3.txt instead of printing.', 'tail aakhri 3 lines chunta hai aur > unhe print karne ki jagah last3.txt mein rakhta hai.'),
      cmd(10, 'Boss level: create story.txt with exactly three lines: One, Two, Three. Use only echo commands (or printf) in one line.', 'Boss level: story.txt banao jisme theek teen lines hon: One, Two, Three. Ek line mein sirf echo (ya printf) commands use karo.', { verify: (sh) => sh.cat('story.txt') === 'One\nTwo\nThree\n', sample: 'echo One > story.txt; echo Two >> story.txt; echo Three >> story.txt', alt: ["printf 'One\\nTwo\\nThree\\n' > story.txt"], hintEn: 'First line with one arrow, the next two with the double arrow. Separate commands with ;', hintHi: 'Pehli line ek arrow se, agli do double arrow se. Commands ko ; se alag karo.' }, 'The first > starts the file fresh; each >> adds a line.', 'Pehla > file ko naye se shuru karta hai; har >> ek line jodta hai.'),
    ],
  });
})();
