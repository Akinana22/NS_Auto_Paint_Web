export const PRESET_PALETTE_HEX: string[] = [
  '#FFFFFF','#F1EFF8','#F0F0F8','#F0F7FF','#F0FBF4','#F0F4EE','#F5FAF0','#FDFDEE','#FEF3EF','#FAF0F0','#FDEDDC',
  '#EBEBEB','#CFC8E9','#C7CDE7','#C8E9FD','#C8F1D7','#C7DBC8','#DAEEC8','#FBF9C8','#FCD6C9','#EFC9C8','#E4CFB0',
  '#D5D5D3','#A592D7','#919FD5','#92D6FD','#92E6BA','#92BD94','#BBE294','#FAF592','#FBB491','#E29691','#CAA976',
  '#BCBCBC','#6527C2','#004AC0','#06C2FE','#00DA90','#019616','#92D314','#F9F000','#F78400','#D42700','#91610D',
  '#9C9D9A','#5620AA','#003FA4','#02A5D8','#03BC7B','#03800E','#7DB50C','#D6CE00','#D57100','#B62100','#774200',
  '#727272','#421785','#003281','#0084AB','#009360','#00650C','#628E0D','#A9A200','#A85801','#901600','#5D380C',
  '#000000','#22094C','#001648','#014963','#025435','#013800','#355100','#605D00','#602E01','#510C00','#34220D',
  '#FE2500','#FFFB00','#07F900','#02FDFF','#0432FE','#8836FF','#FF36C3',
];

export const PRESET_COLOR_COUNT = 84;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

export function getPresetPaletteRgb(): [number, number, number][] {
  return PRESET_PALETTE_HEX.map(hexToRgb);
}

export function getPresetPaletteHex(): string[] {
  return [...PRESET_PALETTE_HEX];
}
