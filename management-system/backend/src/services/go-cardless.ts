import type { PaymentSummary } from "@door-entry-management-system/common";
import { GoCardlessClient } from "npm:gocardless-nodejs/client.js";
import { Environments } from "npm:gocardless-nodejs/constants.js";
import { Config } from "../config/index.ts";

export class GoCardlessService {
  #client: GoCardlessClient;

  constructor() {
    this.#client = new GoCardlessClient(Config.DE_GOCARDLESS_API_TOKEN, Environments.Live, {
      raiseOnIdempotencyConflict: true,
    });
  }

  public async getCustomerId(email: string) {
    let customerId: string | undefined;

    for await (const customer of this.#client.customers.all({})) {
      if (customer.email === email) {
        customerId = customer.id!;
      }
    }

    return customerId;
  }

  public async getPayments(customerId: string): Promise<readonly PaymentSummary[]> {
    const { payments } = await this.#client.payments.list({ limit: "500", customer: customerId });

    return payments
      .map(({ id, amount, charge_date, created_at, currency, description, status }): PaymentSummary | null => {
        if (id && amount && charge_date && created_at && currency && description && status) {
          return {
            id,
            amount,
            charge_date,
            created_at,
            currency,
            description,
            status,
          };
        }
        return null;
      })
      .filter((p) => !!p);
  }
}
