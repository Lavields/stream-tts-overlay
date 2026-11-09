import WebSocket from 'ws';
export default class extends WebSocket {
  constructor(){super(process.env.TEST_TWITCH_IRC);}
}
