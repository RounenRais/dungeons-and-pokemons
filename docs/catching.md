# Post-battle catching

Capture is available only after a catchable wild opponent has been defeated and
the battle engine has persisted its `subdued` state. Balls are not battle bag
actions. Trainer, Gym, Elite Four, Champion, and non-wild scripted opponents
never create a capture state.

Each encounter permits one decision: throw one owned ball or leave. The store
validates the encounter, result state, attempt flag, and inventory, then consumes
the ball, stores the result, and moves a successful catch to the party or Box in
one Zustand update. The write happens before animation. Reloading therefore
restores `capture-success`, `capture-failed`, or `released` instead of rolling
again. Repeated clicks see `attemptUsed` and do nothing.

`computePostBattleCatchOdds` is the single formula used by the UI and throw
resolver. It combines the species capture rate, rarity tier, level, act, ball
multiplier, and bounded relic/boon bonus. It intentionally has no current HP or
status input because the opponent has already been subdued. Non-Master-Ball
results are clamped to 0.5%–95%; a Master Ball is guaranteed for a valid target.

Multipliers are Poké Ball ×1, Great Ball ×1.5, Ultra Ball ×2, and Master Ball
guaranteed. PokeAPI species capture rates use the existing central cache and a
safe rate of 90 if the request fails.

