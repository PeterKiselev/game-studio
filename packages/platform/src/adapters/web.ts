import { BasePlatform } from '../base';
import type { PlatformId } from '../types';

/** Полигон: локальная разработка, itch.io, собственный сайт. Реклама выключена. */
export class WebPlatform extends BasePlatform {
  readonly id: PlatformId = 'web';

  override async init(): Promise<void> {
    this.locale = (navigator.language || 'ru').slice(0, 2);
  }
}

export default WebPlatform;
