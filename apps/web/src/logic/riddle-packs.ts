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
    'Blank sheets go in and words come out warm. The first spirit sleeps where the machine hums at night.',
  entries: [
    {
      name: 'The Cold Copier',
      hideAt: 'On top of the printer',
      clue: 'Cold and clear, I gurgle when thirsty hands press me.',
    },
    {
      name: 'The Thirsty One',
      hideAt: 'Beside the water cooler',
      clue: 'Bitter and hot, I wake the dead. Beans go in, I pour out.',
    },
    {
      name: 'Bean Wraith',
      hideAt: 'Behind the coffee machine',
      clue: 'Wipe me clean and I forget. Squeaky pens write my plans.',
    },
    {
      name: 'Marker Ghost',
      hideAt: 'Under the whiteboard',
      clue: 'Skip the lift. Spirits take the long way up, step by step.',
    },
    {
      name: 'Stair Banshee',
      hideAt: 'At the stairwell door',
      clue: 'Guests sign in with me. I greet them before anyone else.',
    },
    {
      name: 'Lobby Phantom',
      hideAt: 'Inside the reception desk',
      clue: 'Long talks go to die here. Chairs circle a slab of oak.',
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
    'The first spirit shivers where the milk is kept. A cold box hums and glows when you peek inside.',
  entries: [
    {
      name: 'Frost Ghoul',
      hideAt: 'Inside the fridge door',
      clue: 'Sit and sink into me. Lost coins hide in my folds.',
    },
    {
      name: 'Cushion Wraith',
      hideAt: 'Under the sofa cushion',
      clue: 'Stories sleep in rows. Their spines stand like tombstones.',
    },
    {
      name: 'Dusty Page',
      hideAt: 'Behind the books on the shelf',
      clue: 'I show your face but never smile. Steam hides me after a bath.',
    },
    {
      name: 'Mirror Spectre',
      hideAt: 'Behind the bathroom mirror',
      clue: 'Muddy feet pass me daily. Boots wait in line here.',
    },
    {
      name: 'Doorway Haunt',
      hideAt: 'By the shoes at the front door',
      clue: 'Green and thirsty, I sit in clay. I drink from a can.',
    },
    {
      name: 'Pot Poltergeist',
      hideAt: 'Beside the big plant pot',
      clue: 'Where the family eats and argues. Crumbs fall by my legs.',
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
    'The first spirit guards the marks. Where the teacher sits, a red pen counts every sin.',
  entries: [
    {
      name: 'Gradebook Ghoul',
      hideAt: 'In the teacher desk drawer',
      clue: 'I spin but never travel. The whole world fits on me.',
    },
    {
      name: 'Globe Wraith',
      hideAt: 'Behind the globe',
      clue: 'Words and numbers get wiped from me. Chalk dust is my ash.',
    },
    {
      name: 'Chalk Banshee',
      hideAt: 'On the board ledge',
      clue: 'Dust yourself off. Light pours through me. Rain taps me.',
    },
    {
      name: 'Windowsill Imp',
      hideAt: 'On the window sill',
      clue: 'Coats hang and bags sag. Wet jackets drip on me.',
    },
    {
      name: 'Hook Phantom',
      hideAt: 'Under the coat hooks',
      clue: 'Paint and glue sleep here. Glitter clings to my shelves.',
    },
    {
      name: 'Glue Spirit',
      hideAt: 'Inside the art cupboard',
      clue: 'Silent shelves of stories. Cushions wait for curious eyes.',
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
