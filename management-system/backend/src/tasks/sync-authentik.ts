import { db, UserTable } from "@/db";
import { AuthentikService } from "@/services";
import { eq, ilike, or } from "drizzle-orm";
import * as uuid from "npm:uuid";
import { getNextDailyRuntime, Task } from "./common.ts";

export class SyncAuthentikTask extends Task {
  protected override calculateNextRunTime() {
    return getNextDailyRuntime("02:00").getTime();
  }

  protected override async run(signal: AbortSignal): Promise<void> {
    const authentikService = new AuthentikService();

    const res = await authentikService.getAllUsers();

    let addedUsers = 0,
      updatedUsers = 0;

    for (const apiUser of res.results) {
      if (signal.aborted) return;

      if (apiUser.email === "" || !apiUser.is_active) continue;

      console.log("Syncing user:", apiUser.name, apiUser.email);

      const shouldBeAdmin = apiUser.groups_obj.map((g) => g.name).includes("Infra");
      const gocardless_customer_id = apiUser.attributes["leighhack.org/gocardless-customer-id"];

      // Match or UUID or Email
      const matchExpression = or(eq(UserTable.id, apiUser.uuid), ilike(UserTable.email, apiUser.email));

      const matchingUsers = await db.select().from(UserTable).where(matchExpression);

      let id: string;

      if (matchingUsers.length === 0) {
        id = apiUser.uuid ?? uuid.v4();

        console.log("Inserting", id);

        await db.insert(UserTable).values({
          id,
          email: apiUser.email.toLowerCase(),
          name: apiUser.name,
          role: shouldBeAdmin ? "admin" : "user",
          password_hash: "Authentik",
          gocardless_customer_id,
        });

        addedUsers += 1;
      } else {
        const matchingUser = matchingUsers[0];

        id = matchingUser.id;

        const emailDifferent = matchingUser.email !== apiUser.email.toLowerCase();
        const nameDifferent = matchingUser.name !== apiUser.name;
        const roleDifferent = matchingUser.role !== (shouldBeAdmin ? "admin" : "user");
        const gcDifferent = (matchingUser.gocardless_customer_id ?? null) !== (gocardless_customer_id ?? null);

        if (emailDifferent || nameDifferent || roleDifferent || gcDifferent) {
          console.log("Updating", id, { emailDifferent, nameDifferent, roleDifferent, gcDifferent });

          await db
            .update(UserTable)
            .set({
              email: apiUser.email.toLowerCase(),
              name: apiUser.name,
              role: shouldBeAdmin ? "admin" : "user",
              gocardless_customer_id,
              updated: new Date(),
            })
            .where(eq(UserTable.id, id));

          updatedUsers += 1;
        }
      }
    }

    this.writeLog("info", `Added = ${addedUsers}, Updated = ${updatedUsers}`);
  }
}
