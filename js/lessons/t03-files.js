(function () {
  const LX = globalThis.LX;
  const { T, H, P, STORY, TIP, WARN, FUN, BIG, CMD, TABLE, ANAT, PRE, THINK, STEPS, TRY } = LX.b;
  const { mcq, cmd } = LX.Q;
  const M = LX.M;

  LX.topics.push({
    id: 'files',
    no: 3,
    key: 'mv',
    mins: 25,
    title: T('Files and Folders', 'Files aur Folders banana'),
    blurb: T('Create, copy, rename, move and delete. The everyday tools for keeping your computer tidy.', 'Banao, copy karo, naam badlo, move karo aur delete karo. Computer ko saaf-suthra rakhne ke roz ke auzaar.'),
    blocks: [
      BIG(
        'Five little commands do almost all file work: **mkdir** makes a folder, **touch** makes an empty file, **cp** copies, **mv** moves or renames, and **rm** removes. Learn these five and you can organise anything.',
        'Paanch chhoti commands lagbhag saara file ka kaam karti hain: **mkdir** folder banata hai, **touch** khali file banata hai, **cp** copy karta hai, **mv** move ya rename karta hai, aur **rm** hata deta hai. Ye paanch seekh lo to kuch bhi organise kar sakte ho.'
      ),
      STORY(
        'Picture your school bag. A folder is a pocket in the bag. A file is a notebook. mkdir sews a new pocket. cp photocopies a notebook. mv takes a notebook out of one pocket and puts it in another, or just writes a new name on its cover. rm throws a notebook away.',
        'Apna school bag socho. Folder bag ki ek jeb hai. File ek copy hai. mkdir nayi jeb silta hai. cp copy ki photocopy banata hai. mv copy ko ek jeb se nikaal kar doosri mein rakhta hai, ya bas uske cover par naya naam likh deta hai. rm copy ko kachre mein phenk deta hai.'
      ),
      H('mkdir: make a folder', 'mkdir: folder banao'),
      CMD(['mkdir zoo', 'ls'], 'Creates a folder called zoo right here.', 'Yahin zoo naam ka folder banata hai.'),
      CMD(['mkdir -p games/chess/boards', 'ls games/chess'], 'The -p option makes all the missing parent folders on the way, so you can build a whole branch in one go.', '-p option raaste ke saare missing parent folders bana deta hai, to poori ek shaakha ek hi baar mein ban jaati hai.'),
      H('touch: make an empty file', 'touch: khali file banao'),
      CMD(['touch zoo/lion.txt zoo/tiger.txt', 'ls zoo'], 'Creates two empty files inside zoo. You can name many files in one go.', 'zoo ke andar do khali files banata hai. Ek saath kai files ke naam de sakte ho.'),
      FUN('touch was invented to change the "last touched" time of a file. If the file does not exist, it creates it. That is why a command named "touch" makes files!', 'touch asal mein file ka "aakhri baar chhua gaya" time badalne ke liye bana tha. Agar file nahi hai to wo bana deta hai. Isiliye "touch" naam ki command files banati hai!'),
      H('cp: copy', 'cp: copy karo'),
      ANAT([
        ['cp', 'cmd', 'copy', 'copy karo'],
        ['poem.txt', 'arg', 'FROM: the original', 'KAHAN SE: asli file'],
        ['zoo/poem_copy.txt', 'arg', 'TO: the new copy (a new name or a folder)', 'KAHAN: nayi copy (naya naam ya folder)'],
      ]),
      CMD(['cp poem.txt zoo/poem_copy.txt', 'ls zoo'], 'The original stays where it is. You now have two.', 'Original wahin rehti hai. Ab tumhare paas do hain.'),
      CMD(['cp -r Pictures Pictures_backup', 'ls Pictures_backup'], 'To copy a whole folder you need -r (recursive: "and everything inside").', 'Poora folder copy karne ke liye -r chahiye (recursive: "aur uske andar sab kuch").'),
      H('mv: move or rename', 'mv: move ya rename'),
      P('mv does two jobs, and both are the same idea: give the file a new place or a new name.', 'mv do kaam karta hai, aur dono ek hi idea hain: file ko nayi jagah ya naya naam do.'),
      CMD(['mv zoo/lion.txt zoo/simba.txt', 'ls zoo'], 'Same folder, new name: that is a rename.', 'Wahi folder, naya naam: yahi rename hai.'),
      CMD(['mv zoo/tiger.txt ~/Desktop', 'ls zoo ~/Desktop'], 'New folder, same name: that is a move. The file leaves zoo and appears on the Desktop.', 'Naya folder, wahi naam: yahi move hai. File zoo se nikal kar Desktop par aa jaati hai.'),
      H('rm: remove (carefully!)', 'rm: hatao (dhyaan se!)'),
      CMD(['touch junk.txt', 'rm junk.txt', 'ls junk.txt'], 'The file is gone. The last command complains because it cannot find it any more.', 'File chali gayi. Aakhri command shikayat karti hai kyunki use wo ab mil nahi rahi.'),
      WARN('Linux has **no recycle bin** in the terminal. rm deletes for good. Two habits keep you safe: run ls first to see what you are about to delete, and use `rm -i` which asks "are you sure?" before each file.', 'Terminal mein **recycle bin nahi** hota. rm hamesha ke liye delete kar deta hai. Do aadatein tumhe safe rakhti hain: delete karne se pehle ls chala kar dekho kya hata rahe ho, aur `rm -i` use karo jo har file se pehle poochta hai "pakka?"'),
      CMD(['rm -r Pictures_backup', 'ls'], 'To delete a folder and everything inside it you need -r. Think twice before pressing Enter!', 'Folder aur uske andar sab kuch hatane ke liye -r chahiye. Enter dabane se pehle do baar socho!'),
      WARN('Never run `rm -rf /` or `rm -rf ~` on a real computer. The sandbox protects you here, but a real Linux machine would happily erase everything.', 'Asli computer par kabhi `rm -rf /` ya `rm -rf ~` mat chalana. Yahan sandbox tumhe bacha leta hai, par asli Linux machine khushi se sab kuch mita degi.'),
      H('Wildcards: one pattern, many files', 'Wildcards: ek pattern, kai files'),
      P('A star **\\*** stands for "anything". A question mark **?** stands for exactly one character. They let you talk about many files at once.', 'Ek star **\\*** ka matlab "kuch bhi". Ek question mark **?** ka matlab theek ek akshar. Inse tum ek saath kai files ki baat kar sakte ho.'),
      TABLE([
        ['ls *.txt', 'every file that ends with .txt', 'har file jo .txt par khatam hoti hai'],
        ['ls a*', 'every file that starts with a', 'har file jo a se shuru hoti hai'],
        ['ls ?.txt', 'files like a.txt, b.txt (one letter + .txt)', 'a.txt, b.txt jaisi files (ek akshar + .txt)'],
        ['ls playground/[ab].txt', 'only a.txt and b.txt', 'sirf a.txt aur b.txt'],
        ['mkdir day{1,2,3}', 'curly braces make day1 day2 day3 at once', 'curly braces ek saath day1 day2 day3 banate hain'],
      ], 'What it does', 'Ye kya karta hai', true),
      TRY('Look at the playground folder, then try a wildcard on it:', 'playground folder dekho, phir us par wildcard try karo:', ['ls playground', 'ls playground/*.txt', 'ls playground/?.txt']),
      TIP('Before you delete with a wildcard, run the same pattern with ls first. If ls shows exactly what you want gone, then swap ls for rm.', 'Wildcard se delete karne se pehle wahi pattern ls ke saath chalao. Agar ls wahi dikhaye jo tum hatana chahte ho, tab ls ki jagah rm likho.'),
      THINK('you type  mv notes.txt notes.txt.bak  . Did you move or rename?', 'tumne  mv notes.txt notes.txt.bak  type kiya. Ye move hua ya rename?', 'Rename. It stays in the same folder and only gets a new name. The idea is the same as moving: new name, new place.', 'Rename. Wo usi folder mein rehti hai aur bas naya naam milta hai. Idea move jaisa hi hai: naya naam, nayi jagah.'),
      H('Cheat sheet', 'Cheat sheet'),
      TABLE([
        ['mkdir name', 'make a folder', 'folder banao'],
        ['mkdir -p a/b/c', 'make nested folders', 'andar-andar folders banao'],
        ['touch file', 'make an empty file', 'khali file banao'],
        ['cp a b', 'copy a to b', 'a ko b mein copy karo'],
        ['cp -r dir1 dir2', 'copy a folder', 'folder copy karo'],
        ['mv a b', 'rename or move a to b', 'a ko b mein rename ya move karo'],
        ['rm file', 'delete a file', 'file delete karo'],
        ['rm -i file', 'ask before deleting', 'delete karne se pehle pucho'],
        ['rm -r dir', 'delete a folder and its contents', 'folder aur uska saara saamaan delete karo'],
        ['rmdir dir', 'delete an EMPTY folder (safer)', 'KHALI folder delete karo (zyada safe)'],
      ]),
    ],
    missions: [
      M('files-m1', 'Build a zoo', 'Chidiyaghar banao', 'Create a folder called zoo in your home. Inside it make two empty files: lion.txt and tiger.txt.', 'Apne home mein zoo naam ka folder banao. Uske andar do khali files banao: lion.txt aur tiger.txt.', 'mkdir zoo, then touch zoo/lion.txt zoo/tiger.txt', 'mkdir zoo, phir touch zoo/lion.txt zoo/tiger.txt', (sh) => sh.isDir('~/zoo') && sh.isFile('~/zoo/lion.txt') && sh.isFile('~/zoo/tiger.txt'), ['mkdir zoo', 'touch zoo/lion.txt zoo/tiger.txt']),
      M('files-m2', 'Copy then rename', 'Copy karo phir rename', 'Make a backup copy of poem.txt called poem_backup.txt, then rename that copy to poem_old.txt. The original poem.txt must stay.', 'poem.txt ki backup copy poem_backup.txt naam se banao, phir us copy ko rename karke poem_old.txt kar do. Original poem.txt rehni chahiye.', 'cp poem.txt poem_backup.txt, then mv poem_backup.txt poem_old.txt', 'cp poem.txt poem_backup.txt, phir mv poem_backup.txt poem_old.txt', (sh) => sh.isFile('~/poem.txt') && sh.isFile('~/poem_old.txt') && !sh.exists('~/poem_backup.txt') && sh.cat('~/poem.txt') === sh.cat('~/poem_old.txt'), ['cp poem.txt poem_backup.txt', 'mv poem_backup.txt poem_old.txt']),
      M('files-m3', 'Sweep the playground', 'Playground saaf karo', 'Delete every .txt file in the playground folder with ONE command and a wildcard. The old.log file must survive.', 'playground folder ki har .txt file EK command aur wildcard se delete karo. old.log file bachni chahiye.', 'rm playground/*.txt  (peek first with ls playground/*.txt)', 'rm playground/*.txt  (pehle ls playground/*.txt se dekh lo)', (sh) => sh.isFile('~/playground/old.log') && !sh.ls('~/playground').some((n) => n.endsWith('.txt')), ['rm playground/*.txt']),
    ],
    quiz: [
      mcq(1, 'Which command creates a new folder?', 'Kaun si command naya folder banati hai?', ['touch', 'mkdir', 'cp', 'cd'], 1, 'mkdir means "make directory".', 'mkdir ka matlab "make directory".'),
      mcq(2, 'What does  touch notes2.txt  do when notes2.txt does not exist?', 'Agar notes2.txt exist nahi karti to  touch notes2.txt  kya karta hai?', ['Shows an error', 'Creates an empty file', 'Deletes something', 'Opens an editor'], 1, 'touch creates an empty file when the name is new.', 'Jab naam naya ho to touch ek khali file bana deta hai.'),
      mcq(3, 'Which command is used both to rename and to move files?', 'Rename aur move dono ke liye kaun si command use hoti hai?', ['rn', 'mv', 'cp', 'rename'], 1, 'mv gives a file a new name or a new place, and sometimes both.', 'mv file ko naya naam ya nayi jagah deta hai, aur kabhi dono.'),
      cmd(4, 'Create a folder called photos in the current directory.', 'Current directory mein photos naam ka folder banao.', { verify: (sh) => sh.isDir('photos'), sample: 'mkdir photos', wrong: ['touch photos'], hintEn: 'make + directory', hintHi: 'make + directory' }, 'mkdir photos makes the folder. touch would have made a file.', 'mkdir photos folder banata hai. touch se file banti.'),
      mcq(5, 'You run  rm notes.txt . Can you bring the file back from a recycle bin?', 'Tumne  rm notes.txt  chalaya. Kya recycle bin se file wapas aa sakti hai?', ['Yes, it goes to the Trash', 'Yes, after a restart', 'No, rm deletes for good', 'Only if you are root'], 2, 'The terminal has no recycle bin. rm is permanent, so look twice.', 'Terminal mein recycle bin nahi hota. rm permanent hai, isliye do baar dekho.'),
      cmd(6, 'Copy todo.txt into the Documents folder (keep the original too).', 'todo.txt ko Documents folder mein copy karo (original bhi rakho).', { verify: (sh) => sh.isFile('Documents/todo.txt') && sh.isFile('todo.txt'), sample: 'cp todo.txt Documents', wrong: ['mv todo.txt Documents'], alt: ['cp todo.txt Documents/', 'cp todo.txt ~/Documents'], hintEn: 'cp copies, mv moves. You want the original to stay.', hintHi: 'cp copy karta hai, mv move. Tumhe original rakhni hai.' }, 'cp makes a copy. mv would have taken the original away.', 'cp copy banata hai. mv original ko hata deta.'),
      cmd(7, 'Create the nested folders a/b/c in ONE command.', 'a/b/c nested folders EK hi command mein banao.', { verify: (sh) => sh.isDir('a/b/c'), sample: 'mkdir -p a/b/c', wrong: ['mkdir a/b/c'], hintEn: 'Normal mkdir fails if a does not exist. One option fixes that.', hintHi: 'Agar a nahi hai to normal mkdir fail hota hai. Ek option ise theek karta hai.' }, '-p creates every missing parent folder.', '-p har missing parent folder bana deta hai.'),
      cmd(8, 'Rename fruits.txt to fruit_list.txt.', 'fruits.txt ka naam badal kar fruit_list.txt kar do.', { verify: (sh) => sh.isFile('fruit_list.txt') && !sh.exists('fruits.txt') && sh.cat('fruit_list.txt').includes('mango'), sample: 'mv fruits.txt fruit_list.txt', wrong: ['cp fruits.txt fruit_list.txt'], hintEn: 'Renaming is moving to a new name.', hintHi: 'Rename matlab naye naam par move karna.' }, 'mv old new renames the file in place.', 'mv purana naya file ka naam wahin badal deta hai.'),
      cmd(9, 'Make a folder playground/texts and move all the .txt files of playground into it. One command line.', 'playground/texts folder banao aur playground ki saari .txt files usme move karo. Ek hi command line.', { verify: (sh) => sh.isDir('playground/texts') && ['a', 'b', 'c'].every((n) => sh.isFile(`playground/texts/${n}.txt`)) && !sh.isFile('playground/a.txt') && sh.isFile('playground/old.log'), sample: 'mkdir playground/texts && mv playground/*.txt playground/texts', alt: ['mkdir playground/texts; mv playground/*.txt playground/texts/'], hintEn: 'Make the folder first, then use a wildcard with mv. Join them with &&.', hintHi: 'Pehle folder banao, phir mv ke saath wildcard lagao. Dono ko && se jodo.' }, 'The shell expands *.txt into the matching names before mv runs. The last argument is the destination folder.', 'Shell *.txt ko mv chalne se pehle matching naamon mein badal deta hai. Aakhri argument destination folder hota hai.'),
      cmd(10, 'Boss level: with brace expansion, create folders day1, day2, day3 and put an empty file notes.txt in each, in ONE line.', 'Boss level: brace expansion se day1, day2, day3 folders banao aur har ek mein khali notes.txt file rakho, EK line mein.', { verify: (sh) => [1, 2, 3].every((n) => sh.isDir(`day${n}`) && sh.isFile(`day${n}/notes.txt`)), sample: 'mkdir day{1,2,3} && touch day{1,2,3}/notes.txt', alt: ['mkdir -p day{1..3}; touch day{1..3}/notes.txt'], hintEn: 'day{1,2,3} turns into three words. Use it twice.', hintHi: 'day{1,2,3} teen shabd ban jata hai. Ise do baar use karo.' }, 'Braces expand into several words, so one command can create many things.', 'Braces kai shabdon mein khul jate hain, isliye ek command kai cheezein bana sakti hai.'),
    ],
  });
})();
