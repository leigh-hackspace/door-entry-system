import { ActivityLogRouter } from "./activity-log.ts";
import { AuthRouter } from "./auth.ts";
import { StatsRouter } from "./stats.ts";
import { TagRouter } from "./tag.ts";
import { tRPC } from "./trpc.ts";
import { UserRouter } from "./user.ts";

export * from "./trpc.ts";

export const AppRouter = tRPC.router({
  ActivityLog: ActivityLogRouter,
  Auth: AuthRouter,
  Stats: StatsRouter,
  Tag: TagRouter,
  User: UserRouter,
});
