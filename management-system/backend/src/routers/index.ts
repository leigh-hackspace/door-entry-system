import type { TaskManager } from "@/tasks";
import { ActivityLogRouter } from "./activity-log.ts";
import { AuthRouter } from "./auth.ts";
import { DeviceRouter } from "./device.ts";
import { StatsRouter } from "./stats.ts";
import { TagRouter } from "./tag.ts";
import { TaskRouter } from "./task.ts";
import { tRPC } from "./trpc.ts";
import { UserRouter } from "./user.ts";

export * from "./trpc.ts";

export const AppRouter = (taskManager: TaskManager) =>
  tRPC.router({
    ActivityLog: ActivityLogRouter,
    Auth: AuthRouter,
    Device: DeviceRouter,
    Stats: StatsRouter,
    Tag: TagRouter,
    Task: TaskRouter(taskManager),
    User: UserRouter,
  });
