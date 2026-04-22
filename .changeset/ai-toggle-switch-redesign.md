---
'@tatlacas/brevwick-react': patch
'@tatlacas/brevwick-sdk': patch
---

fix(react): AI toggle now reads as a switch, aligns with send button

- The composer AI toggle used to be a pill that only changed background
  colour between on/off, so the off state looked _disabled_ rather than
  _unchecked_. Redesigned as a track-and-thumb switch: thumb slides
  left↔right, track fills with `--brw-accent` when on, reduced-motion
  skips the transition.
- The "AI" label now sits **outside** the button so the track itself is
  the unambiguous toggle affordance. The label recolours from
  `--brw-fg-muted` to `--brw-fg` via `:has(.brw-aitoggle--on)` to
  reinforce the state.
- New `.brw-aitoggle-wrap` is 34px tall to match `.brw-send-btn`, so the
  switch centre and the send-button centre share a baseline under the
  composer shell's `align-items: flex-end`.

Semantic contract is unchanged — `role="switch"`, `aria-checked`,
`aria-label="Format with AI"`, Space-to-toggle, and the
`.brw-aitoggle--on` class all stay put.

The `@tatlacas/brevwick-sdk` patch bump is a no-op to keep the two
packages in lockstep per the repo's pre-1.0 versioning policy.
