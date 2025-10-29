import type { DeviceCollection } from "@/services";
import { getNextDailyRuntime, Task } from "./common.ts";

export class PushTagCodesTask extends Task {
  constructor(private deviceCollectionWs: DeviceCollection) {
    super();
  }

  protected override calculateNextRunTime() {
    return getNextDailyRuntime("02:30").getTime();
  }

  protected override async run(signal: AbortSignal): Promise<void> {
    await this.deviceCollectionWs.pushValidCodes();
  }
}
