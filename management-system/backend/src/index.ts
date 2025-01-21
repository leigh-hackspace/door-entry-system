/// <reference types='npm:@types/node' />
import { createHTTPServer } from "npm:@trpc/server@11.0.0-rc.648/adapters/standalone";
import cors from "npm:cors";
import { Config } from "./config/index.ts";
import { AppRouter, tRPC } from "./routers/index.ts";
import { bootstrap, handleLogCode, startCheckDevice } from "./services/index.ts";

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

  console.log("API server listening on port:", Port);
  server.listen(Port);
}

void start();
