import { SlotMachineEngine } from './slots.ts';
import type { GameRoundResult } from './base-game.ts';

export interface SlotThemeConfig {
  gameCode: string;
  title: string;
  symbols: string[];
  theme: string;
}

export class SlotThemesRegistry {
  public static readonly THEMES: Record<string, SlotThemeConfig> = {
    slot_fruits: {
      gameCode: 'slot_fruits',
      title: 'Fruit Party Bonanza',
      symbols: ['CHERRY', 'LEMON', 'ORANGE', 'PLUM', 'BELL', 'SEVEN', 'WILD', 'BONUS'],
      theme: 'Classic Fruit',
    },
    slot_chicken: {
      gameCode: 'slot_chicken',
      title: 'Crazy Chicken Farm',
      symbols: ['EGG', 'CORN', 'ROOSTER', 'CHICK', 'BARN', 'GOLDEN_EGG', 'WILD', 'BONUS'],
      theme: 'Farmyard Comedy',
    },
    slot_ramses: {
      gameCode: 'slot_ramses',
      title: 'Ramses Treasure',
      symbols: ['SCARAB', 'ANKH', 'EYE_OF_HORUS', 'PYRAMID', 'SPHINX', 'PHARAOH', 'WILD', 'BONUS'],
      theme: 'Ancient Egypt',
    },
    slot_space: {
      gameCode: 'slot_space',
      title: 'Space Adventure',
      symbols: ['ASTEROID', 'PLANET', 'SATELLITE', 'ROCKET', 'ALIEN', 'GALAXY', 'WILD', 'BONUS'],
      theme: 'Cosmic Sci-Fi',
    },
    slot_christmas: {
      gameCode: 'slot_christmas',
      title: 'Christmas Gifts',
      symbols: ['CANDY_CANE', 'SNOWFLAKE', 'GIFT_BOX', 'REINDEER', 'BELL', 'SANTA', 'WILD', 'BONUS'],
      theme: 'Holiday Festive',
    },
    soccer_hero: {
      gameCode: 'soccer_hero',
      title: 'Soccer Hero Champions',
      symbols: ['WHISTLE', 'BOOTS', 'GLOVES', 'GOAL_NET', 'TROPHY', 'HERO_PLAYER', 'WILD', 'BONUS'],
      theme: 'Football Stadium',
    },
  };

  public static play(gameCode: string, params: {
    userId: string;
    wager: number;
    serverSeed: string;
    clientSeed: string;
    nonce: number;
  }): GameRoundResult {
    const config = this.THEMES[gameCode] || this.THEMES.slot_fruits;
    return SlotMachineEngine.spin({
      userId: params.userId,
      wager: params.wager,
      gameCode: config.gameCode,
      serverSeed: params.serverSeed,
      clientSeed: params.clientSeed,
      nonce: params.nonce,
    });
  }
}
