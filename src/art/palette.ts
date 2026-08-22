/**
 * The game's master palette.
 *
 * Everything drawn — sprites, tiles, skies, UI — pulls from here, which is what
 * makes a code-generated game read as one art direction instead of a pile of
 * separate assets. Hues follow the anime's colour language: saturated primaries
 * on characters, desaturated cool tones in the environment, gold as the single
 * reward colour.
 */
export const PAL = {
  // Ink & neutrals
  ink: '#0B1020',
  inkSoft: '#131A2E',
  shadow: '#1C2540',
  slate: '#3A4666',
  steel: '#5C6A8C',
  mist: '#9AA8C4',
  cream: '#FFF5E4',
  white: '#FFFFFF',

  // One Piece signature hues
  strawGold: '#F4C542',
  strawDeep: '#B8942E',
  luffyRed: '#D6302E',
  luffyRedDeep: '#8E1A1C',
  denim: '#2E5A8C',
  skin: '#F2C7A0',
  skinDeep: '#C98F63',
  skinDark: '#8B5A3C',

  // Crew accents
  zoroGreen: '#3EA96B',
  namiOrange: '#F08A3C',
  sanjiBlue: '#2B3A66',
  usoppBrown: '#8B5A2B',
  chopperPink: '#E8768E',

  // Sea & sky
  seaDeep: '#0A2A4A',
  sea: '#136A8A',
  seaLight: '#2FA8C4',
  foam: '#CFF0F7',
  skyHigh: '#1F5FA8',
  skyMid: '#4FA3D9',
  skyLow: '#9FD8EE',
  sunset: '#F2874E',
  dusk: '#5B3A7E',
  night: '#0A1230',

  // Terrain
  sand: '#E7CE9B',
  sandDeep: '#B99A63',
  grass: '#4FA843',
  grassDeep: '#2F6B33',
  dirt: '#7A5236',
  dirtDeep: '#4E3322',
  rock: '#6E7A90',
  rockDeep: '#414B60',
  wood: '#8A5A32',
  woodDeep: '#5A3820',
  woodLight: '#C08B52',
  ice: '#BFE9F5',
  iceDeep: '#6FA8C4',

  // Marine / enemies
  marineNavy: '#1E3A6E',
  marineWhite: '#EDEFF5',
  marineBlue: '#3F6FB5',
  fishmanTeal: '#2A8C86',
  bloodOrange: '#E05A2B',

  // Signals
  gold: '#F4C542',
  goldDeep: '#B8942E',
  danger: '#E23B3B',
  poison: '#8E44AD',
  heal: '#4FD37A',
  magic: '#7FD4FF',
  ember: '#FFB03A',
} as const

export type PaletteKey = keyof typeof PAL

/** Per-biome environment colour sets, used by tiles and backgrounds alike. */
export interface BiomePalette {
  skyTop: string
  skyMid: string
  skyLow: string
  sunTint: string
  farSilhouette: string
  midSilhouette: string
  ground: string
  groundDeep: string
  groundEdge: string
  accent: string
  fog: string
  /** Direction the key light comes from, used for rim lighting. */
  lightDirX: number
  lightDirY: number
  ambient: string
}

export const BIOME_PALETTES: Record<string, BiomePalette> = {
  'east-blue': {
    skyTop: '#1F5FA8', skyMid: '#4FA3D9', skyLow: '#BEE6F5', sunTint: '#FFE9A8',
    farSilhouette: '#5E8FB8', midSilhouette: '#2F6B33',
    ground: '#4FA843', groundDeep: '#2F6B33', groundEdge: '#7A5236',
    accent: '#F4C542', fog: '#BEE6F5', lightDirX: -1, lightDirY: -1, ambient: '#8FC7E8',
  },
  alabasta: {
    skyTop: '#2E6FB8', skyMid: '#79B7DE', skyLow: '#F0D9A8', sunTint: '#FFD98A',
    farSilhouette: '#C9A470', midSilhouette: '#A87C4A',
    ground: '#E7CE9B', groundDeep: '#B99A63', groundEdge: '#8A6A3E',
    accent: '#E05A2B', fog: '#F0DDB4', lightDirX: -1, lightDirY: -1, ambient: '#F5DFB0',
  },
  skypiea: {
    skyTop: '#3E7FD0', skyMid: '#8FD0F0', skyLow: '#EAF9FF', sunTint: '#FFFFFF',
    farSilhouette: '#BFE0F2', midSilhouette: '#7FC8A8',
    ground: '#8FE0C0', groundDeep: '#3E9C7C', groundEdge: '#D8F2E6',
    accent: '#FFE9A8', fog: '#EAF9FF', lightDirX: -1, lightDirY: -1, ambient: '#DFF4FF',
  },
  water7: {
    skyTop: '#1B4E86', skyMid: '#3E86B8', skyLow: '#9FD0E4', sunTint: '#FFD1A0',
    farSilhouette: '#4E7C9C', midSilhouette: '#8A5A32',
    ground: '#8A5A32', groundDeep: '#5A3820', groundEdge: '#C08B52',
    accent: '#2FA8C4', fog: '#A8CFE0', lightDirX: -1, lightDirY: -1, ambient: '#9CC4DC',
  },
  'thriller-bark': {
    skyTop: '#0A1230', skyMid: '#231A46', skyLow: '#4A2E5E', sunTint: '#C8A2E8',
    farSilhouette: '#2A1C40', midSilhouette: '#181228',
    ground: '#3A2C4E', groundDeep: '#1E1630', groundEdge: '#6B4E7E',
    accent: '#8E44AD', fog: '#3A2C5E', lightDirX: 1, lightDirY: -1, ambient: '#6A5A8E',
  },
  wano: {
    skyTop: '#4A2A5E', skyMid: '#C2506E', skyLow: '#F2A08A', sunTint: '#FFD0A0',
    farSilhouette: '#7A4A6E', midSilhouette: '#3E2A44',
    ground: '#6E4A3A', groundDeep: '#3E2A22', groundEdge: '#E8768E',
    accent: '#E8768E', fog: '#E8A0A8', lightDirX: 1, lightDirY: -1, ambient: '#E0A0A8',
  },
}

export const biomePalette = (b: string): BiomePalette =>
  BIOME_PALETTES[b] ?? BIOME_PALETTES['east-blue']
