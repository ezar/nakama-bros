/**
 * The master palette.
 *
 * Cel shading needs saturated, confident local colours: the style has no soft
 * gradients to hide a muddy hue behind, so every value here is chosen to hold
 * up when it is split into exactly two tones. Shadows and highlights are never
 * written down — they are derived from these by `cel()` in `color.ts`, which is
 * what keeps six biomes and six characters lit by the same sun.
 */
export const PAL = {
  // Ink & neutrals
  ink: '#141A2E',
  inkSoft: '#232C48',
  shadow: '#2E3A5C',
  slate: '#4A5878',
  steel: '#7C8BAA',
  mist: '#B4C0D8',
  cream: '#FFF6E8',
  white: '#FFFFFF',

  // Straw Hat signatures
  strawGold: '#F6C63C',
  strawDeep: '#C08A2C',
  luffyRed: '#E23B32',
  luffyRedDeep: '#A01F22',
  denim: '#2F5FA0',
  skin: '#F6C9A0',
  skinDeep: '#D89A6C',
  skinDark: '#9A5F3C',

  // Crew accents
  zoroGreen: '#3FBE78',
  namiOrange: '#FA9A3C',
  sanjiGold: '#EFCF72',
  sanjiSuit: '#1F2A4A',
  usoppBrown: '#9A6535',
  chopperPink: '#F0849A',

  // Sea & sky
  seaDeep: '#0B3358',
  sea: '#127EA6',
  seaLight: '#38C2DC',
  foam: '#DBF5FB',
  skyHigh: '#2A6CC0',
  skyMid: '#5AB4EA',
  skyLow: '#B6E6F8',
  sunset: '#FA9052',
  dusk: '#6B4492',
  night: '#0C1638',

  // Terrain
  sand: '#F0D79E',
  sandDeep: '#C8A263',
  grass: '#5CC34C',
  grassDeep: '#2F7C3A',
  dirt: '#8A5C38',
  dirtDeep: '#553722',
  rock: '#7C88A0',
  rockDeep: '#464F66',
  wood: '#9A6234',
  woodDeep: '#603A1E',
  woodLight: '#D19A5A',
  ice: '#CDF0FA',
  iceDeep: '#78B4CE',

  // Marine / enemies
  marineNavy: '#20407A',
  marineWhite: '#F2F4FA',
  marineBlue: '#4A7CC4',
  fishmanTeal: '#2E9E96',
  bloodOrange: '#F06A2E',

  // Signals
  gold: '#F6C63C',
  goldDeep: '#C08A2C',
  danger: '#EE4544',
  poison: '#9B50C0',
  heal: '#57DE86',
  magic: '#8ADCFF',
  ember: '#FFBC4A',
} as const

export type PaletteKey = keyof typeof PAL

/** Per-biome environment colours, shared by terrain, sky and lighting. */
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
  /** Direction the key light comes from. */
  lightDirX: number
  lightDirY: number
  ambient: string
}

export const BIOME_PALETTES: Record<string, BiomePalette> = {
  'east-blue': {
    skyTop: '#2A6CC0', skyMid: '#5AB4EA', skyLow: '#C6EBFA', sunTint: '#FFF0BE',
    farSilhouette: '#7AAAD0', midSilhouette: '#2F7C3A',
    ground: '#5CC34C', groundDeep: '#2F7C3A', groundEdge: '#8A5C38',
    accent: '#38C2DC', fog: '#C6EBFA', lightDirX: -0.6, lightDirY: -0.8, ambient: '#9CD4F0',
  },
  alabasta: {
    skyTop: '#3A82CE', skyMid: '#8CC8EA', skyLow: '#F6DFAE', sunTint: '#FFE0A0',
    farSilhouette: '#D2AE78', midSilhouette: '#B4854E',
    ground: '#F0D79E', groundDeep: '#C8A263', groundEdge: '#96703E',
    accent: '#F06A2E', fog: '#F4E2B8', lightDirX: -0.5, lightDirY: -0.86, ambient: '#F8E4B6',
  },
  skypiea: {
    skyTop: '#4E90DE', skyMid: '#9EDCF6', skyLow: '#F0FCFF', sunTint: '#FFFFFF',
    farSilhouette: '#CCE8F6', midSilhouette: '#84D2AE',
    ground: '#96E8C6', groundDeep: '#40A484', groundEdge: '#E0F6EC',
    accent: '#FFF0BE', fog: '#F0FCFF', lightDirX: -0.6, lightDirY: -0.8, ambient: '#E6F8FF',
  },
  water7: {
    skyTop: '#255C98', skyMid: '#4A94C6', skyLow: '#AEDAEC', sunTint: '#FFD8A8',
    farSilhouette: '#5E8CAC', midSilhouette: '#9A6234',
    ground: '#9A6234', groundDeep: '#603A1E', groundEdge: '#D19A5A',
    accent: '#38C2DC', fog: '#B6D8E8', lightDirX: -0.7, lightDirY: -0.72, ambient: '#A8CCE4',
  },
  'thriller-bark': {
    skyTop: '#0C1638', skyMid: '#2A2052', skyLow: '#54366A', sunTint: '#D4B0F0',
    farSilhouette: '#32224C', midSilhouette: '#1E1632',
    ground: '#443458', groundDeep: '#241A38', groundEdge: '#7A5A8E',
    accent: '#9B50C0', fog: '#443468', lightDirX: 0.7, lightDirY: -0.72, ambient: '#7A68A0',
  },
  wano: {
    skyTop: '#54306A', skyMid: '#D25A78', skyLow: '#FAB098', sunTint: '#FFDCAE',
    farSilhouette: '#8A5478', midSilhouette: '#46304C',
    ground: '#7C5442', groundDeep: '#46302A', groundEdge: '#F0849A',
    accent: '#F0849A', fog: '#F0AEB6', lightDirX: 0.6, lightDirY: -0.8, ambient: '#EEAEB6',
  },
}

export const biomePalette = (b: string): BiomePalette =>
  BIOME_PALETTES[b] ?? BIOME_PALETTES['east-blue']
