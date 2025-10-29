import { db, type PaymentStatus, PaymentTable, UserTable } from "@/db";
import { GoCardlessService } from "@/services";
import { parse } from "date-fns";
import { eq, isNotNull } from "drizzle-orm";
import { assert } from "ts-essentials";
import { getNextDailyRuntime, Task } from "./common.ts";

export class SyncGocardlessTask extends Task {
  protected override calculateNextRunTime() {
    return getNextDailyRuntime("02:10").getTime();
  }

  protected override async run(signal: AbortSignal): Promise<void> {
    const users = await db.select().from(UserTable).where(isNotNull(UserTable.gocardlessCustomerId));

    const api = new GoCardlessService();

    for (const user of users) {
      if (signal.aborted) return;

      await this.writeLog("info", `Syncing payments for user: ${user.name}`);

      assert(user.gocardlessCustomerId, "No gocardless_customer_id!");
      const payments = await api.getPayments(user.gocardlessCustomerId);

      for (const payment of payments) {
        if (signal.aborted) return;

        if (!payment.charge_date) continue;

        const exists = await db
          .select({ status: PaymentTable.status })
          .from(PaymentTable)
          .where(eq(PaymentTable.id, payment.id));

        if (exists.length === 0) {
          await this.writeLog("info", `New payment: ${payment.amount} ${payment.status}`);

          await db.insert(PaymentTable).values({
            id: payment.id,
            user_id: user.id,
            status: payment.status as PaymentStatus,
            amount: String(parseInt(payment.amount) / 100),
            charge_date: parse(payment.charge_date, "yyyy-MM-dd", new Date()),
            description: payment.description ?? "",
          });
        } else {
          if (exists[0].status !== payment.status) {
            await this.writeLog("info", `Updated payment: ${payment.amount} ${payment.status}`);

            await db
              .update(PaymentTable)
              .set({ status: payment.status as PaymentStatus, updated: new Date() })
              .where(eq(PaymentTable.id, payment.id));
          }
        }
      }
    }
  }
}
