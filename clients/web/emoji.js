/**
 * MatrixMess Web – Emoji-Picker (emoji.js)
 *
 * Vollwertige Emoji-Auswahl für (a) das Einfügen in den Composer und
 * (b) Nachrichten-Reaktionen. Vanilla-JS als natives ES-Modul (ES2020+),
 * keine Frameworks, kein Build-Step, keine externen Ressourcen.
 *
 * Sicherheit: Das DOM wird ausschließlich per document.createElement +
 * textContent/append aufgebaut – KEIN innerHTML/outerHTML/
 * insertAdjacentHTML mit dynamischen Daten, keine javascript:-URLs.
 *
 * Inhalt des Pickers:
 *  - Suchfeld oben, filtert live über deutsche UND englische Schlagworte
 *    (Umlaute werden gefaltet: "hande" findet "Hände"); Neu-Rendern beim
 *    Tippen ist gedrosselt (Throttle ~80 ms).
 *  - Kategorie-Tabs: Zuletzt benutzt, Smileys, Gesten & Menschen,
 *    Herzen & Symbole, Tiere & Natur, Essen & Trinken,
 *    Aktivitäten & Reisen, Objekte.
 *  - Kuratiertes Set gängiger Messenger-Emojis als eingebettete
 *    Datenstruktur [{ e: '😀', k: ['grinsen', 'smile', …] }, …].
 *  - Grid mit 8 Spalten, 32-px-Buttons, Hover-Highlight.
 *  - Tastatur: ESC schließt, Enter wählt das erste Suchergebnis.
 *  - Performance: Das Grid wird erst beim Öffnen gebaut; Kategorien
 *    werden beim ersten Besuch gerendert und danach wiederverwendet.
 *
 * Persistenz:
 *  - Zuletzt benutzte Emojis NUR lokal: localStorage "mm.recentEmoji"
 *    (Array aus Emoji-Strings, maximal 24 Einträge, neueste zuerst).
 *
 * Styling: emoji.css (nutzt die Design-Tokens aus styles.css, Dark Mode
 * via [data-theme="dark"] + prefers-color-scheme).
 *
 * ======================= EXPORT-API =======================
 *
 * openEmojiPicker({ anchorEl, onPick, onClose? }) -> { close() }
 *   Öffnet den Picker als Popover nahe anchorEl (HTMLElement). Das
 *   Popover erscheint bevorzugt UNTERHALB des Ankers und weicht bei
 *   Viewport-Kollision automatisch nach OBEN aus; horizontal wird es in
 *   den Viewport geklemmt. Bei Scroll/Resize positioniert es sich neu.
 *
 *   onPick(emoji)  Pflicht. Wird mit dem gewählten Emoji (String)
 *                  aufgerufen; das Emoji wird zusätzlich in
 *                  "mm.recentEmoji" vorn einsortiert. Danach schließt
 *                  der Picker automatisch.
 *   onClose()      Optional. Wird bei JEDEM Schließen genau einmal
 *                  aufgerufen (nach Auswahl, ESC, Klick außerhalb oder
 *                  programmatischem close()).
 *
 *   Schließt bei: Auswahl eines Emojis, ESC, Klick/Tap außerhalb des
 *   Popovers (Klicks auf anchorEl selbst schließen NICHT, damit der
 *   Integrator ein Toggle-Verhalten umsetzen kann).
 *
 *   Rückgabe: { close() } – schließt den Picker programmatisch.
 *   Es ist immer höchstens ein Picker gleichzeitig offen; ein erneuter
 *   Aufruf schließt einen bereits offenen Picker zuerst.
 *
 * QUICK_REACTIONS
 *   Array mit 6 Emojis für die Schnell-Reaktionsleiste:
 *   ['👍', '❤️', '😂', '🔥', '😮', '😢']
 */

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '😢'];

const LS_RECENT = 'mm.recentEmoji';
const RECENT_MAX = 24;
const SEARCH_THROTTLE_MS = 80;
const SEARCH_MAX_RESULTS = 160;

/* ===================== Emoji-Daten ===================== */
/* Kuratiertes Set gängiger Messenger-Emojis. Schlagworte: deutsch UND
   englisch, klein geschrieben. Flaggen bewusst weggelassen. */

const SMILEYS = [
  {e:'😀',k:['grinsen','lachen','smile','grinning']},
  {e:'😃',k:['froh','lachen','happy','smiley']},
  {e:'😄',k:['lachen','froh','laugh','smile']},
  {e:'😁',k:['strahlen','grinsen','beam','grin']},
  {e:'😆',k:['lachen','augen zu','laughing','xd']},
  {e:'😅',k:['schwitzen','erleichtert','sweat','phew']},
  {e:'🤣',k:['totlachen','kringeln','rofl','lol']},
  {e:'😂',k:['freudentränen','lachen','joy','tears']},
  {e:'🙂',k:['lächeln','leicht','smile','slight']},
  {e:'🙃',k:['verkehrt herum','ironie','upside down']},
  {e:'🫠',k:['schmelzen','peinlich','melting']},
  {e:'😉',k:['zwinkern','wink']},
  {e:'😊',k:['lächeln','verlegen','rot werden','blush']},
  {e:'😇',k:['engel','unschuldig','halo','angel','innocent']},
  {e:'🥰',k:['verliebt','herzen','love','adore']},
  {e:'😍',k:['herzaugen','verliebt','heart eyes']},
  {e:'🤩',k:['begeistert','sternaugen','starstruck','wow']},
  {e:'😘',k:['kuss zuwerfen','kiss','kussmund']},
  {e:'☺️',k:['lächeln','zufrieden','relaxed']},
  {e:'🥲',k:['träne','lächeln','dankbar','happy tear']},
  {e:'😋',k:['lecker','schmatzen','yummy','delicious']},
  {e:'😛',k:['zunge','tongue']},
  {e:'😜',k:['zunge','zwinkern','frech','winking tongue']},
  {e:'🤪',k:['verrückt','albern','zany','crazy']},
  {e:'😝',k:['zunge','augen zu','squinting tongue']},
  {e:'🤑',k:['geld','dollar','money face']},
  {e:'🤗',k:['umarmen','knuddeln','hug']},
  {e:'🤭',k:['kichern','hand vor mund','giggle']},
  {e:'🫢',k:['überrascht','hand vor mund','gasp']},
  {e:'🫣',k:['spähen','durch finger','peeking']},
  {e:'🤫',k:['leise','pssst','geheim','shush','quiet']},
  {e:'🤔',k:['nachdenken','hmm','thinking']},
  {e:'🫡',k:['salutieren','jawohl','salute']},
  {e:'🤐',k:['mund zu','reißverschluss','zipper','schweigen']},
  {e:'🤨',k:['skeptisch','augenbraue','raised eyebrow']},
  {e:'😐',k:['neutral','ausdruckslos','neutral face']},
  {e:'😑',k:['genervt','ausdruckslos','expressionless']},
  {e:'😶',k:['sprachlos','kein mund','no mouth','speechless']},
  {e:'😶‍🌫️',k:['im nebel','verwirrt','clouds','fog']},
  {e:'😏',k:['schmunzeln','anzüglich','smirk']},
  {e:'😒',k:['genervt','gelangweilt','unamused']},
  {e:'🙄',k:['augen rollen','genervt','eye roll']},
  {e:'😬',k:['grimasse','unangenehm','grimace','awkward']},
  {e:'😮‍💨',k:['ausatmen','erleichtert','exhale','sigh']},
  {e:'😌',k:['erleichtert','zufrieden','relieved']},
  {e:'😔',k:['nachdenklich','traurig','pensive']},
  {e:'😪',k:['schläfrig','müde','sleepy']},
  {e:'🤤',k:['sabbern','hunger','drooling']},
  {e:'😴',k:['schlafen','zzz','sleeping']},
  {e:'😷',k:['maske','krank','mask','sick']},
  {e:'🤒',k:['fieber','thermometer','krank','fever']},
  {e:'🤕',k:['verletzt','verband','kopf','injured']},
  {e:'🤢',k:['übel','ekel','nauseated']},
  {e:'🤮',k:['erbrechen','kotzen','vomit']},
  {e:'🤧',k:['niesen','taschentuch','sneeze']},
  {e:'🥵',k:['heiß','schwitzen','hitze','hot']},
  {e:'🥶',k:['kalt','frieren','eisig','cold','freezing']},
  {e:'🥴',k:['benommen','beschwipst','woozy']},
  {e:'😵',k:['ohnmächtig','ko','knocked out']},
  {e:'😵‍💫',k:['schwindelig','spiralen','dizzy']},
  {e:'🤯',k:['kopf explodiert','mind blown','schock']},
  {e:'🤠',k:['cowboy','hut','cowboy hat']},
  {e:'🥳',k:['party','feiern','geburtstag','celebrate']},
  {e:'🥸',k:['verkleidung','brille','disguise']},
  {e:'😎',k:['cool','sonnenbrille','sunglasses']},
  {e:'🤓',k:['nerd','streber','brille','nerd face']},
  {e:'🧐',k:['monokel','prüfend','monocle']},
  {e:'😕',k:['verwirrt','unsicher','confused']},
  {e:'🫤',k:['schiefer mund','naja','diagonal mouth','meh']},
  {e:'😟',k:['besorgt','worried']},
  {e:'🙁',k:['traurig','mundwinkel','frowning']},
  {e:'☹️',k:['traurig','sad','frown']},
  {e:'😮',k:['überrascht','oh','open mouth','surprised']},
  {e:'😲',k:['erstaunt','schockiert','astonished']},
  {e:'😳',k:['erröten','peinlich','flushed']},
  {e:'🥺',k:['bittend','hundeblick','pleading','bitte']},
  {e:'🥹',k:['gerührt','tränen zurückhalten','holding tears']},
  {e:'😨',k:['ängstlich','furcht','fearful']},
  {e:'😰',k:['angst','kalter schweiß','anxious']},
  {e:'😥',k:['traurig','erleichtert','sad relieved']},
  {e:'😢',k:['weinen','träne','cry','sad']},
  {e:'😭',k:['heulen','laut weinen','sob','bawling']},
  {e:'😱',k:['schrei','panik','scream','horror']},
  {e:'😖',k:['verzweifelt','confounded']},
  {e:'😣',k:['durchhalten','angestrengt','persevere']},
  {e:'😞',k:['enttäuscht','disappointed']},
  {e:'😓',k:['schwitzen','niedergeschlagen','downcast sweat']},
  {e:'😩',k:['erschöpft','jammern','weary']},
  {e:'😫',k:['müde','fertig','tired']},
  {e:'🥱',k:['gähnen','müde','langweilig','yawn']},
  {e:'😤',k:['schnauben','stolz','wütend','triumph']},
  {e:'😡',k:['wütend','rot','zornig','rage','angry']},
  {e:'😠',k:['sauer','verärgert','angry']},
  {e:'🤬',k:['fluchen','schimpfen','cursing','symbols']},
  {e:'😈',k:['teufel','grinsen','devil','evil']},
  {e:'👿',k:['teufel','wütend','imp']},
  {e:'💀',k:['totenkopf','tot','skull','dead']},
  {e:'☠️',k:['totenkopf','knochen','gift','skull crossbones']},
  {e:'💩',k:['kackhaufen','mist','poop']},
  {e:'🤡',k:['clown','witzfigur']},
  {e:'👹',k:['oger','monster','ogre']},
  {e:'👺',k:['kobold','goblin','tengu']},
  {e:'👻',k:['geist','gespenst','ghost','boo']},
  {e:'👽',k:['alien','außerirdisch','ufo']},
  {e:'👾',k:['monster','pixel','space invader','game']},
  {e:'🤖',k:['roboter','robot','bot']},
  {e:'😹',k:['katze','freudentränen','cat joy']},
  {e:'😻',k:['katze','herzaugen','heart eyes cat']},
  {e:'🙀',k:['katze','schreck','weary cat']},
  {e:'😿',k:['katze','weinen','crying cat']},
];

const PEOPLE = [
  {e:'👋',k:['winken','hallo','tschüss','wave','hello','bye']},
  {e:'✋',k:['stopp','hand','high five','raised hand']},
  {e:'👌',k:['ok','perfekt','okay']},
  {e:'🤌',k:['italienisch','geste','pinched fingers']},
  {e:'🤏',k:['wenig','klein','bisschen','pinching']},
  {e:'✌️',k:['peace','victory','frieden','sieg']},
  {e:'🤞',k:['daumen drücken','glück','crossed fingers','luck']},
  {e:'🫰',k:['fingerherz','geld','finger heart','snap']},
  {e:'🤟',k:['ich liebe dich','love you gesture']},
  {e:'🤘',k:['rock','metal','horns']},
  {e:'🤙',k:['ruf mich an','entspannt','call me','shaka']},
  {e:'👈',k:['zeigen links','point left']},
  {e:'👉',k:['zeigen rechts','point right']},
  {e:'👆',k:['zeigen oben','point up']},
  {e:'🖕',k:['mittelfinger','middle finger']},
  {e:'👇',k:['zeigen unten','point down']},
  {e:'☝️',k:['zeigefinger','erstens','index up']},
  {e:'👍',k:['daumen hoch','gut','gefällt mir','thumbs up','like']},
  {e:'👎',k:['daumen runter','schlecht','thumbs down','dislike']},
  {e:'✊',k:['faust','power','raised fist']},
  {e:'👊',k:['faustgruß','boxen','fist bump','punch']},
  {e:'👏',k:['klatschen','applaus','clap','bravo']},
  {e:'🙌',k:['hurra','hände hoch','feiern','raised hands']},
  {e:'🫶',k:['herz mit händen','heart hands']},
  {e:'👐',k:['offene hände','open hands']},
  {e:'🤲',k:['handflächen','bitten','palms up']},
  {e:'🤝',k:['handschlag','deal','abgemacht','handshake']},
  {e:'🙏',k:['danke','bitte','beten','hoffen','pray','thanks']},
  {e:'✍️',k:['schreiben','unterschreiben','writing']},
  {e:'💅',k:['nagellack','maniküre','nails']},
  {e:'💪',k:['muskel','stark','bizeps','training','strong','flex']},
  {e:'👂',k:['ohr','hören','ear','listen']},
  {e:'👃',k:['nase','riechen','nose','smell']},
  {e:'🧠',k:['gehirn','denken','brain','smart']},
  {e:'🦷',k:['zahn','zahnarzt','tooth']},
  {e:'👀',k:['augen','schauen','beobachten','eyes','look']},
  {e:'👅',k:['zunge','tongue']},
  {e:'👄',k:['mund','lippen','mouth','lips']},
  {e:'🫦',k:['lippe beißen','nervös','biting lip']},
  {e:'👶',k:['baby','kleinkind']},
  {e:'🧒',k:['kind','child']},
  {e:'🧑',k:['person','mensch','erwachsen']},
  {e:'👨',k:['mann','man']},
  {e:'🧔',k:['bart','beard']},
  {e:'👩',k:['frau','woman']},
  {e:'👴',k:['opa','alter mann','grandpa','old man']},
  {e:'👵',k:['oma','alte frau','grandma','old woman']},
  {e:'🙅',k:['nein','ablehnen','verboten','no gesture']},
  {e:'🙆',k:['ok','ja','einverstanden','ok gesture']},
  {e:'💁',k:['hinweis','tipp','bitteschön','tipping hand','sassy']},
  {e:'🙋',k:['melden','hand heben','ich','raising hand']},
  {e:'🙇',k:['verbeugen','entschuldigung','bow','sorry']},
  {e:'🤦',k:['facepalm','hand vor gesicht','oh nein']},
  {e:'🤷',k:['achselzucken','keine ahnung','shrug','egal']},
  {e:'👮',k:['polizei','police officer']},
  {e:'🕵️',k:['detektiv','spion','detective','spy']},
  {e:'👷',k:['bauarbeiter','helm','construction worker']},
  {e:'🤴',k:['prinz','könig','prince']},
  {e:'👸',k:['prinzessin','königin','princess']},
  {e:'👰',k:['braut','schleier','hochzeit','bride','wedding']},
  {e:'🤰',k:['schwanger','pregnant']},
  {e:'🎅',k:['weihnachtsmann','nikolaus','santa','christmas']},
  {e:'🦸',k:['superheld','superhero']},
  {e:'🧙',k:['zauberer','magier','hexe','mage','wizard']},
  {e:'🧚',k:['fee','elfe','fairy']},
  {e:'🧛',k:['vampir','dracula','vampire']},
  {e:'🧜',k:['meerjungfrau','nixe','mermaid']},
  {e:'🧟',k:['zombie','untot']},
  {e:'🚶',k:['gehen','spazieren','walking']},
  {e:'🏃',k:['laufen','rennen','joggen','running']},
  {e:'💃',k:['tanzen','frau','flamenco','dancing woman']},
  {e:'🕺',k:['tanzen','mann','disco','dancing man']},
  {e:'👯',k:['tanzen','zwillinge','party','bunny dancers']},
];

const SYMBOLS = [
  {e:'❤️',k:['rotes herz','liebe','red heart','love']},
  {e:'🩷',k:['rosa herz','pink heart']},
  {e:'🧡',k:['oranges herz','orange heart']},
  {e:'💛',k:['gelbes herz','yellow heart']},
  {e:'💚',k:['grünes herz','green heart']},
  {e:'💙',k:['blaues herz','blue heart']},
  {e:'🩵',k:['hellblaues herz','light blue heart']},
  {e:'💜',k:['lila herz','violettes herz','purple heart']},
  {e:'🤎',k:['braunes herz','brown heart']},
  {e:'🖤',k:['schwarzes herz','black heart']},
  {e:'🩶',k:['graues herz','grey heart']},
  {e:'🤍',k:['weißes herz','white heart']},
  {e:'💔',k:['gebrochenes herz','liebeskummer','broken heart']},
  {e:'❤️‍🔥',k:['brennendes herz','leidenschaft','heart on fire']},
  {e:'❤️‍🩹',k:['heilendes herz','pflaster','mending heart']},
  {e:'❣️',k:['herz ausrufezeichen','heart exclamation']},
  {e:'💕',k:['zwei herzen','two hearts']},
  {e:'💞',k:['kreisende herzen','revolving hearts']},
  {e:'💓',k:['schlagendes herz','herzschlag','beating heart']},
  {e:'💗',k:['wachsendes herz','growing heart']},
  {e:'💖',k:['funkelndes herz','sparkling heart']},
  {e:'💘',k:['herz mit pfeil','amor','cupid','heart arrow']},
  {e:'💝',k:['herz mit schleife','geschenk','heart ribbon']},
  {e:'💌',k:['liebesbrief','love letter']},
  {e:'💋',k:['kussmund','lippenstift','kiss mark']},
  {e:'💯',k:['hundert punkte','perfekt','100','hundred']},
  {e:'💢',k:['wut','ärger','anger symbol']},
  {e:'💥',k:['explosion','knall','boom','collision']},
  {e:'💫',k:['schwindel','sternchen','dizzy star']},
  {e:'💦',k:['tropfen','schweiß','spritzer','sweat drops']},
  {e:'💨',k:['staubwolke','schnell weg','dash','wind']},
  {e:'💬',k:['sprechblase','nachricht','speech bubble','chat']},
  {e:'💭',k:['gedankenblase','thought bubble']},
  {e:'💤',k:['schlafen','zzz','müde','sleep']},
  {e:'✨',k:['funkeln','glitzer','sparkles','magie']},
  {e:'⭐',k:['stern','star']},
  {e:'🌟',k:['leuchtender stern','glowing star']},
  {e:'⚡',k:['blitz','strom','energie','lightning','zap']},
  {e:'🔥',k:['feuer','flamme','heiß','fire','lit']},
  {e:'💎',k:['diamant','edelstein','juwel','diamond','gem']},
  {e:'🔔',k:['glocke','benachrichtigung','bell']},
  {e:'🎵',k:['note','musik','music note']},
  {e:'🎶',k:['noten','melodie','music notes']},
  {e:'✅',k:['haken','erledigt','richtig','check mark','done']},
  {e:'❌',k:['kreuz','falsch','nein','cross mark','x']},
  {e:'➕',k:['plus','hinzufügen','add']},
  {e:'❓',k:['fragezeichen','frage','question mark']},
  {e:'❗',k:['ausrufezeichen','wichtig','exclamation mark']},
  {e:'‼️',k:['doppeltes ausrufezeichen','double exclamation']},
  {e:'⚠️',k:['warnung','achtung','warning']},
  {e:'🚫',k:['verboten','gesperrt','prohibited','no']},
  {e:'♻️',k:['recycling','umwelt','recycle']},
  {e:'🔴',k:['roter kreis','rot','red circle']},
  {e:'🟢',k:['grüner kreis','grün','green circle']},
  {e:'🔵',k:['blauer kreis','blau','blue circle']},
  {e:'🟡',k:['gelber kreis','gelb','yellow circle']},
  {e:'⬆️',k:['pfeil hoch','oben','arrow up']},
  {e:'⬇️',k:['pfeil runter','unten','arrow down']},
  {e:'⬅️',k:['pfeil links','arrow left']},
  {e:'➡️',k:['pfeil rechts','arrow right']},
  {e:'🔄',k:['aktualisieren','neu laden','refresh','reload']},
];

const NATURE = [
  {e:'🐶',k:['hund','welpe','dog','puppy']},
  {e:'🐱',k:['katze','kätzchen','cat','kitten']},
  {e:'🐭',k:['maus','mouse']},
  {e:'🐹',k:['hamster']},
  {e:'🐰',k:['hase','kaninchen','rabbit','bunny']},
  {e:'🦊',k:['fuchs','fox']},
  {e:'🐻',k:['bär','bear']},
  {e:'🐼',k:['panda']},
  {e:'🐻‍❄️',k:['eisbär','polar bear']},
  {e:'🐨',k:['koala']},
  {e:'🐯',k:['tiger']},
  {e:'🦁',k:['löwe','lion']},
  {e:'🐮',k:['kuh','rind','cow']},
  {e:'🐷',k:['schwein','pig']},
  {e:'🐸',k:['frosch','frog']},
  {e:'🐵',k:['affe','monkey']},
  {e:'🙈',k:['nichts sehen','affe','see no evil']},
  {e:'🙉',k:['nichts hören','affe','hear no evil']},
  {e:'🙊',k:['nichts sagen','affe','speak no evil']},
  {e:'🐔',k:['huhn','henne','chicken']},
  {e:'🐧',k:['pinguin','penguin']},
  {e:'🐦',k:['vogel','bird']},
  {e:'🐤',k:['küken','chick']},
  {e:'🦆',k:['ente','duck']},
  {e:'🦅',k:['adler','eagle']},
  {e:'🦉',k:['eule','owl']},
  {e:'🦇',k:['fledermaus','bat']},
  {e:'🐺',k:['wolf']},
  {e:'🐴',k:['pferd','horse']},
  {e:'🦄',k:['einhorn','unicorn']},
  {e:'🐝',k:['biene','honig','bee']},
  {e:'🐛',k:['raupe','käfer','bug','caterpillar']},
  {e:'🦋',k:['schmetterling','butterfly']},
  {e:'🐌',k:['schnecke','langsam','snail','slow']},
  {e:'🐞',k:['marienkäfer','glückskäfer','ladybug']},
  {e:'🐜',k:['ameise','ant']},
  {e:'🕷️',k:['spinne','spider']},
  {e:'🕸️',k:['spinnennetz','spider web']},
  {e:'🐢',k:['schildkröte','turtle']},
  {e:'🐍',k:['schlange','snake']},
  {e:'🦎',k:['echse','gecko','lizard']},
  {e:'🦖',k:['t-rex','dino','dinosaurier']},
  {e:'🦕',k:['dinosaurier','langhals','dinosaur']},
  {e:'🐙',k:['oktopus','krake','octopus']},
  {e:'🦐',k:['garnele','shrimp']},
  {e:'🦞',k:['hummer','lobster']},
  {e:'🦀',k:['krabbe','krebs','crab']},
  {e:'🐠',k:['fisch','tropisch','tropical fish']},
  {e:'🐟',k:['fisch','fish']},
  {e:'🐬',k:['delfin','dolphin']},
  {e:'🐳',k:['wal','fontäne','whale']},
  {e:'🦈',k:['hai','shark']},
  {e:'🐊',k:['krokodil','crocodile']},
  {e:'🦓',k:['zebra']},
  {e:'🦍',k:['gorilla']},
  {e:'🐘',k:['elefant','elephant']},
  {e:'🦒',k:['giraffe']},
  {e:'🦘',k:['känguru','kangaroo']},
  {e:'🐑',k:['schaf','wolle','sheep']},
  {e:'🦙',k:['lama','alpaka','llama']},
  {e:'🐐',k:['ziege','goat']},
  {e:'🦌',k:['hirsch','reh','deer']},
  {e:'🦜',k:['papagei','parrot']},
  {e:'🦩',k:['flamingo']},
  {e:'🕊️',k:['taube','frieden','dove','peace']},
  {e:'🦝',k:['waschbär','raccoon']},
  {e:'🦥',k:['faultier','sloth']},
  {e:'🦦',k:['otter']},
  {e:'🦔',k:['igel','hedgehog']},
  {e:'🐿️',k:['eichhörnchen','squirrel']},
  {e:'🌵',k:['kaktus','cactus']},
  {e:'🎄',k:['tannenbaum','weihnachtsbaum','christmas tree']},
  {e:'🌲',k:['nadelbaum','tanne','evergreen tree']},
  {e:'🌳',k:['baum','laubbaum','tree']},
  {e:'🌴',k:['palme','urlaub','palm tree']},
  {e:'🌱',k:['setzling','pflanze','wachsen','seedling']},
  {e:'🌿',k:['kraut','pflanze','herb']},
  {e:'☘️',k:['klee','shamrock']},
  {e:'🍀',k:['kleeblatt','glück','four leaf clover','luck']},
  {e:'🍁',k:['ahornblatt','herbst','maple leaf']},
  {e:'🍃',k:['blätter','wind','leaves']},
  {e:'🍄',k:['pilz','fliegenpilz','mushroom']},
  {e:'💐',k:['blumenstrauß','bouquet']},
  {e:'🌷',k:['tulpe','tulip']},
  {e:'🌹',k:['rose']},
  {e:'🥀',k:['verwelkte blume','wilted flower']},
  {e:'🌸',k:['kirschblüte','rosa','cherry blossom']},
  {e:'🌼',k:['blüte','gänseblümchen','blossom','daisy']},
  {e:'🌻',k:['sonnenblume','sunflower']},
  {e:'🌙',k:['halbmond','nacht','crescent moon','night']},
  {e:'🌍',k:['erde','welt','globus','earth','world']},
  {e:'❄️',k:['schneeflocke','winter','snowflake']},
  {e:'⛄',k:['schneemann','snowman']},
  {e:'🌈',k:['regenbogen','rainbow']},
  {e:'☀️',k:['sonne','sonnig','sun','sunny']},
  {e:'☁️',k:['wolke','bewölkt','cloud']},
  {e:'🌧️',k:['regen','rain']},
  {e:'⛈️',k:['gewitter','sturm','thunderstorm']},
  {e:'🌊',k:['welle','meer','ozean','wave','ocean']},
  {e:'💧',k:['tropfen','wasser','droplet','water']},
];

const FOOD = [
  {e:'🍎',k:['apfel','apple']},
  {e:'🍐',k:['birne','pear']},
  {e:'🍊',k:['orange','mandarine','tangerine']},
  {e:'🍋',k:['zitrone','sauer','lemon']},
  {e:'🍌',k:['banane','banana']},
  {e:'🍉',k:['wassermelone','watermelon']},
  {e:'🍇',k:['trauben','weintrauben','grapes']},
  {e:'🍓',k:['erdbeere','strawberry']},
  {e:'🫐',k:['blaubeeren','heidelbeeren','blueberries']},
  {e:'🍒',k:['kirschen','cherries']},
  {e:'🍑',k:['pfirsich','po','peach']},
  {e:'🍍',k:['ananas','pineapple']},
  {e:'🥥',k:['kokosnuss','coconut']},
  {e:'🥝',k:['kiwi']},
  {e:'🍅',k:['tomate','tomato']},
  {e:'🍆',k:['aubergine','eggplant']},
  {e:'🥑',k:['avocado']},
  {e:'🥦',k:['brokkoli','broccoli']},
  {e:'🥬',k:['salat','blattgemüse','leafy greens']},
  {e:'🥒',k:['gurke','cucumber']},
  {e:'🌶️',k:['chili','scharf','hot pepper','spicy']},
  {e:'🌽',k:['mais','maiskolben','corn']},
  {e:'🥕',k:['karotte','möhre','carrot']},
  {e:'🧄',k:['knoblauch','garlic']},
  {e:'🧅',k:['zwiebel','onion']},
  {e:'🥐',k:['croissant','hörnchen']},
  {e:'🍞',k:['brot','toast','bread']},
  {e:'🥖',k:['baguette','stangenbrot']},
  {e:'🥨',k:['brezel','pretzel']},
  {e:'🧀',k:['käse','cheese']},
  {e:'🥚',k:['ei','egg']},
  {e:'🍳',k:['spiegelei','braten','kochen','fried egg','cooking']},
  {e:'🥞',k:['pfannkuchen','pancakes']},
  {e:'🧇',k:['waffel','waffle']},
  {e:'🥓',k:['speck','bacon']},
  {e:'🥩',k:['steak','fleisch','meat','cut of meat']},
  {e:'🍗',k:['hähnchenkeule','poultry leg','chicken']},
  {e:'🌭',k:['hotdog','wurst']},
  {e:'🍔',k:['burger','hamburger']},
  {e:'🍟',k:['pommes','fritten','fries']},
  {e:'🍕',k:['pizza']},
  {e:'🥪',k:['sandwich','belegtes brot']},
  {e:'🥙',k:['döner','pita','fladenbrot','stuffed flatbread']},
  {e:'🧆',k:['falafel']},
  {e:'🌮',k:['taco']},
  {e:'🌯',k:['burrito','wrap']},
  {e:'🥗',k:['salat','gesund','green salad']},
  {e:'🥘',k:['pfannengericht','paella','pan of food']},
  {e:'🍝',k:['spaghetti','pasta','nudeln']},
  {e:'🍜',k:['ramen','nudelsuppe','noodles']},
  {e:'🍲',k:['eintopf','topf','stew']},
  {e:'🍛',k:['curry','reisgericht','curry rice']},
  {e:'🍣',k:['sushi']},
  {e:'🍱',k:['bento','lunchbox']},
  {e:'🥟',k:['teigtasche','maultasche','dumpling']},
  {e:'🍤',k:['garnele','tempura','fried shrimp']},
  {e:'🍦',k:['softeis','soft ice cream']},
  {e:'🍨',k:['eis','eisbecher','ice cream']},
  {e:'🧁',k:['cupcake','muffin']},
  {e:'🍰',k:['torte','kuchenstück','shortcake']},
  {e:'🎂',k:['geburtstagstorte','geburtstag','birthday cake']},
  {e:'🍭',k:['lutscher','lollipop']},
  {e:'🍬',k:['bonbon','süßigkeit','candy']},
  {e:'🍫',k:['schokolade','chocolate']},
  {e:'🍿',k:['popcorn','kino']},
  {e:'🍩',k:['donut','doughnut']},
  {e:'🍪',k:['keks','plätzchen','cookie']},
  {e:'🥜',k:['erdnuss','nüsse','peanuts']},
  {e:'🍯',k:['honig','honey']},
  {e:'🥛',k:['milch','glas milch','milk']},
  {e:'☕',k:['kaffee','heißgetränk','coffee']},
  {e:'🫖',k:['teekanne','teapot']},
  {e:'🍵',k:['tee','grüner tee','tea']},
  {e:'🧃',k:['saft','trinkpäckchen','juice box']},
  {e:'🥤',k:['becher','softdrink','strohhalm','cup with straw']},
  {e:'🧋',k:['bubble tea','boba']},
  {e:'🍺',k:['bier','beer']},
  {e:'🍻',k:['anstoßen','prost','bier','beers','cheers']},
  {e:'🥂',k:['sekt','anstoßen','feiern','champagne','clink']},
  {e:'🍷',k:['wein','rotwein','wine']},
  {e:'🥃',k:['whisky','schnaps','tumbler']},
  {e:'🍸',k:['cocktail','martini']},
  {e:'🍹',k:['cocktail','tropisch','tropical drink']},
  {e:'🍾',k:['sektflasche','korken','champagne bottle']},
  {e:'🧊',k:['eiswürfel','ice cube']},
];

const ACTIVITY = [
  {e:'⚽',k:['fußball','soccer','football']},
  {e:'🏀',k:['basketball']},
  {e:'🏈',k:['american football']},
  {e:'⚾',k:['baseball']},
  {e:'🎾',k:['tennis']},
  {e:'🏐',k:['volleyball']},
  {e:'🎱',k:['billard','8 ball','pool']},
  {e:'🏓',k:['tischtennis','ping pong']},
  {e:'🏸',k:['badminton','federball']},
  {e:'🏒',k:['eishockey','hockey']},
  {e:'🥅',k:['tor','netz','goal']},
  {e:'⛳',k:['golf','fahne','flag in hole']},
  {e:'🏹',k:['bogenschießen','pfeil und bogen','archery']},
  {e:'🎣',k:['angeln','fishing']},
  {e:'🥊',k:['boxen','boxhandschuh','boxing']},
  {e:'🥋',k:['kampfsport','judo','karate','martial arts']},
  {e:'🛹',k:['skateboard']},
  {e:'🎿',k:['ski','skifahren']},
  {e:'🏂',k:['snowboard']},
  {e:'🪂',k:['fallschirm','parachute']},
  {e:'🏋️',k:['gewichtheben','fitness','weights','gym']},
  {e:'🤸',k:['rad schlagen','turnen','cartwheel']},
  {e:'🧘',k:['yoga','meditation','lotus']},
  {e:'🏄',k:['surfen','surfing']},
  {e:'🏊',k:['schwimmen','swimming']},
  {e:'🧗',k:['klettern','climbing']},
  {e:'🚵',k:['mountainbike','mountain biking']},
  {e:'🚴',k:['radfahren','fahrrad fahren','cycling']},
  {e:'🏆',k:['pokal','sieger','gewinner','trophy','winner']},
  {e:'🥇',k:['gold','erster platz','first place']},
  {e:'🥈',k:['silber','zweiter platz','second place']},
  {e:'🥉',k:['bronze','dritter platz','third place']},
  {e:'🏅',k:['medaille','medal']},
  {e:'🎫',k:['ticket','eintrittskarte']},
  {e:'🎭',k:['theater','masken','performing arts']},
  {e:'🎨',k:['kunst','malen','palette','art','paint']},
  {e:'🎬',k:['filmklappe','kino','clapper','movie']},
  {e:'🎤',k:['mikrofon','singen','karaoke','microphone']},
  {e:'🎧',k:['kopfhörer','musik hören','headphones']},
  {e:'🎹',k:['klavier','keyboard','piano']},
  {e:'🥁',k:['schlagzeug','trommel','drum']},
  {e:'🎷',k:['saxophon','saxophone']},
  {e:'🎺',k:['trompete','trumpet']},
  {e:'🎸',k:['gitarre','guitar']},
  {e:'🎻',k:['geige','violine','violin']},
  {e:'🎲',k:['würfel','spiel','dice','game']},
  {e:'🎯',k:['dart','ziel','volltreffer','target','bullseye']},
  {e:'🎮',k:['gaming','controller','zocken','video game']},
  {e:'🎰',k:['spielautomat','casino','slot machine']},
  {e:'🧩',k:['puzzle','puzzleteil','jigsaw']},
  {e:'🚗',k:['auto','wagen','car']},
  {e:'🚕',k:['taxi']},
  {e:'🚌',k:['bus']},
  {e:'🏎️',k:['rennwagen','formel 1','racing car']},
  {e:'🚓',k:['polizeiauto','police car']},
  {e:'🚑',k:['krankenwagen','rettung','ambulance']},
  {e:'🚒',k:['feuerwehr','fire engine']},
  {e:'🚚',k:['lkw','lieferwagen','truck']},
  {e:'🛴',k:['tretroller','scooter']},
  {e:'🚲',k:['fahrrad','rad','bicycle','bike']},
  {e:'🛵',k:['motorroller','vespa','scooter']},
  {e:'🏍️',k:['motorrad','motorcycle']},
  {e:'🚨',k:['sirene','alarm','blaulicht','police light']},
  {e:'🚦',k:['ampel','traffic light']},
  {e:'🚧',k:['baustelle','absperrung','construction']},
  {e:'🚆',k:['zug','bahn','train']},
  {e:'✈️',k:['flugzeug','fliegen','airplane','flight']},
  {e:'🚀',k:['rakete','start','rocket','launch']},
  {e:'🛸',k:['ufo','fliegende untertasse','flying saucer']},
  {e:'🚁',k:['hubschrauber','helikopter','helicopter']},
  {e:'⛵',k:['segelboot','segeln','sailboat']},
  {e:'🚢',k:['schiff','ship']},
  {e:'⚓',k:['anker','anchor']},
  {e:'🗺️',k:['landkarte','karte','world map']},
  {e:'🗿',k:['moai','statue','steinkopf']},
  {e:'🏰',k:['schloss','burg','castle']},
  {e:'🎡',k:['riesenrad','jahrmarkt','ferris wheel']},
  {e:'🎢',k:['achterbahn','roller coaster']},
  {e:'🏖️',k:['strand','urlaub','beach']},
  {e:'🏝️',k:['insel','einsame insel','island']},
  {e:'🌋',k:['vulkan','ausbruch','volcano']},
  {e:'⛰️',k:['berg','mountain']},
  {e:'🏕️',k:['camping','campen']},
  {e:'⛺',k:['zelt','zelten','tent']},
  {e:'🏠',k:['haus','zuhause','daheim','house','home']},
  {e:'🏢',k:['bürogebäude','büro','office building']},
  {e:'🏥',k:['krankenhaus','klinik','hospital']},
  {e:'🧳',k:['koffer','reisen','gepäck','luggage','travel']},
];

const OBJECTS = [
  {e:'⌚',k:['armbanduhr','uhr','watch']},
  {e:'📱',k:['handy','smartphone','telefon','phone']},
  {e:'💻',k:['laptop','computer','notebook']},
  {e:'⌨️',k:['tastatur','keyboard']},
  {e:'🖥️',k:['desktop','monitor','bildschirm','computer']},
  {e:'💾',k:['diskette','speichern','floppy disk','save']},
  {e:'📷',k:['kamera','fotoapparat','camera']},
  {e:'📸',k:['foto','blitz','camera flash']},
  {e:'🎥',k:['filmkamera','movie camera']},
  {e:'📞',k:['telefonhörer','anruf','telephone','call']},
  {e:'📺',k:['fernseher','tv','television']},
  {e:'🧭',k:['kompass','navigation','compass']},
  {e:'⏰',k:['wecker','alarm clock']},
  {e:'⌛',k:['sanduhr','zeit','hourglass','time']},
  {e:'🔋',k:['batterie','akku','battery']},
  {e:'🔌',k:['stecker','strom','plug']},
  {e:'💡',k:['glühbirne','idee','light bulb','idea']},
  {e:'🔦',k:['taschenlampe','flashlight']},
  {e:'💸',k:['geld mit flügeln','geld weg','money wings']},
  {e:'💰',k:['geldsack','reich','money bag']},
  {e:'💳',k:['kreditkarte','bezahlen','credit card']},
  {e:'⚖️',k:['waage','gerechtigkeit','balance scale']},
  {e:'🧰',k:['werkzeugkasten','toolbox']},
  {e:'🔧',k:['schraubenschlüssel','wrench']},
  {e:'🔨',k:['hammer']},
  {e:'🛠️',k:['werkzeug','reparieren','hammer and wrench','tools']},
  {e:'⚙️',k:['zahnrad','einstellungen','gear','settings']},
  {e:'💣',k:['bombe','bomb']},
  {e:'🔪',k:['messer','küchenmesser','knife']},
  {e:'🛡️',k:['schild','schutz','shield']},
  {e:'🚬',k:['zigarette','rauchen','cigarette','smoking']},
  {e:'🔮',k:['kristallkugel','wahrsagen','crystal ball']},
  {e:'🔭',k:['teleskop','sterne','telescope']},
  {e:'🔬',k:['mikroskop','labor','microscope']},
  {e:'💊',k:['tablette','pille','medizin','pill']},
  {e:'💉',k:['spritze','impfung','syringe']},
  {e:'🩹',k:['pflaster','bandage']},
  {e:'🌡️',k:['thermometer','fieber','temperatur']},
  {e:'🧬',k:['dna','gene']},
  {e:'🦠',k:['virus','bakterie','mikrobe','microbe']},
  {e:'🧪',k:['reagenzglas','experiment','test tube']},
  {e:'🧹',k:['besen','putzen','fegen','broom']},
  {e:'🧻',k:['klopapier','toilet paper']},
  {e:'🚽',k:['toilette','klo','toilet']},
  {e:'🚿',k:['dusche','shower']},
  {e:'🛁',k:['badewanne','baden','bathtub']},
  {e:'🧼',k:['seife','waschen','soap']},
  {e:'🔑',k:['schlüssel','key']},
  {e:'🚪',k:['tür','door']},
  {e:'🪑',k:['stuhl','chair']},
  {e:'🛋️',k:['sofa','couch']},
  {e:'🛏️',k:['bett','schlafen','bed']},
  {e:'🧸',k:['teddybär','kuscheltier','teddy bear']},
  {e:'🛍️',k:['einkaufstüten','shoppen','shopping bags']},
  {e:'🛒',k:['einkaufswagen','shopping cart']},
  {e:'🎁',k:['geschenk','überraschung','gift','present']},
  {e:'🎈',k:['luftballon','balloon']},
  {e:'🎀',k:['schleife','ribbon']},
  {e:'🎉',k:['konfetti','party','feiern','tada','celebration']},
  {e:'🎊',k:['konfettiball','confetti ball']},
  {e:'🪄',k:['zauberstab','magie','magic wand']},
  {e:'✉️',k:['brief','umschlag','envelope','mail']},
  {e:'📩',k:['email','posteingang','incoming envelope']},
  {e:'📦',k:['paket','karton','package']},
  {e:'📄',k:['dokument','seite','blatt','document','page']},
  {e:'📊',k:['balkendiagramm','statistik','bar chart']},
  {e:'📈',k:['aufwärtstrend','steigend','chart up']},
  {e:'📉',k:['abwärtstrend','fallend','chart down']},
  {e:'📅',k:['kalender','termin','calendar','date']},
  {e:'📁',k:['ordner','folder']},
  {e:'📚',k:['bücher','stapel','books']},
  {e:'📖',k:['buch','lesen','open book','read']},
  {e:'📎',k:['büroklammer','paperclip']},
  {e:'📌',k:['pinnnadel','pushpin','pin']},
  {e:'📍',k:['standort','ort','stecknadel','location','pin']},
  {e:'✂️',k:['schere','schneiden','scissors']},
  {e:'✏️',k:['bleistift','zeichnen','pencil']},
  {e:'📝',k:['notiz','schreiben','memo','note']},
  {e:'🔍',k:['lupe','suchen','magnifier','search']},
  {e:'🔒',k:['schloss','gesperrt','verschlüsselt','lock']},
  {e:'🔓',k:['offenes schloss','entsperrt','unlock']},
];

const CATEGORIES = [
  {id:'recent', name:'Zuletzt benutzt', icon:'🕘', data:null},
  {id:'smileys', name:'Smileys', icon:'😀', data:SMILEYS},
  {id:'people', name:'Gesten & Menschen', icon:'👋', data:PEOPLE},
  {id:'symbols', name:'Herzen & Symbole', icon:'❤️', data:SYMBOLS},
  {id:'nature', name:'Tiere & Natur', icon:'🐻', data:NATURE},
  {id:'food', name:'Essen & Trinken', icon:'🍕', data:FOOD},
  {id:'activity', name:'Aktivitäten & Reisen', icon:'⚽', data:ACTIVITY},
  {id:'objects', name:'Objekte', icon:'💡', data:OBJECTS},
];

/* ===================== Hilfsfunktionen ===================== */

/** Faltet einen String für die Suche: Kleinschreibung, Umlaute, Akzente. */
function fold(s) {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Flacher Suchindex über alle Kategorien; wird einmalig lazy gebaut. */
let searchIndex = null;

function getSearchIndex() {
  if (searchIndex) return searchIndex;
  searchIndex = [];
  const seen = new Set();
  for (const cat of CATEGORIES) {
    if (!cat.data) continue;
    for (const entry of cat.data) {
      if (seen.has(entry.e)) continue;
      seen.add(entry.e);
      searchIndex.push({ e: entry.e, k: entry.k, s: fold(entry.k.join(' ')) });
    }
  }
  return searchIndex;
}

/* ---------- Zuletzt benutzt (localStorage "mm.recentEmoji") ---------- */

function loadRecent() {
  try {
    const raw = localStorage.getItem(LS_RECENT);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => typeof x === 'string' && x.length > 0).slice(0, RECENT_MAX);
  } catch (_err) {
    return [];
  }
}

function saveRecent(list) {
  try {
    localStorage.setItem(LS_RECENT, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch (_err) {
    /* localStorage voll/gesperrt – Recents sind verzichtbar */
  }
}

function addRecent(emoji) {
  const list = loadRecent().filter((e) => e !== emoji);
  list.unshift(emoji);
  saveRecent(list);
}

/** Kurzer deutscher Name (erstes Schlagwort) für Tooltip/Aria. */
let nameMap = null;

function emojiName(emoji) {
  if (!nameMap) {
    nameMap = new Map();
    for (const entry of getSearchIndex()) nameMap.set(entry.e, entry.k[0]);
  }
  return nameMap.get(emoji) || emoji;
}

/* ===================== Picker ===================== */

let activePicker = null; // { root, destroy() }

/**
 * Öffnet den Emoji-Picker als Popover nahe anchorEl.
 * Siehe API-Dokumentation im Kopf der Datei.
 */
export function openEmojiPicker({ anchorEl, onPick, onClose } = {}) {
  if (!anchorEl || typeof anchorEl.getBoundingClientRect !== 'function') {
    throw new TypeError('openEmojiPicker: anchorEl (HTMLElement) ist erforderlich');
  }
  if (typeof onPick !== 'function') {
    throw new TypeError('openEmojiPicker: onPick (Funktion) ist erforderlich');
  }

  // Es ist immer nur ein Picker gleichzeitig offen.
  if (activePicker) activePicker.destroy();

  let closed = false;
  const gridCache = new Map(); // Kategorie-ID -> gebautes Grid-Element
  let currentCatId = loadRecent().length > 0 ? 'recent' : 'smileys';
  let firstResultEmoji = null; // erstes Suchergebnis (für Enter)
  let searchTimer = null;
  let lastSearchRender = 0;

  /* ---------- Grundgerüst ---------- */

  const root = document.createElement('div');
  root.className = 'mm-emoji-picker';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Emoji auswählen');

  // Suchfeld
  const searchWrap = document.createElement('div');
  searchWrap.className = 'mm-emoji-search';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Emoji suchen …';
  searchInput.setAttribute('aria-label', 'Emoji suchen');
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;
  searchWrap.append(searchInput);

  // Kategorie-Tabs
  const tabs = document.createElement('div');
  tabs.className = 'mm-emoji-tabs';
  tabs.setAttribute('role', 'tablist');
  const tabButtons = new Map();
  for (const cat of CATEGORIES) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'mm-emoji-tab';
    tab.textContent = cat.icon;
    tab.title = cat.name;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-label', cat.name);
    tab.addEventListener('click', () => {
      searchInput.value = '';
      showCategory(cat.id);
      searchInput.focus();
    });
    tabButtons.set(cat.id, tab);
    tabs.append(tab);
  }

  // Kategorie-Überschrift + scrollbarer Grid-Bereich
  const title = document.createElement('div');
  title.className = 'mm-emoji-title';
  const scroll = document.createElement('div');
  scroll.className = 'mm-emoji-scroll';

  root.append(searchWrap, tabs, title, scroll);

  /* ---------- Grid-Aufbau (erst beim Öffnen / ersten Besuch) ---------- */

  function makeEmojiButton(emoji, kw) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mm-emoji-btn';
    btn.textContent = emoji;
    const name = (kw && kw[0]) || emojiName(emoji);
    btn.title = name;
    btn.setAttribute('aria-label', name);
    btn.addEventListener('click', () => pick(emoji));
    return btn;
  }

  function buildGrid(entries) {
    const grid = document.createElement('div');
    grid.className = 'mm-emoji-grid';
    const frag = document.createDocumentFragment();
    for (const entry of entries) frag.append(makeEmojiButton(entry.e, entry.k));
    grid.append(frag);
    return grid;
  }

  function makeEmpty(text) {
    const empty = document.createElement('div');
    empty.className = 'mm-emoji-empty';
    empty.textContent = text;
    return empty;
  }

  function categoryGrid(cat) {
    if (cat.id === 'recent') {
      // Recents nie cachen – sie ändern sich mit jeder Auswahl.
      const recent = loadRecent();
      if (recent.length === 0) {
        return makeEmpty('Noch keine zuletzt benutzten Emojis.');
      }
      return buildGrid(recent.map((e) => ({ e, k: null })));
    }
    let grid = gridCache.get(cat.id);
    if (!grid) {
      grid = buildGrid(cat.data);
      gridCache.set(cat.id, grid);
    }
    return grid;
  }

  function showCategory(catId) {
    const cat = CATEGORIES.find((c) => c.id === catId) || CATEGORIES[1];
    currentCatId = cat.id;
    firstResultEmoji = null;
    for (const [id, tab] of tabButtons) {
      tab.classList.toggle('active', id === cat.id);
      tab.setAttribute('aria-selected', id === cat.id ? 'true' : 'false');
    }
    title.textContent = cat.name;
    scroll.textContent = '';
    scroll.append(categoryGrid(cat));
    scroll.scrollTop = 0;
  }

  /* ---------- Suche (gedrosselt) ---------- */

  function renderSearch() {
    const query = fold(searchInput.value.trim());
    if (!query) {
      showCategory(currentCatId);
      return;
    }
    const results = [];
    for (const entry of getSearchIndex()) {
      if (entry.s.includes(query)) {
        results.push(entry);
        if (results.length >= SEARCH_MAX_RESULTS) break;
      }
    }
    firstResultEmoji = results.length > 0 ? results[0].e : null;
    for (const [, tab] of tabButtons) {
      tab.classList.remove('active');
      tab.setAttribute('aria-selected', 'false');
    }
    title.textContent = results.length > 0
      ? `Suchergebnisse (${results.length})`
      : 'Suchergebnisse';
    scroll.textContent = '';
    if (results.length === 0) {
      scroll.append(makeEmpty('Keine Emojis gefunden.'));
    } else {
      scroll.append(buildGrid(results));
    }
    scroll.scrollTop = 0;
  }

  function scheduleSearch() {
    if (searchTimer !== null) return;
    const wait = Math.max(0, SEARCH_THROTTLE_MS - (Date.now() - lastSearchRender));
    searchTimer = setTimeout(() => {
      searchTimer = null;
      lastSearchRender = Date.now();
      if (!closed) renderSearch();
    }, wait);
  }

  /* ---------- Auswahl / Schließen ---------- */

  function pick(emoji) {
    addRecent(emoji);
    destroy();
    try {
      onPick(emoji);
    } catch (err) {
      console.error('emoji: onPick fehlgeschlagen', err);
    }
  }

  function destroy() {
    if (closed) return;
    closed = true;
    if (searchTimer !== null) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onDocKeyDown, true);
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    root.remove();
    if (activePicker && activePicker.root === root) activePicker = null;
    if (typeof onClose === 'function') {
      try {
        onClose();
      } catch (err) {
        console.error('emoji: onClose fehlgeschlagen', err);
      }
    }
  }

  /* ---------- Positionierung (Viewport-Kollision) ---------- */

  function position() {
    if (closed) return;
    const margin = 8;
    const gap = 6;
    const rect = anchorEl.getBoundingClientRect();
    const pw = root.offsetWidth;
    const ph = root.offsetHeight;

    // Horizontal: an der Anker-Mitte ausrichten, in den Viewport klemmen.
    let x = rect.left + rect.width / 2 - pw / 2;
    x = Math.max(margin, Math.min(x, window.innerWidth - pw - margin));

    // Vertikal: bevorzugt unterhalb; bei Kollision automatisch oberhalb.
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    let y;
    if (spaceBelow >= ph || spaceBelow >= spaceAbove) {
      y = rect.bottom + gap;
      root.classList.remove('above');
    } else {
      y = rect.top - gap - ph;
      root.classList.add('above');
    }
    y = Math.max(margin, Math.min(y, window.innerHeight - ph - margin));

    root.style.left = `${Math.round(x)}px`;
    root.style.top = `${Math.round(y)}px`;
  }

  /* ---------- Events ---------- */

  function onDocPointerDown(e) {
    const t = e.target;
    if (root.contains(t)) return;
    // Klicks auf den Anker nicht abfangen, damit Toggle möglich bleibt.
    if (t === anchorEl || (anchorEl.contains && anchorEl.contains(t))) return;
    destroy();
  }

  function onDocKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      destroy();
    }
  }

  searchInput.addEventListener('input', scheduleSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Enter wählt das erste Suchergebnis (falls vorhanden).
      if (searchInput.value.trim() && firstResultEmoji) pick(firstResultEmoji);
    }
  });

  document.addEventListener('pointerdown', onDocPointerDown, true);
  document.addEventListener('keydown', onDocKeyDown, true);
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);

  /* ---------- Öffnen ---------- */

  root.style.visibility = 'hidden';
  document.body.append(root);
  showCategory(currentCatId);
  position();
  root.style.visibility = '';
  requestAnimationFrame(() => {
    if (!closed) searchInput.focus();
  });

  activePicker = { root, destroy };
  return { close: destroy };
}
