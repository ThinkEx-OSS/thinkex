// Smoke effect configuration constants
export const SMOKE_CONFIG = {
  // Grid resolution - higher = more detail but more CPU
  GRID_WIDTH: 80,
  GRID_HEIGHT: 50,

  // Mouse interaction
  CLEAR_RADIUS: 0.08,        // Normalized radius of clearing effect (0-1)
  CLEAR_STRENGTH: 0.15,      // How fast smoke clears per frame (0-1)
  PUSH_VELOCITY: 0.02,       // Initial velocity when pushed away

  // Refilling behavior
  REFILL_SPEED: 0.008,       // How fast smoke returns per frame (0-1)
  REFILL_DELAY: 500,         // ms before refilling starts after cursor leaves

  // Diffusion (organic spreading)
  DIFFUSION_RATE: 0.1,       // How much neighbors influence each cell

  // Hero glow coordination
  HERO_CLEAR_RADIUS: 0.22,   // Permanent clear zone around hero (normalized) - larger for brighter hero
  HERO_CLEAR_INTENSITY: 0.95, // How clear the hero zone is (0 = full smoke, 1 = fully clear) - brighter

  // Visual appearance
  BLUR_AMOUNT: 15,           // px of blur on final mask
  BASE_OPACITY: 1.0,         // Starting smoke opacity (1.0 = fully opaque/hidden)

  // Performance
  MASK_UPDATE_INTERVAL: 2,   // Update mask every N frames (1 = every frame)
  CANVAS_SCALE: 1,           // Scale factor for canvas resolution
} as const;

export type SmokeConfig = typeof SMOKE_CONFIG;
