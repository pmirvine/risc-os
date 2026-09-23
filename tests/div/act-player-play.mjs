import base, { playTest } from './act-player.mjs';
export default async (page) => { await base(page); await playTest(page); };
