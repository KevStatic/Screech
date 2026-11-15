export interface SpeakerGrilleProps {
  /** True while sound is playing and motion is allowed: the pulse rings run. */
  readonly active: boolean;
}
/** Dotted speaker grille. The rings pulse only while the sound is really playing. */
export default function SpeakerGrille({ active }: SpeakerGrilleProps) {
  return (
    <div className="grille" aria-hidden="true" data-testid="speaker-grille">
      {active ? (
        <>
          <span className="grille-ring" />
          <span className="grille-ring is-late" />
        </>
      ) : null}
      <span className="grille-face" />
    </div>
  );
}
