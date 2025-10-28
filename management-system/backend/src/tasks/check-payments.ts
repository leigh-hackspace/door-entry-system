import { db, PaymentTable, UserTable } from "@/db";
import { addDays } from "date-fns";
import { and, eq, gt, isNotNull, or } from "drizzle-orm";
import { getNextDailyRuntime, Task } from "./common.ts";

export class CheckPaymentsTask extends Task {
  protected override calculateNextRunTime() {
    return getNextDailyRuntime("02:20").getTime();
  }

  protected override async run(signal: AbortSignal): Promise<void> {
    const users = await db
      .select()
      .from(UserTable)
      .where(or(isNotNull(UserTable.gocardless_customer_id), eq(UserTable.name, "Keysafe")));

    for (const user of users) {
      if (signal.aborted) return;

      console.log("Checking payments for user:", user.name);

      let paidUp = false;

      if (user.gocardless_customer_id) {
        const payments = await db
          .select()
          .from(PaymentTable)
          .where(
            and(
              eq(PaymentTable.user_id, user.id),
              gt(PaymentTable.charge_date, addDays(new Date(), -45)),
              eq(PaymentTable.status, "paid_out")
            )
          );

        if (payments.length > 0) {
          paidUp = true;
        }
      }

      // Special "Keysafe" user is always allowed
      if (user.name === "Keysafe") {
        paidUp = true;
      }

      if (user.paidUp !== paidUp) {
        console.log("Changing paid up:", paidUp);

        await db.update(UserTable).set({ paidUp }).where(eq(UserTable.id, user.id));
      }
    }
  }
}
