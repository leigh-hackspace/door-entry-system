import { db, TaskLogTable } from "@/db";
import process from "node:process";
import { assert } from "ts-essentials";
import type { Task } from "./common.ts";

export * from "./common.ts";
export * from "./sync-gocardless.ts";

export class TaskManager {
  #tasks: Task[] = [];

  constructor() {
    process.on("SIGINT", () => {
      console.log("Gracefully shutting down tasks...");
    });
  }

  public scheduleTask(task: Task) {
    this.#tasks.push(task);

    const schedule = () => {
      const timeout = task.nextRunTime - Date.now();

      if (timeout < 0) throw new Error(`Next run time for "${task.name}" is in the past!`);

      console.log(`Task ${task.name} will next run in ${timeout / 1000 / 60 / 60} hours`);

      setTimeout(async () => {
        try {
          await task.tryStart();

          schedule();
        } catch (err) {
          console.error("Error starting / scheduling task:", err);
        }
      }, timeout);
    };

    schedule();
  }

  public getTaskInfo() {
    return this.#tasks.map((t) => ({ name: t.name, running: t.running, nextRunTime: new Date(t.nextRunTime) }));
  }

  public async runTask(name: string) {
    const task = this.#tasks.find((t) => t.name === name);
    assert(task, `Task not found with name: ${name}`);

    await task.tryStart();
  }

  public async printLogs() {
    const result = await db.select().from(TaskLogTable);

    console.log(result);
  }
}
