import { PilotStore, pilotEnabled } from '../../betting-engine/src/pilot/pilot-store.ts';
import { LiveStateManager } from './domain/live-state.ts';
import { createServer } from 'http';
import { NativeWebSocketServer, NativeWebSocketClient } from './websocket/native-ws.ts';
import { config } from './config/environment.ts';
import { RedisPubSubManager } from './storage/redis-client.ts';
import { LiveSportsSimulator } from './ingestion/live-simulator.ts';
import { WebSocketGateway } from './websocket/ws-gateway.ts';
import { HttpRouter } from './http/routes.ts';

import { FeedConnectionManager } from './ingestion/feed-connection-manager.ts';
import { createLivePollerFromEnv } from './ingestion/the-odds-api-live-poller.ts';

async function bootstrap() {
  console.log('================================================================');
  console.log('  🚀 xBET Modern Platform - Real-Time Odds & WebSocket Engine');
  console.log('================================================================');

  // 1. Initialize Redis / Event Bus
  const pubSub = RedisPubSubManager.getInstance();
  await pubSub.connect();

  // 2. Initialize Ingestion Connection Manager & Real-Time Ingestion
  const feedManager = FeedConnectionManager.getInstance();
  feedManager.connectAll();
  console.log('[OddsEngine] Feed Ingestion Drivers active (Structured ready state for live feeds).');

  // 2b. Real live feed (The Odds API free tier) — genuine matches, odds and results.
  //     If no valid key is present, the poller declines and we start the local simulator
  //     so the site always has live in-play content to bet on.
  const pilot = pilotEnabled() ? new PilotStore() : null;
  let publishing=Promise.resolve();
  if(pilot){
    if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required for points pilot');
    const state=LiveStateManager.getInstance();
    for(const snapshot of await pilot.fixtures()){
      state.setFixture({...snapshot,startTime:new Date(snapshot.startTime),markets:new Map(snapshot.markets.map((m:any)=>[m.id,{...m,selections:new Map(m.selections.map((selection:any)=>[selection.id,selection]))}]))} as any);
    }
    const publish=(fixture:any)=>{const snapshot=JSON.parse(JSON.stringify(state.serializeFixture(fixture)));publishing=publishing.then(()=>pilot.publishFixture(snapshot)).then(async()=>{if(snapshot.status==='FINISHED')await pilot.settle({fixtureId:snapshot.id,homeScore:snapshot.score.home,awayScore:snapshot.score.away,status:'FINISHED',source:'SIMULATED_ENGINE',idempotencyKey:`simulated-result:${snapshot.id}:${snapshot.score.home}:${snapshot.score.away}`},'SYSTEM',{onlyIfUnresulted:true});}).catch(error=>console.error('[PilotMarkets]',error));};
    state.on('fixture:updated',publish);
    state.on('score:change',(delta)=>{const fixture=state.getFixture(delta.fixtureId);if(fixture)publish(fixture);});
    state.on('odds:tick',(delta)=>{const fixture=state.getFixture(delta.fixtureId);if(fixture)publish(fixture);});
    if(process.env.ENABLE_SIMULATOR==='true'){
      const simulator=new LiveSportsSimulator();
      if(!state.getAllFixtures().length)simulator.initializeSampleMatches();
      simulator.startSimulation();
      await publishing;
    }
  }else{
    const livePoller=createLivePollerFromEnv();
    if(!livePoller.start()){
      const simulator=new LiveSportsSimulator();simulator.initializeSampleMatches();simulator.startSimulation();
    }
  }

  // 3. Create HTTP Server & Router
  const router = new HttpRouter();
  const server = createServer((req, res) => {
    router.handleRequest(req, res);
  });

  // 4. Attach WebSocket Gateway
  const wss = new NativeWebSocketServer({ server, path: '/ws' });
  const pilotClients=new Set<NativeWebSocketClient>();
  let snapshotting=false;
  let snapshotTimer:NodeJS.Timeout|null=null;
  if(pilot){
    const send=async(client:NativeWebSocketClient)=>{const fixtures=await pilot.fixtures();if(client.readyState===NativeWebSocketClient.OPEN)client.send(JSON.stringify({type:'WELCOME',liveMatches:fixtures}));};
    wss.on('connection',(client:NativeWebSocketClient)=>{pilotClients.add(client);client.on('close',()=>pilotClients.delete(client));client.on('error',()=>pilotClients.delete(client));void send(client).catch(()=>client.close());});
    snapshotTimer=setInterval(async()=>{if(snapshotting)return;snapshotting=true;try{const fixtures=await pilot.fixtures();for(const client of pilotClients)if(client.readyState===NativeWebSocketClient.OPEN)client.send(JSON.stringify({type:'WELCOME',liveMatches:fixtures}));}catch(error){console.error('[PilotWebSocket]',error);}finally{snapshotting=false;}},1000);
    snapshotTimer.unref();
  }else new WebSocketGateway(wss);

  // 5. Start Listening
  server.listen(config.port, config.host, () => {
    console.log(`[HTTP] REST API listening on http://${config.host}:${config.port}`);
    console.log(`[WebSocket] Live Odds Stream available on ws://${config.host}:${config.port}/ws`);
    console.log(`[Health] Check status at http://${config.host}:${config.port}/api/v1/health`);
    console.log(`[In-Play] View active matches at http://${config.host}:${config.port}/api/v1/fixtures/in-play`);
  });

  // Graceful shutdown handling
  const shutdown = () => {
    console.log('\n[Server] Shutting down gracefully...');
    if(snapshotTimer)clearInterval(snapshotTimer);
    for(const client of pilotClients)client.close();
    wss.close();
    server.close(async () => {
      await publishing;
      await router.close();
      await pilot?.close();
      console.log('[Server] Service stopped.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Fatal] Failed to bootstrap Odds Engine:', err);
  process.exit(1);
});
