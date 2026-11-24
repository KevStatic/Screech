/**
 * Built-in Riddle_Packs for Ghost Hunt.
 *
 * Authoring rules (checked by tests):
 * - ASCII only.
 * - Each pack has one opening, exactly 7 entries and one finale.
 * - Names are at most 18 bytes and clues at most 60 bytes, so a Clue_Packet
 *   (12 + name + clue bytes) never exceeds 90 bytes.
 * - Hide_At is 1 to 40 characters.
 * - The opening leads to the Hide_At of entry 1, and the clue of entry k
 *   leads to the Hide_At of entry k+1 (k = 1..6).
 * - The finale says the Hunt is over and where to return. It is the clue of
 *   the last Spirit, so entry 7 repeats it as its own clue.
 */

export type PackId = 'office' | 'home' | 'classroom';

export interface PackEntry {
  readonly name: string;
  readonly hideAt: string;
  readonly clue: string;
}

export interface RiddlePack {
  /** 1..200 characters, read aloud by the host. Leads to entry 1. */
  readonly opening: string;
  /** Exactly 7 entries. */
  readonly entries: readonly PackEntry[];
  /** Used as the clue of the last Spirit. */
  readonly finale: string;
}

const FINALE = 'The hunt is over. Return to the circle where you began.';

const office: RiddlePack = {
  opening:
    'The first spirit sleeps where paper is born warm. Find the printer that hums at night.',
  entries: [
    {
      name: 'The Cold Copier',
      hideAt: 'On top of the printer',
      clue: 'Cold and clear, I gurgle. Find the water cooler.',
    },
    {
      name: 'The Thirsty One',
      hideAt: 'Beside the water cooler',
      clue: 'Bitter and hot, I wake the dead. Seek the coffee machine.',
    },
    {
      name: 'Bean Wraith',
      hideAt: 'Behind the coffee machine',
      clue: 'Wipe me clean and I forget. Look at the whiteboard.',
    },
    {
      name: 'Marker Ghost',
      hideAt: 'Under the whiteboard',
      clue: 'Climb away from the lift. Try the stairwell door.',
    },
    {
      name: 'Stair Banshee',
      hideAt: 'At the stairwell door',
      clue: 'Guests sign in with me. Go to the reception desk.',
    },
    {
      name: 'Lobby Phantom',
      hideAt: 'Inside the reception desk',
      clue: 'Long talks go to die here. Open the meeting room.',
    },
    {
      name: 'Boardroom Shade',
      hideAt: 'On the meeting room table',
      clue: FINALE,
    },
  ],
  finale: FINALE,
};

const home: RiddlePack = {
  opening:
    'The first spirit shivers where the milk is kept. Open the door that hums and glows.',
  entries: [
    {
      name: 'Frost Ghoul',
      hideAt: 'Inside the fridge door',
      clue: 'Sit and sink into me. Find the sofa.',
    },
    {
      name: 'Cushion Wraith',
      hideAt: 'Under the sofa cushion',
      clue: 'Stories sleep in rows. Visit the bookshelf.',
    },
    {
      name: 'Dusty Page',
      hideAt: 'Behind the books on the shelf',
      clue: 'I show your face but never smile. Seek the mirror.',
    },
    {
      name: 'Mirror Spectre',
      hideAt: 'Behind the bathroom mirror',
      clue: 'Muddy feet pass me daily. Look by the front door.',
    },
    {
      name: 'Doorway Haunt',
      hideAt: 'By the shoes at the front door',
      clue: 'Green and thirsty, I sit in clay. Find the plant pot.',
    },
    {
      name: 'Pot Poltergeist',
      hideAt: 'Beside the big plant pot',
      clue: 'Where the family eats and argues. Try the kitchen table.',
    },
    {
      name: 'Supper Shade',
      hideAt: 'Under the kitchen table',
      clue: FINALE,
    },
  ],
  finale: FINALE,
};

const classroom: RiddlePack = {
  opening:
    'The first spirit guards the marks and the chalk. Look to the teacher desk at the front.',
  entries: [
    {
      name: 'Gradebook Ghoul',
      hideAt: 'In the teacher desk drawer',
      clue: 'I spin but never travel. Find the globe.',
    },
    {
      name: 'Globe Wraith',
      hideAt: 'Behind the globe',
      clue: 'Words and numbers get wiped from me. Go to the board.',
    },
    {
      name: 'Chalk Banshee',
      hideAt: 'On the board ledge',
      clue: 'Dust yourself off and climb to the window sill.',
    },
    {
      name: 'Windowsill Imp',
      hideAt: 'On the window sill',
      clue: 'Coats hang and bags sag. Check the coat hooks.',
    },
    {
      name: 'Hook Phantom',
      hideAt: 'Under the coat hooks',
      clue: 'Paint and glue sleep here. Open the art cupboard.',
    },
    {
      name: 'Glue Spirit',
      hideAt: 'Inside the art cupboard',
      clue: 'Silent shelves of stories. Find the reading corner.',
    },
    {
      name: 'Reading Shade',
      hideAt: 'In the reading corner',
      clue: FINALE,
    },
  ],
  finale: FINALE,
};

export const RIDDLE_PACKS: Readonly<Record<PackId, RiddlePack>> = {
  office,
  home,
  classroom,
};
