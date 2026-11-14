import { MapSchema, Schema, type } from '@colyseus/schema';

export class PlayerSchema extends Schema {
  @type('string')
  id: string = '';

  @type('number')
  x: number = 0;

  @type('number')
  y: number = 0;

  @type('string')
  direction: 'up' | 'down' | 'left' | 'right' = 'down';

  @type('boolean')
  isMoving: boolean = false;
}

export class GameStateSchema extends Schema {
  @type({ map: PlayerSchema })
  players = new MapSchema<PlayerSchema>();

  @type('number')
  trainCondition: number = 100;

  @type('number')
  timeRemaining: number = 1200;

  @type('string')
  gameStatus: 'lobby' | 'active' | 'won' | 'lost' = 'lobby';
}
