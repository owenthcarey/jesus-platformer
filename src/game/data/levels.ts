export interface LevelDefinition {
  id: number;
  title: string;
  subtitle: string;
  reference: string;
  verse: string;
  accent: number;
  worldWidth: number;
  playable: boolean;
}

export const LEVELS: LevelDefinition[] = [
  {
    id: 1,
    title: 'The Call by the Sea',
    subtitle: 'Galilee · Dawn',
    reference: 'Matthew 4:19',
    verse: 'Come, follow me, and I will send you out to fish for people.',
    accent: 0xe8b75c,
    worldWidth: 7600,
    playable: true,
  },
  {
    id: 2,
    title: 'Peace, Be Still',
    subtitle: 'Sea of Galilee · Night',
    reference: 'Mark 4:39',
    verse: 'Quiet! Be still!',
    accent: 0x69a9c3,
    worldWidth: 8400,
    playable: false,
  },
  {
    id: 3,
    title: 'Bread for the Multitude',
    subtitle: 'Hills of Galilee · Evening',
    reference: 'John 6:11',
    verse: 'Jesus then took the loaves, gave thanks, and distributed to those who were seated.',
    accent: 0xc98d52,
    worldWidth: 9000,
    playable: false,
  },
  {
    id: 4,
    title: 'The Road to Jerusalem',
    subtitle: 'Judea · Spring',
    reference: 'Luke 19:38',
    verse: 'Blessed is the king who comes in the name of the Lord!',
    accent: 0x8fa66b,
    worldWidth: 9600,
    playable: false,
  },
];

export const SCRIPTURES = [
  {
    short: 'A Light for the Road',
    reference: 'Psalm 119:105',
    verse: 'Your word is a lamp for my feet, a light on my path.',
  },
  {
    short: 'Take Courage',
    reference: 'Matthew 14:27',
    verse: 'Take courage! It is I. Do not be afraid.',
  },
  {
    short: 'The Peacemakers',
    reference: 'Matthew 5:9',
    verse: 'Blessed are the peacemakers, for they will be called children of God.',
  },
];
