import { Plugin } from '../../common/plugin';
import { IContainer, IMessage, ChannelType, IHttpResponse } from '../../common/types';
import * as cheerio from 'cheerio';

class Garage {
  public name: string = '';
  public available: number = 0;
  public saturation: number = 0;
  public capacity: number = 0;
  public percent_full: number = 0;
  public percent_avail: number = 0;
}

export class GaragePlugin extends Plugin {
  public name: string = 'Garage Plugin';
  public description: string = 'Gets garage status.';
  public usage: string = 'garage <which garage>';
  public permission: ChannelType = ChannelType.Public;

  private _API_URL: string = 'http://secure.parking.ucf.edu/GarageCount/iframe.aspx';
  private _TITLE_MSG: string = '**Current UCF Garage Saturation**';

  private _GARAGE_UPD_THRESH: number = 1000 * 60 * 2; // in ms, two minutes.
  private _LAST_UPD_TIME: number = -this._GARAGE_UPD_THRESH - 1;
  private _GARAGES: Garage[] = [];

  private _processResponse(text: string): Garage[] {
    const $ = cheerio.load(text);
    const garages = $('.dxgv');

    let last = '';
    const processed_garages: Garage[] = [];

    garages.map((idx: number, elem: Object) => {
      if (idx % 3 === 0)
        last = $(elem)
          .text()
          .replace('\n', '');
      else if (idx % 3 === 1) {
        const token = $(elem)
          .text()
          .trim()
          .split('/');
        const garage = {
          name: last,
          available: +token[0],
          saturation: 0,
          capacity: +token[1],
          percent_full: 0.0,
          percent_avail: 0.0,
        };

        garage.percent_avail = (100.0 * garage.available) / garage.capacity;
        garage.saturation = garage.capacity - garage.available;

        if (garage.saturation < 0) garage.saturation = 0;

        garage.percent_full = (100.0 * garage.saturation) / garage.capacity;

        processed_garages.push(garage);
      }
    });

    return processed_garages;
  }

  private async _getGarages(): Promise<Garage[]> {
    const time_since_last: number = Date.now() - this._LAST_UPD_TIME;
    if (time_since_last < this._GARAGE_UPD_THRESH) return this._GARAGES;

    this._LAST_UPD_TIME = Date.now();

    await this.container.httpService
      .get(`${this._API_URL}`)
      .then((response: IHttpResponse) => {
        return (this._GARAGES = this._processResponse(response.data));
      })
      .catch((err) => {
        console.log(err);
        return (this._GARAGES = []);
      });

    return this._GARAGES;
  }

  constructor(public container: IContainer) {
    super();
  }

  public async validate(message: IMessage, args: string[]) {
    return true;
  }

  public async hasPermission(message: IMessage) {
    const channelName = this.container.messageService.getChannel(message).name;
    return this.container.channelService.hasPermission(channelName, this.permission);
  }

  public async execute(message: IMessage, args?: string[]) {
    const garages: Garage[] = await this._getGarages();
    let message_response: string = '';

    garages.map((elem: Garage) => {
      message_response += `${elem.name.replace('Garage ', '')}:`.padStart(6, ' ');
      message_response += `${elem.saturation} / ${elem.capacity}`.padStart(12, ' ');
      message_response += `(${`${Math.round(elem.percent_full)}`.padStart(2, ' ')}% full)`.padStart(
        12,
        ' '
      );
      message_response += '\n';
    });

    message.reply(`${this._TITLE_MSG}\`\`\`${message_response}\`\`\``);
  }
}
