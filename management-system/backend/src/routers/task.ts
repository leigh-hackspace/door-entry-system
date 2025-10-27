import type { TaskManager } from "@/tasks";
import * as v from "valibot";
import { assertRole } from "./common.ts";
import { tRPC } from "./trpc.ts";

export const TaskRouter = (taskManager: TaskManager) =>
  tRPC.router({
    List: tRPC.ProtectedProcedure.input(v.parser(v.object({}))).query(async ({ ctx, input: {} }) => {
      assertRole(ctx, "admin");

      return taskManager.getTaskInfo();
    }),

    Run: tRPC.ProtectedProcedure.input(v.parser(v.object({ name: v.string() }))).mutation(async ({ ctx, input }) => {
      assertRole(ctx, "admin");

      console.log("Running task manually:", input.name);

      await taskManager.runTask(input.name);
    }),
  });
