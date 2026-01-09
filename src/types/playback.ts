export type PlaybackState = {
  hasPaths: boolean;
  isPlaying: boolean;
  elapsedMs: number;
  totalMs: number;
};

export type PlaybackController = {
  getState: () => PlaybackState;
  togglePlayback: () => boolean;
  resetPlayback: () => void;
  goToLastFrame: () => void;
  seekPlayback: (progress: number) => void;
};
