/// <reference types='@types/node' />
import { Config } from "@/config";
import { AppRouter, tRPC } from "@/routers";
import { bootstrap, getWebSocketRouter, GlobalDeviceCollectionWs, HomeAssistantService } from "@/services";
import { CheckPaymentsTask, SyncAuthentikTask, SyncGocardlessTask, TaskManager } from "@/tasks";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import cors from "cors";
import http from "node:http";
import { WebSocketExpress } from "websocket-express";
import { PushTagCodesTask } from "./tasks/push-tag-codes.ts";

const Port = Config.DE_BACKEND_PORT;

export type AppRouter = ReturnType<typeof AppRouter>;

async function start() {
  const taskManager = new TaskManager();

  taskManager.scheduleTask(new SyncAuthentikTask());
  taskManager.scheduleTask(new SyncGocardlessTask());
  taskManager.scheduleTask(new CheckPaymentsTask());
  taskManager.scheduleTask(new PushTagCodesTask());

  const app = new WebSocketExpress();

  app.use(cors());
  app.use(getWebSocketRouter());

  app.set("shutdown timeout", 1000);

  const trpcHandler = createHTTPHandler({
    router: AppRouter(taskManager),
    createContext: tRPC.createContext,
  });

  app.use(trpcHandler);

  const server = http.createServer();
  app.attach(server);

  try {
    await bootstrap();
  } catch (err) {
    console.error("Bootstrap Error:", err);
  }

  const homeAssistantService = new HomeAssistantService(
    Config.DE_HOME_ASSISTANT_WS_URL,
    Config.DE_HOME_ASSISTANT_ACCESS_TOKEN
  );

  homeAssistantService.initialize();

  // deno-lint-ignore no-explicit-any
  homeAssistantService.callback = (entityId: string, newState: any) => {
    if (entityId === "input_boolean.hackspace_open") {
      console.log("hackspace_status:", newState);

      GlobalDeviceCollectionWs.pushLatchStateAll(newState.state === "on");
    }
  };

  console.log("API server listening on port:", Port);

  server.listen(Port);
}

void start();
