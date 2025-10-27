import { db, type LogLevel, TaskLogTable } from "@/db";
import { addDays, type Day, isAfter, isBefore, nextDay } from "date-fns";
import { assert } from "ts-essentials";

const Minute = 60;

export abstract class Task {
  public get name() {
    return this.constructor.name;
  }
  public get running() {
    return this.#running;
  }
  public get nextRunTime() {
    return this.#nextRunTime;
  }

  #nextRunTime = this.calculateNextRunTime() ?? Date.now();
  #running = false;

  protected abstract calculateNextRunTime(): number;

  public async tryStart() {
    if (this.running) return;
    this.#running = true;

    const abortController = new AbortController();

    const timeoutMs = 10 * Minute * 1_000;
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      await this.writeLog("debug", "Started");
      console.log("Starting task:", this.name);

      await this.run(abortController.signal);
    } catch (err) {
      if (abortController.signal.aborted) {
        await this.writeLog("error", `Task timed out after ${timeoutMs}ms`);
        console.error("Task aborted due to timeout:", this.name);
      } else {
        assertErrorOrException(err);
        this.writeLog("error", err.toString());
      }
    } finally {
      clearTimeout(timeoutId);
      this.#running = false;

      this.#nextRunTime = this.calculateNextRunTime();

      await this.writeLog("debug", "Finished");
      console.log("Finished task:", this.name, "Next run:", new Date(this.#nextRunTime));
    }
  }

  protected async writeLog(level: LogLevel, notes: string, data: Record<string, string> = {}) {
    try {
      const job_started = new Date(this.#nextRunTime);

      const [result] = await db
        .insert(TaskLogTable)
        .values({
          level,
          job_started,
          type: this.constructor.name,
          notes,
          data,
        })
        .returning({ id: TaskLogTable.id });

      console.log("writeLog", result.id, notes);
    } catch (err) {
      console.error("writeLog:", err);
    }
  }

  protected abstract run(signal: AbortSignal): Promise<void>;
}

export function assertErrorOrException(err: unknown): asserts err is Error {
  assert(err instanceof Error, "Error is not an instance of `Error`");
}

export function getNextDailyRuntime(timeStr: string) {
  // Parse the input time string into hours and minutes
  const [hours, minutes] = timeStr.split(":").map(Number);

  // Get the current date and time
  const now = new Date();

  // Create the target time for today
  const targetToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);

  // If the target time today is in the past, set it for tomorrow
  if (isAfter(now, targetToday)) {
    const targetTomorrow = addDays(targetToday, 1);
    return targetTomorrow;
  }

  // If the target time today is in the future, return it
  return targetToday;
}

// Example usage:
// const nextRuntime = getNextDailyRuntime("13:30");
// console.log(format(nextRuntime, "yyyy-MM-dd HH:mm:ss"));

export function getNextWeeklyRuntime(timeStr: string, dayOfWeek: Day) {
  // Parse the input time string into hours and minutes
  const [hours, minutes] = timeStr.split(":").map(Number);

  // Get the current date and time
  const now = new Date();

  const targetToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);

  if (targetToday.getDay() === dayOfWeek && isBefore(now, targetToday)) {
    return targetToday;
  }

  return nextDay(targetToday, dayOfWeek);
}

// Example usage:
// const nextRuntime = getNextWeeklyRuntime("06:00", 1);
// console.log(format(nextRuntime, "yyyy-MM-dd HH:mm:ss"));
