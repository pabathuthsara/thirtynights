import type { ImageSourcePropType } from 'react-native';

export const completedStickerAssets: ImageSourcePropType[] = [
  require('../../assets/soft-keepsake/stickers/completed/completed-01.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-02.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-03.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-04.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-05.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-06.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-07.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-08.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-09.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-10.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-11.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-12.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-13.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-14.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-15.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-16.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-17.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-18.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-19.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-20.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-21.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-22.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-23.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-24.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-25.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-26.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-27.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-28.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-29.png'),
  require('../../assets/soft-keepsake/stickers/completed/completed-30.png'),
];

export const embossedStickerAssets: ImageSourcePropType[] = [
  require('../../assets/soft-keepsake/stickers/embossed/embossed-01.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-02.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-03.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-04.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-05.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-06.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-07.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-08.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-09.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-10.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-11.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-12.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-13.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-14.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-15.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-16.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-17.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-18.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-19.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-20.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-21.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-22.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-23.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-24.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-25.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-26.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-27.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-28.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-29.png'),
  require('../../assets/soft-keepsake/stickers/embossed/embossed-30.png'),
];

export const keepsakeDecorations = {
  binderClip: require('../../assets/soft-keepsake/decorations/binder-clip.png') as ImageSourcePropType,
  tapedFlowers: require('../../assets/soft-keepsake/decorations/taped-flowers.png') as ImageSourcePropType,
  journal: require('../../assets/soft-keepsake/decorations/journal.png') as ImageSourcePropType,
  waxSeal: require('../../assets/soft-keepsake/decorations/wax-seal.png') as ImageSourcePropType,
  washiTape: require('../../assets/soft-keepsake/decorations/washi-tape.png') as ImageSourcePropType,
  driedFlowers: require('../../assets/soft-keepsake/decorations/dried-flowers.png') as ImageSourcePropType,
} as const;

export const keepsakeTextures = {
  paperBackground: require('../../assets/soft-keepsake/textures/paper-background.jpg') as ImageSourcePropType,
  stickerBoard: require('../../assets/soft-keepsake/textures/sticker-board.png') as ImageSourcePropType,
} as const;

export function stickerAssetForNight(assets: ImageSourcePropType[], nightIndex: number) {
  return (assets[(Math.max(1, nightIndex) - 1) % assets.length] ?? completedStickerAssets[0]) as ImageSourcePropType;
}
