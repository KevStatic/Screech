/** Why the microphone could not be opened. Pure data, shared by the audio layer and the flow. */
export type MicFailureReason = 'denied' | 'blocked' | 'unavailable';

export const MIC_DENIED_MESSAGE =
  'The microphone was refused. Screech cannot hear without it. Allow it in your browser settings.';
export const MIC_BLOCKED_MESSAGE =
  "This page can't use the microphone here. Open the link in Safari or Chrome.";
export const MIC_UNAVAILABLE_MESSAGE =
  'The microphone could not be opened. No microphone was found, or another app is using it.';
