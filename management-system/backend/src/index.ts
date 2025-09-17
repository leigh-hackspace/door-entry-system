/// <reference types='@types/node' />
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import cors from "cors";
import http from "node:http";
import { WebSocketExpress } from "websocket-express";
import { Config } from "./config/index.ts";
import { AppRouter, tRPC } from "./routers/index.ts";
import { getWebSocketRouter, GlobalDeviceCollectionWs } from "./services/device.ws/index.ts";
import { bootstrap, GlobalDeviceCollection, handleDeviceNotification, HomeAssistantService } from "./services/index.ts";

const Port = Config.DE_BACKEND_PORT;

export type AppRouter = typeof AppRouter;

async function start() {
  const app = new WebSocketExpress();

  app.use(cors());

  // app.use((req) => {
  //   console.log(req.socket.remoteAddress);
  // });

  app.use(getWebSocketRouter());
  app.set("shutdown timeout", 1000);

  const trpcHandler = createHTTPHandler({
    router: AppRouter,
    createContext: tRPC.createContext,
  });

  app.use(trpcHandler);
  app.use(handleDeviceNotification);

  const server = http.createServer();
  app.attach(server);

  await bootstrap();

  const homeAssistantService = new HomeAssistantService(
    Config.DE_HOME_ASSISTANT_WS_URL,
    Config.DE_HOME_ASSISTANT_ACCESS_TOKEN,
  );

  homeAssistantService.initialize();

  // deno-lint-ignore no-explicit-any
  homeAssistantService.callback = (entityId: string, newState: any) => {
    if (entityId === "input_boolean.hackspace_open") {
      console.log("hackspace_status:", newState);

      GlobalDeviceCollection.pushLatchStateAll(newState.state === "on");
      GlobalDeviceCollectionWs.pushLatchStateAll(newState.state === "on");
    }
  };

  console.log("API server listening on port:", Port);

  server.listen(Port);
}

void start();
