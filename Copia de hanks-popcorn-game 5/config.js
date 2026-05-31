/* ══════════════════════════════════════════════════
   HANK'S POPCORN — config.js v4
══════════════════════════════════════════════════ */
const CONFIG = {

  WINNING_SCORE:  300,
  GAME_DURATION:  30,
  PRIZE_NAME:     "1 Bolsa de Hank's Popcorn",

  POINTS_NORMAL:  10,
  POINTS_SPECIAL: 50,

  // Bolsa dorada: 6% normal, 14% modo popcorn
  SPECIAL_PROB_NORMAL:   0.06,
  SPECIAL_PROB_POPCORN:  0.14,

  // Velocidad de caída px/seg
  FALL_SPEED_MIN:              260,
  FALL_SPEED_MAX:              420,
  FALL_SPEED_POPCORN_MIN:      600,
  FALL_SPEED_POPCORN_MAX:      950,

  // Spawn: ms entre bolsas  (aumentados ~55% para menos saturación)
  SPAWN_MS_PHASE1:  1600,   // primeros 10 seg
  SPAWN_MS_PHASE2:  1150,   // seg 10-20
  SPAWN_MS_POPCORN:  480,   // modo popcorn

  // Bolsas simultáneas máx (reducidas ~50%)
  MAX_BAGS_NORMAL:   3,
  MAX_BAGS_POPCORN:  6,

  // Tamaño bolsa (fracción del ancho de pantalla)
  BAG_W_RATIO:    0.16,

  // Rotación máx en grados
  BAG_ROT_MAX_DEG: 14,

  // Modo popcorn se activa a N segundos restantes
  POPCORN_MODE_AT: 10,

  // Audio
  MUSIC_VOLUME: 0.32,
  SFX_VOLUME:   0.80,
};
