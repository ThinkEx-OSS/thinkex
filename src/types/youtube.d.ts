/**
 * TypeScript declarations for the YouTube IFrame Player API
 * @see https://developers.google.com/youtube/iframe_api_reference
 */

declare namespace YT {
  /** Player state constants */
  enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5,
  }

  interface PlayerOptions {
    height?: string | number;
    width?: string | number;
    videoId?: string;
    playerVars?: PlayerVars;
    events?: PlayerEvents;
  }

  interface PlayerVars {
    autoplay?: 0 | 1;
    cc_lang_pref?: string;
    cc_load_policy?: 0 | 1;
    color?: "red" | "white";
    controls?: 0 | 1;
    disablekb?: 0 | 1;
    enablejsapi?: 0 | 1;
    end?: number;
    fs?: 0 | 1;
    hl?: string;
    iv_load_policy?: 1 | 3;
    list?: string;
    listType?: "playlist" | "user_uploads";
    loop?: 0 | 1;
    origin?: string;
    playlist?: string;
    playsinline?: 0 | 1;
    rel?: 0 | 1;
    start?: number;
    widget_referrer?: string;
  }

  interface PlayerEvents {
    onReady?: (event: PlayerEvent) => void;
    onStateChange?: (event: OnStateChangeEvent) => void;
    onPlaybackQualityChange?: (event: PlayerEvent) => void;
    onPlaybackRateChange?: (event: PlayerEvent) => void;
    onError?: (event: OnErrorEvent) => void;
    onApiChange?: (event: PlayerEvent) => void;
  }

  interface PlayerEvent {
    target: Player;
  }

  interface OnStateChangeEvent extends PlayerEvent {
    data: PlayerState;
  }

  interface OnErrorEvent extends PlayerEvent {
    data: number;
  }

  class Player {
    constructor(elementId: string | HTMLElement, options: PlayerOptions);

    // Queueing functions
    cueVideoById(videoId: string, startSeconds?: number): void;
    loadVideoById(videoId: string, startSeconds?: number): void;
    cuePlaylist(playlist: string | string[], index?: number, startSeconds?: number): void;
    loadPlaylist(playlist: string | string[], index?: number, startSeconds?: number): void;

    // Playback controls
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;

    // Volume
    mute(): void;
    unMute(): void;
    isMuted(): boolean;
    setVolume(volume: number): void;
    getVolume(): number;

    // Player state
    getPlayerState(): PlayerState;
    getCurrentTime(): number;
    getDuration(): number;
    getVideoUrl(): string;
    getVideoEmbedCode(): string;

    // Playback quality & rate
    getPlaybackRate(): number;
    setPlaybackRate(suggestedRate: number): void;
    getAvailablePlaybackRates(): number[];

    // Playlist
    getPlaylist(): string[];
    getPlaylistIndex(): number;
    nextVideo(): void;
    previousVideo(): void;
    playVideoAt(index: number): void;

    // Size
    setSize(width: number, height: number): object;

    // DOM
    getIframe(): HTMLIFrameElement;
    destroy(): void;
  }
}

interface Window {
  YT?: typeof YT;
  onYouTubeIframeAPIReady?: () => void;
}
