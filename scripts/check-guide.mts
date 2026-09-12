// Kılavuzdaki iddiaları kodun kendisiyle karşılaştırır.
// Metin elle yazıldığı için denge değişince sessizce yalan söyleyebilir.
import { readFileSync } from 'node:fs';
import { STARTERS, STARTER_LEVEL } from '@/lib/data/starters';
import { MAX_TEAM_SIZE } from '@/lib/game/team';
import { VICTORY_HEAL_PERCENT } from '@/lib/game/progression';
import { BATTLE_LAYOUT } from '@/lib/data/battleLayout';
import { NODE_LABELS } from '@/lib/game/map';

const guide = readFileSync('components/menu/HowToPlay.tsx', 'utf8');
let bad = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  → ${JSON.stringify(actual)}`);
};

check('starters count', STARTERS.length, 27);
check('starter level', STARTER_LEVEL, 5);
check('team cap is six (guide says six)', MAX_TEAM_SIZE, 6);
check('victory heal is read from code', guide.includes('{VICTORY_HEAL_PERCENT}%'), true);
check('rest heal is read from code', guide.includes('{REST_HEAL_PERCENT}%'), true);
check('node kinds', Object.keys(NODE_LABELS).length, 7);
console.log(`INFO  victory heal = ${VICTORY_HEAL_PERCENT}%`);

// Kılavuzdaki savaş resmi gerçek arena koordinatlarını kullanmalı.
check(
  'battle figure uses the real enemy anchor',
  guide.includes(`left: "${BATTLE_LAYOUT.enemySprite.x}%", top: "${BATTLE_LAYOUT.enemySprite.groundY}%"`),
  true,
);
check(
  'battle figure uses the real player anchor',
  guide.includes(`left: "${BATTLE_LAYOUT.playerSprite.x}%", top: "${BATTLE_LAYOUT.playerSprite.groundY}%"`),
  true,
);
check(
  'battle figure panel matches layout',
  guide.includes(`top-[${BATTLE_LAYOUT.playerPanel.top}]`),
  true,
);

console.log(bad === 0 ? '\nGUIDE MATCHES THE CODE' : `\n${bad} MISMATCH`);
if (bad > 0) process.exitCode = 1;
