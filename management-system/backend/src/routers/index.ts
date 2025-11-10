import type { DeviceCollection } from "@/services";
import type { TaskManager } from "@/tasks";
import { ActivityLogRouter } from "./activity-log.ts";
import { AuthRouter } from "./auth.ts";
import { DeviceRouter } from "./device.ts";
import { StatsRouter } from "./stats.ts";
import { getTagRouter } from "./tag.ts";
import { TaskLogRouter } from "./task-log.ts";
import { TaskRouter } from "./task.ts";
import { tRPC } from "./trpc.ts";
import { getUserRouter } from "./user.ts";

export * from "./trpc.ts";

export const getAppRouter = (taskManager: TaskManager, deviceCollectionWs: DeviceCollection) =>
  tRPC.router({
    ActivityLog: ActivityLogRouter,
    Auth: AuthRouter,
    Device: DeviceRouter(deviceCollectionWs),
    Stats: StatsRouter(deviceCollectionWs),
    Tag: getTagRouter(deviceCollectionWs),
    TaskLog: TaskLogRouter,
    Task: TaskRouter(taskManager),
    User: getUserRouter(),
  });
