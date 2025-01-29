/// <reference types='npm:@types/node' />
import { createHTTPServer } from "npm:@trpc/server@11.0.0-rc.648/adapters/standalone";
import cors from "npm:cors";
import { Config } from "./config/index.ts";
import { AppRouter, tRPC } from "./routers/index.ts";
import { bootstrap, handleLogCode, HomeAssistantService, setLatch, startCheckDevice } from "./services/index.ts";

const Port = Config.DE_BACKEND_PORT;

export type AppRouter = typeof AppRouter;

async function start() {
  const server = createHTTPServer({
    router: AppRouter,
    middleware: cors(),
    createContext: tRPC.createContext,
  });

  server.addListener("request", handleLogCode);

  await bootstrap();

  void startCheckDevice();

  const homeAssistantService = new HomeAssistantService(
    Config.DE_HOME_ASSISTANT_WS_URL,
    Config.DE_HOME_ASSISTANT_ACCESS_TOKEN
  );

  homeAssistantService.initialize();

  // deno-lint-ignore no-explicit-any
  homeAssistantService.callback = (entityId: string, newState: any) => {
    if (entityId === "binary_sensor.hackspace_status") {
      console.log("hackspace_status:", newState);

      setLatch(newState.state === "on");
    }
  };

  console.log("API server listening on port:", Port);
  server.listen(Port);
}

void start();
