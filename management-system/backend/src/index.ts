/// <reference types='npm:@types/node' />
import { createHTTPServer } from "npm:@trpc/server@next/adapters/standalone";
import cors from "npm:cors";
import { Config } from "./config/index.ts";
import { AppRouter, tRPC } from "./routers/index.ts";
import { bootstrap, GlobalDeviceCollection, handleDeviceNotification, HomeAssistantService } from "./services/index.ts";

const Port = Config.DE_BACKEND_PORT;

export type AppRouter = typeof AppRouter;

async function start() {
  const server = createHTTPServer({
    router: AppRouter,
    middleware: cors(),
    createContext: tRPC.createContext,
  });

  server.addListener("request", handleDeviceNotification);

  await bootstrap();

  const homeAssistantService = new HomeAssistantService(
    Config.DE_HOME_ASSISTANT_WS_URL,
    Config.DE_HOME_ASSISTANT_ACCESS_TOKEN
  );

  homeAssistantService.initialize();

  // deno-lint-ignore no-explicit-any
  homeAssistantService.callback = (entityId: string, newState: any) => {
    if (entityId === "input_boolean.hackspace_open") {
      console.log("hackspace_status:", newState);

      GlobalDeviceCollection.pushLatchStateAll(newState.state === "on");
    }
  };

  console.log("API server listening on port:", Port);
  server.listen(Port);
}

void start();
