import { GlobalDeviceCollectionWs } from "@/services";
import { getNextDailyRuntime, Task } from "./common.ts";

export class PushTagCodesTask extends Task {
  protected override calculateNextRunTime() {
    return getNextDailyRuntime("02:30").getTime();
  }

  protected override async run(signal: AbortSignal): Promise<void> {
    await GlobalDeviceCollectionWs.pushValidCodes();
  }
}
