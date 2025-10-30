import { db, MfaData, UserTable } from "@/db";
import { assertUnreachable } from "@door-entry-management-system/common";
import { addHours, parseISO } from "date-fns";
import { eq } from "drizzle-orm";
import * as OTPAuth from "jsr:@hectorm/otpauth";
import { assert } from "ts-essentials";
import * as v from "valibot";
import type { SessionUser } from "./common.ts";

export class MfaHelper {
  public static MFA_CHALLENGE_MAX_AGE_HOURS = 24;

  constructor(private user: SessionUser, private remoteAddress: string) {}

  /** Is the most recent challenge still valid? */
  public getMfaPassed() {
    const datePassed = this.user.mfaData.type === "confirmed" ? this.user.mfaData.challenges[this.remoteAddress] : undefined;

    return datePassed ? parseISO(datePassed) > addHours(new Date(), -MfaHelper.MFA_CHALLENGE_MAX_AGE_HOURS) : false;
  }

  /** Are we setting up or challenging the user? */
  public async getMfaInfo() {
    if (this.user.mfaData.type === "confirmed") {
      const totp = this.getTotp();

      return {
        mode: "challenge",
        issuer: totp.issuer,
        label: totp.label,
      } as const;
    } else if (this.user.mfaData.type === "unconfirmed") {
      const totp = this.getTotp();

      return {
        mode: "setup",
        uri: totp.toString(),
      } as const;
    } else if (this.user.mfaData.type === "not_set") {
      const secret = new OTPAuth.Secret({ size: 20 });

      this.user.mfaData = { type: "unconfirmed", secret_key: secret.base32 };
      await this.updateMfaData();

      const totp = this.getTotp();

      return {
        mode: "setup",
        uri: totp.toString(),
      } as const;
    } else {
      assertUnreachable(this.user.mfaData);
    }
  }

  /** Verify the token. If first use of the TOTP for this user then confirm the secret key. */
  public async checkMfaToken(token: string) {
    assert(this.user.mfaData.type !== "not_set", "MFA not set!");

    const totp = this.getTotp();

    const delta = totp.validate({ token, window: 1 });

    // Will be either: -1, 0, 1 or `null` if outside the window
    if (typeof delta === "number") {
      if (this.user.mfaData.type === "unconfirmed") {
        // First time using the TOTP
        this.user.mfaData = {
          type: "confirmed",
          secret_key: this.user.mfaData.secret_key,
          confirmed: new Date().toISOString(),
          challenges: {},
        };
      }

      this.user.mfaData.challenges[this.remoteAddress] = new Date().toISOString();
      await this.updateMfaData();

      return true;
    } else {
      return false;
    }
  }

  private getTotp() {
    assert(this.user.mfaData.type !== "not_set", "MFA not set!");

    return new OTPAuth.TOTP({
      issuer: "Leigh Hack",
      label: this.user.name,
      secret: this.user.mfaData.secret_key,
    });
  }

  private async updateMfaData() {
    await db.update(UserTable).set({ mfaData: v.parse(MfaData, this.user.mfaData) }).where(eq(UserTable.id, this.user.id));
  }
}
