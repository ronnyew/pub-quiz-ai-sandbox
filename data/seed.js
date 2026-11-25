const topicPacks = [
  {
    topicPackId: 'pop_culture_01',
    title: 'Pop Culture & Cinema',
    slug: 'pop-culture-and-cinema',
    description: 'Blockbusters, icons, and the films everyone claims to have seen.',
    category: 'Film & Media',
    icon: 'movie',
    isFeatured: true,
  },
  {
    topicPackId: 'science_tech_01',
    title: 'Science & Technology',
    slug: 'science-and-technology',
    description: 'Spaceflight, circuits, and the machines that run the night.',
    category: 'Tech / Dev',
    icon: 'memory',
    isFeatured: false,
  },
  {
    topicPackId: 'craft_beer_01',
    title: 'Craft Beer & Ales',
    slug: 'craft-beer-and-ales',
    description: 'Hops, malt, and the pubs that pour them.',
    category: 'Brewery',
    icon: 'sports_bar',
    isFeatured: true,
  },
  {
    topicPackId: 'world_history_01',
    title: 'World History & Geo',
    slug: 'world-history-and-geo',
    description: 'Empires, borders, and the maps they left behind.',
    category: 'Cartography',
    icon: 'public',
    isFeatured: false,
  },
  {
    topicPackId: 'music_80s_90s_01',
    title: '80s & 90s Music Trivia',
    slug: 'eighties-and-nineties-music',
    description: 'Chart hits, music videos, and the bands that owned the dial.',
    category: 'Music & Audio',
    icon: 'music_note',
    isFeatured: false,
  },
  {
    topicPackId: 'video_game_lore_01',
    title: 'Video Game Lore',
    slug: 'video-game-lore',
    description: 'Consoles, characters, and the studios behind them.',
    category: 'Gaming',
    icon: 'sports_esports',
    isFeatured: false,
  },
  {
    topicPackId: 'sports_arena_01',
    title: 'Sports Arena Classics',
    slug: 'sports-arena-classics',
    description: 'Olympics, league lore, and the chants from the stands.',
    category: 'Sports',
    icon: 'stadium',
    isFeatured: false,
  },
];

const packById = new Map(topicPacks.map((pack) => [pack.topicPackId, pack]));
const LETTERS = new Set(['A', 'B', 'C', 'D']);
const CITATION = [{ title: 'Pub Quiz house notes', link: 'https://example.com/pub-quiz-seed' }];

function card(packId, index, text, correct, wrongs, correctLetter, explanation) {
  const pack = packById.get(packId);
  if (!LETTERS.has(correctLetter)) {
    throw new TypeError(`invalid correctLetter for ${packId} ${index}`);
  }
  const correctSlot = 'ABCD'.indexOf(correctLetter);
  const texts = [];
  let wrongIndex = 0;
  for (let slot = 0; slot < 4; slot += 1) {
    if (slot === correctSlot) texts.push(correct);
    else {
      texts.push(wrongs[wrongIndex]);
      wrongIndex += 1;
    }
  }
  return {
    questionId: `${packId}_q${String(index).padStart(2, '0')}`,
    topicPackId: packId,
    category: pack.category,
    basePoints: 10,
    questionText: text,
    options: ['A', 'B', 'C', 'D'].map((id, slot) => ({ id, text: texts[slot] })),
    correctAnswerId: correctLetter,
    explanation,
    sourceCitations: CITATION,
  };
}

// [packId, index, questionText, correct, wrongs[], correctLetter, explanation]
const rows = [
  ['pop_culture_01', 1, 'Which film follows a lion cub named Simba?', 'The Lion King', ['Bambi', 'Dumbo', 'Tarzan'], 'C', 'Simba is the cub at the center of The Lion King.'],
  ['pop_culture_01', 2, 'What color is the brick road in The Wizard of Oz?', 'Yellow', ['Red', 'Blue', 'Green'], 'B', 'Dorothy follows the yellow brick road.'],
  ['pop_culture_01', 3, 'Who directed the 1975 film Jaws?', 'Steven Spielberg', ['George Lucas', 'Ridley Scott', 'James Cameron'], 'D', 'Jaws was Steven Spielberg’s breakthrough studio film.'],
  ['pop_culture_01', 4, 'Which 1999 film is built around the line "I see dead people"?', 'The Sixth Sense', ['The Ring', 'Ghost', 'Beetlejuice'], 'A', 'Cole says the line in The Sixth Sense.'],
  ['pop_culture_01', 5, 'Which studio released Spirited Away?', 'Studio Ghibli', ['Pixar', 'Aardman', 'Laika'], 'B', 'Spirited Away was produced by Studio Ghibli.'],
  ['pop_culture_01', 6, 'In Citizen Kane, what is Rosebud?', 'A sled', ['A yacht', 'A necklace', 'A painting'], 'C', 'Rosebud is the name of Kane’s childhood sled.'],
  ['science_tech_01', 1, 'Which planet is known as the Red Planet?', 'Mars', ['Venus', 'Jupiter', 'Mercury'], 'D', 'Iron oxide gives Mars its red color.'],
  ['science_tech_01', 2, 'What does CPU stand for?', 'Central Processing Unit', ['Computer Personal Unit', 'Core Program Utility', 'Central Print Unit'], 'A', 'CPU is the Central Processing Unit.'],
  ['science_tech_01', 3, 'What is the chemical symbol for gold?', 'Au', ['Ag', 'Fe', 'Gd'], 'C', 'Au comes from the Latin aurum.'],
  ['science_tech_01', 4, 'How many bits are in a byte?', '8', ['4', '16', '32'], 'B', 'A byte is 8 bits.'],
  ['science_tech_01', 5, 'Which particle carries a negative electric charge?', 'Electron', ['Proton', 'Neutron', 'Photon'], 'A', 'Electrons are negatively charged.'],
  ['science_tech_01', 6, 'Which law states that force equals mass times acceleration?', "Newton's second law", ["Ohm's law", "Boyle's law", "Kepler's first law"], 'D', "Newton's second law is F = ma."],
  ['craft_beer_01', 1, 'Which grain is the usual base of beer malt?', 'Barley', ['Quinoa', 'Millet', 'Buckwheat'], 'B', 'Most beer malt is made from barley.'],
  ['craft_beer_01', 2, 'Which drink is flavored with hops?', 'Beer', ['Wine', 'Cider', 'Mead'], 'C', 'Hops are the bittering flower of beer.'],
  ['craft_beer_01', 3, 'What does IPA stand for?', 'India Pale Ale', ['Irish Pub Ale', 'Imperial Pilsner Ale', 'International Porter Ale'], 'A', 'IPA stands for India Pale Ale.'],
  ['craft_beer_01', 4, 'Which country is most associated with the Reinheitsgebot?', 'Germany', ['France', 'Spain', 'Italy'], 'D', 'The Reinheitsgebot was a Bavarian brewing law.'],
  ['craft_beer_01', 5, 'Which flower is added to beer for bitterness and aroma?', 'Hops', ['Heather', 'Lavender', 'Chamomile'], 'C', 'Hop cones bitter and scent the boil.'],
  ['craft_beer_01', 6, 'Lambic beer is traditionally fermented in which country?', 'Belgium', ['Japan', 'Mexico', 'Norway'], 'B', 'Lambic is a Belgian style of spontaneous fermentation.'],
  ['world_history_01', 1, 'What is the capital of Japan?', 'Tokyo', ['Kyoto', 'Osaka', 'Seoul'], 'A', 'Tokyo is the capital of Japan.'],
  ['world_history_01', 2, 'Which ocean is the largest on Earth?', 'Pacific Ocean', ['Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean'], 'D', 'The Pacific covers the largest surface area.'],
  ['world_history_01', 3, 'Who was the first president of the United States?', 'George Washington', ['Abraham Lincoln', 'John Adams', 'Thomas Jefferson'], 'B', 'George Washington took office in 1789.'],
  ['world_history_01', 4, 'Which river is often cited as the longest in the world?', 'Nile', ['Amazon', 'Yangtze', 'Mississippi'], 'C', 'Traditional measurements rank the Nile first.'],
  ['world_history_01', 5, 'In which year did the Berlin Wall fall?', '1989', ['1961', '1975', '1991'], 'D', 'The Berlin Wall opened in November 1989.'],
  ['world_history_01', 6, 'In what year was the Magna Carta sealed?', '1215', ['1066', '1348', '1492'], 'A', 'King John sealed the Magna Carta at Runnymede.'],
  ['music_80s_90s_01', 1, 'Which artist released the album Thriller?', 'Michael Jackson', ['Prince', 'Madonna', 'Whitney Houston'], 'C', 'Thriller is Michael Jackson’s 1982 album.'],
  ['music_80s_90s_01', 2, 'Which band sang "Don’t Stop Believin’"?', 'Journey', ['Foreigner', 'Boston', 'Styx'], 'B', 'Journey recorded "Don’t Stop Believin’" in 1981.'],
  ['music_80s_90s_01', 3, 'Which band recorded Abbey Road?', 'The Beatles', ['The Rolling Stones', 'Queen', 'Pink Floyd'], 'D', 'Abbey Road is a Beatles album.'],
  ['music_80s_90s_01', 4, 'Who sang "Smells Like Teen Spirit"?', 'Nirvana', ['Pearl Jam', 'Soundgarden', 'Alice in Chains'], 'A', 'Nirvana released the song in 1991.'],
  ['music_80s_90s_01', 5, 'Which band released OK Computer?', 'Radiohead', ['Oasis', 'Blur', 'Muse'], 'B', 'Radiohead released OK Computer in 1997.'],
  ['music_80s_90s_01', 6, 'Which British duo had a hit with "Sweet Dreams (Are Made of This)"?', 'Eurythmics', ['Pet Shop Boys', 'Tears for Fears', 'Depeche Mode'], 'C', 'Eurythmics released the track in 1983.'],
  ['video_game_lore_01', 1, 'Which arcade character eats dots and avoids ghosts?', 'Pac-Man', ['Mario', 'Sonic', 'Link'], 'D', 'Pac-Man is Namco’s maze character.'],
  ['video_game_lore_01', 2, 'Tetris was invented in which country?', 'Soviet Union', ['Japan', 'United States', 'France'], 'A', 'Alexey Pajitnov developed Tetris in the USSR.'],
  ['video_game_lore_01', 3, 'Which hero leads the Halo series?', 'Master Chief', ['Samus', 'Doomguy', 'Kratos'], 'B', 'Master Chief is John-117.'],
  ['video_game_lore_01', 4, 'Princess Zelda appears in games made by which company?', 'Nintendo', ['Sega', 'Sony', 'Microsoft'], 'C', 'Zelda is a Nintendo franchise.'],
  ['video_game_lore_01', 5, 'Which company makes the Mario games?', 'Nintendo', ['Sega', 'Atari', 'Sony'], 'B', 'Mario is a Nintendo character.'],
  ['video_game_lore_01', 6, 'Which company developed Elden Ring?', 'FromSoftware', ['CD Projekt Red', 'Bethesda', 'BioWare'], 'D', 'FromSoftware directed Elden Ring.'],
  ['sports_arena_01', 1, 'How many players per side are on the field in soccer?', '11', ['9', '10', '12'], 'C', 'Soccer fields eleven players per team.'],
  ['sports_arena_01', 2, 'Which sport awards the Green Jacket at Augusta?', 'Golf', ['Tennis', 'Cycling', 'Skiing'], 'B', 'The Masters winner receives a green jacket.'],
  ['sports_arena_01', 3, 'The NBA three-point line is farther from which side of the rim?', 'The arc', ['Baseline', 'Sideline', 'Backboard'], 'D', 'Threes are measured along the arc.'],
  ['sports_arena_01', 4, 'Which country hosted the 2016 Summer Olympics?', 'Brazil', ['China', 'United Kingdom', 'Russia'], 'A', 'Rio de Janeiro hosted in 2016.'],
  ['sports_arena_01', 5, 'How many innings are in a standard professional baseball game?', '9', ['7', '8', '10'], 'B', 'A regulation MLB game is nine innings.'],
  ['sports_arena_01', 6, 'Which tennis tournament is played on grass courts?', 'Wimbledon', ['US Open', 'Australian Open', 'French Open'], 'C', 'Wimbledon uses grass courts.'],
];

const baseQuestions = rows.map((row) => card(...row));

function fillerQuestion(packId, index) {
  const pack = packById.get(packId);
  return card(
    packId,
    index,
    `Bonus ${index}: which category best fits ${pack.title}?`,
    pack.category,
    ['Mystery', 'Unknown', 'Wildcard'],
    'A',
    `This filler question rounds out the ${pack.title} pack.`,
  );
}

const byPack = new Map();
for (const question of baseQuestions) {
  const list = byPack.get(question.topicPackId) || [];
  list.push(question);
  byPack.set(question.topicPackId, list);
}

const questions = [...baseQuestions];
for (const pack of topicPacks) {
  const list = byPack.get(pack.topicPackId) || [];
  for (let index = list.length + 1; index <= 10; index += 1) {
    questions.push(fillerQuestion(pack.topicPackId, index));
  }
}

module.exports = {
  topicPacks,
  questions,
};