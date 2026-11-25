const topicPacks = [
  {
    topicPackId: 'pop_culture_01',
    title: 'Pop Culture & Cinema',
    slug: 'pop-culture-and-cinema',
    description: 'Blockbusters, icons, and the films everyone claims to have seen.',
    category: 'Film & Media',
    icon: 'movie',
    difficultyRating: 'BALANCED',
    isFeatured: true,
  },
  {
    topicPackId: 'science_tech_01',
    title: 'Science & Technology',
    slug: 'science-and-technology',
    description: 'Spaceflight, circuits, and the machines that run the night.',
    category: 'Tech / Dev',
    icon: 'memory',
    difficultyRating: 'MEDIUM',
    isFeatured: false,
  },
  {
    topicPackId: 'craft_beer_01',
    title: 'Craft Beer & Ales',
    slug: 'craft-beer-and-ales',
    description: 'Hops, malt, and the pubs that pour them.',
    category: 'Brewery',
    icon: 'sports_bar',
    difficultyRating: 'FUN',
    isFeatured: true,
  },
  {
    topicPackId: 'world_history_01',
    title: 'World History & Geo',
    slug: 'world-history-and-geo',
    description: 'Empires, borders, and the maps they left behind.',
    category: 'Cartography',
    icon: 'public',
    difficultyRating: 'EXPERT',
    isFeatured: false,
  },
  {
    topicPackId: 'music_80s_90s_01',
    title: '80s & 90s Music Trivia',
    slug: 'eighties-and-nineties-music',
    description: 'Chart hits, music videos, and the bands that owned the dial.',
    category: 'Music & Audio',
    icon: 'music_note',
    difficultyRating: 'BALANCED',
    isFeatured: false,
  },
  {
    topicPackId: 'video_game_lore_01',
    title: 'Video Game Lore',
    slug: 'video-game-lore',
    description: 'Consoles, characters, and the studios behind them.',
    category: 'Gaming',
    icon: 'sports_esports',
    difficultyRating: 'HARD',
    isFeatured: false,
  },
];

const packById = new Map(topicPacks.map((pack) => [pack.topicPackId, pack]));
const LETTERS = new Set(['A', 'B', 'C', 'D']);

function card(packId, difficulty, index, text, correct, wrongs, correctLetter, explanation) {
  const pack = packById.get(packId);
  if (!LETTERS.has(correctLetter)) {
    throw new TypeError(`invalid correctLetter for ${packId} ${difficulty} ${index}`);
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
  const points = { EASY: 10, MEDIUM: 15, HARD: 20 };
  return {
    questionId: `${packId}_${difficulty.toLowerCase()}_${index}`,
    topicPackId: packId,
    category: pack.category,
    tags: [pack.slug.split('-')[0], difficulty.toLowerCase()],
    difficultyRating: difficulty,
    basePoints: points[difficulty],
    questionText: text,
    options: ['A', 'B', 'C', 'D'].map((id, slot) => ({ id, text: texts[slot] })),
    correctAnswerId: correctLetter,
    explanation,
    sourceCitations: [
      { title: 'Pub Quiz house notes', link: 'https://example.com/pub-quiz-seed' },
    ],
  };
}

// [packId, difficulty, index, questionText, correct, wrongs[], correctLetter, explanation]
const rows = [
  ['pop_culture_01', 'EASY', 1, 'Which film follows a lion cub named Simba?', 'The Lion King', ['Bambi', 'Dumbo', 'Tarzan'], 'C', 'Simba is the cub at the center of The Lion King.'],
  ['pop_culture_01', 'EASY', 2, 'What color is the brick road in The Wizard of Oz?', 'Yellow', ['Red', 'Blue', 'Green'], 'B', 'Dorothy follows the yellow brick road.'],
  ['pop_culture_01', 'MEDIUM', 1, 'Who directed the 1975 film Jaws?', 'Steven Spielberg', ['George Lucas', 'Ridley Scott', 'James Cameron'], 'D', 'Jaws was Steven Spielberg’s breakthrough studio film.'],
  ['pop_culture_01', 'MEDIUM', 2, 'Which 1999 film is built around the line "I see dead people"?', 'The Sixth Sense', ['The Ring', 'Ghost', 'Beetlejuice'], 'A', 'Cole says the line in The Sixth Sense.'],
  ['pop_culture_01', 'HARD', 1, 'Which studio released Spirited Away?', 'Studio Ghibli', ['Pixar', 'Aardman', 'Laika'], 'B', 'Spirited Away was produced by Studio Ghibli.'],
  ['pop_culture_01', 'HARD', 2, 'In Citizen Kane, what is Rosebud?', 'A sled', ['A yacht', 'A necklace', 'A painting'], 'C', 'Rosebud is the name of Kane’s childhood sled.'],
  ['science_tech_01', 'EASY', 1, 'Which planet is known as the Red Planet?', 'Mars', ['Venus', 'Jupiter', 'Mercury'], 'D', 'Iron oxide gives Mars its red color.'],
  ['science_tech_01', 'EASY', 2, 'What does CPU stand for?', 'Central Processing Unit', ['Computer Personal Unit', 'Core Program Utility', 'Central Print Unit'], 'A', 'CPU is the Central Processing Unit.'],
  ['science_tech_01', 'MEDIUM', 1, 'What is the chemical symbol for gold?', 'Au', ['Ag', 'Fe', 'Gd'], 'C', 'Au comes from the Latin aurum.'],
  ['science_tech_01', 'MEDIUM', 2, 'How many bits are in a byte?', '8', ['4', '16', '32'], 'B', 'A byte is 8 bits.'],
  ['science_tech_01', 'HARD', 1, 'Which particle carries a negative electric charge?', 'Electron', ['Proton', 'Neutron', 'Photon'], 'A', 'Electrons are negatively charged.'],
  ['science_tech_01', 'HARD', 2, 'Which law states that force equals mass times acceleration?', "Newton's second law", ["Ohm's law", "Boyle's law", "Kepler's first law"], 'D', "Newton's second law is F = ma."],
  ['craft_beer_01', 'EASY', 1, 'Which grain is the usual base of beer malt?', 'Barley', ['Quinoa', 'Millet', 'Buckwheat'], 'B', 'Most beer malt is made from barley.'],
  ['craft_beer_01', 'EASY', 2, 'Which drink is flavored with hops?', 'Beer', ['Wine', 'Cider', 'Mead'], 'C', 'Hops are the bittering flower of beer.'],
  ['craft_beer_01', 'MEDIUM', 1, 'What does IPA stand for?', 'India Pale Ale', ['Irish Pub Ale', 'Imperial Pilsner Ale', 'International Porter Ale'], 'A', 'IPA stands for India Pale Ale.'],
  ['craft_beer_01', 'MEDIUM', 2, 'Which country is most associated with the Reinheitsgebot?', 'Germany', ['France', 'Spain', 'Italy'], 'D', 'The Reinheitsgebot was a Bavarian brewing law.'],
  ['craft_beer_01', 'HARD', 1, 'Which flower is added to beer for bitterness and aroma?', 'Hops', ['Heather', 'Lavender', 'Chamomile'], 'C', 'Hop cones bitter and scent the boil.'],
  ['craft_beer_01', 'HARD', 2, 'Lambic beer is traditionally fermented in which country?', 'Belgium', ['Japan', 'Mexico', 'Norway'], 'B', 'Lambic is a Belgian style of spontaneous fermentation.'],
  ['world_history_01', 'EASY', 1, 'What is the capital of Japan?', 'Tokyo', ['Kyoto', 'Osaka', 'Seoul'], 'A', 'Tokyo is the capital of Japan.'],
  ['world_history_01', 'EASY', 2, 'Which ocean is the largest on Earth?', 'Pacific Ocean', ['Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean'], 'D', 'The Pacific covers the largest surface area.'],
  ['world_history_01', 'MEDIUM', 1, 'Who was the first president of the United States?', 'George Washington', ['Abraham Lincoln', 'John Adams', 'Thomas Jefferson'], 'B', 'George Washington took office in 1789.'],
  ['world_history_01', 'MEDIUM', 2, 'Which river is often cited as the longest in the world?', 'Nile', ['Amazon', 'Yangtze', 'Mississippi'], 'C', 'Traditional measurements rank the Nile first.'],
  ['world_history_01', 'HARD', 1, 'In which year did the Berlin Wall fall?', '1989', ['1961', '1975', '1991'], 'D', 'The Berlin Wall opened in November 1989.'],
  ['world_history_01', 'HARD', 2, 'In what year was the Magna Carta sealed?', '1215', ['1066', '1348', '1492'], 'A', 'King John sealed the Magna Carta at Runnymede.'],
  ['music_80s_90s_01', 'EASY', 1, 'Which artist released the album Thriller?', 'Michael Jackson', ['Prince', 'Madonna', 'Whitney Houston'], 'C', 'Thriller is Michael Jackson’s 1982 album.'],
  ['music_80s_90s_01', 'EASY', 2, 'Which band sang "Don’t Stop Believin’"?', 'Journey', ['Foreigner', 'Boston', 'Styx'], 'B', 'Journey recorded "Don’t Stop Believin’" in 1981.'],
  ['music_80s_90s_01', 'MEDIUM', 1, 'Which band recorded Abbey Road?', 'The Beatles', ['The Rolling Stones', 'Queen', 'Pink Floyd'], 'D', 'Abbey Road is a Beatles album.'],
  ['music_80s_90s_01', 'MEDIUM', 2, 'Who sang "Smells Like Teen Spirit"?', 'Nirvana', ['Pearl Jam', 'Soundgarden', 'Alice in Chains'], 'A', 'Nirvana released the song in 1991.'],
  ['music_80s_90s_01', 'HARD', 1, 'Which band released OK Computer?', 'Radiohead', ['Oasis', 'Blur', 'Muse'], 'B', 'Radiohead released OK Computer in 1997.'],
  ['music_80s_90s_01', 'HARD', 2, 'Which British duo had a hit with "Sweet Dreams (Are Made of This)"?', 'Eurythmics', ['Pet Shop Boys', 'Tears for Fears', 'Depeche Mode'], 'C', 'Eurythmics released the track in 1983.'],
  ['video_game_lore_01', 'EASY', 1, 'Which arcade character eats dots and avoids ghosts?', 'Pac-Man', ['Mario', 'Sonic', 'Link'], 'D', 'Pac-Man is Namco’s maze character.'],
  ['video_game_lore_01', 'EASY', 2, 'Tetris was invented in which country?', 'Soviet Union', ['Japan', 'United States', 'France'], 'A', 'Alexey Pajitnov developed Tetris in the USSR.'],
  ['video_game_lore_01', 'MEDIUM', 1, 'Which hero leads the Halo series?', 'Master Chief', ['Samus', 'Doomguy', 'Kratos'], 'B', 'Master Chief is John-117.'],
  ['video_game_lore_01', 'MEDIUM', 2, 'Princess Zelda appears in games made by which company?', 'Nintendo', ['Sega', 'Sony', 'Microsoft'], 'C', 'Zelda is a Nintendo franchise.'],
  ['video_game_lore_01', 'HARD', 1, 'Which company makes the Mario games?', 'Nintendo', ['Sega', 'Atari', 'Sony'], 'B', 'Mario is a Nintendo character.'],
  ['video_game_lore_01', 'HARD', 2, 'Elden Ring was developed by which studio?', 'FromSoftware', ['CD Projekt Red', 'Bethesda', 'BioWare'], 'D', 'FromSoftware directed Elden Ring.'],
];

const questions = rows.map((row) => card(...row));

module.exports = {
  topicPacks,
  questions,
};