import type { ElementOf } from "ts-essentials";
import * as v from "valibot";
import { EmailAddress, FieldMetadata, Password } from "./common.ts";

export const UserRole = ["admin", "user"] as const;
export type UserRole = ElementOf<typeof UserRole>;

export const LoginDataSchema = v.object({
  email: EmailAddress,
  password: Password("Password"),
});

export type LoginData = v.InferInput<typeof LoginDataSchema>;

export interface UserSelect {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  paidUp: boolean;
  created: Date;
  updated: Date;
  gocardlessCustomerId: string | null;
  notes: string | null;
  imageUrl: string;
}

export const UserCreateSchema = v.object({
  role: v.pipe(v.picklist(["admin", "user"]), v.title("Role"), v.metadata(FieldMetadata({ icon: "🏅" }))),
  email: EmailAddress,
  name: v.pipe(v.string(), v.minLength(2), v.title("Name"), v.metadata(FieldMetadata({ icon: "👤" }))),
  newPassword: Password("New Password", "Leave blank to keep existing password"),
  confirmPassword: Password("Confirm Password"),
  notes: v.nullable(
    v.pipe(
      v.string(),
      v.title("Notes"),
      v.description("Miscellaneous notes or extra information"),
      v.metadata(FieldMetadata({ icon: "📎", text: true })),
    ),
  ),
});

export type UserCreate = v.InferInput<typeof UserCreateSchema>;

export const UserUpdateSchema = v.partial(UserCreateSchema);

export type UserUpdate = v.InferInput<typeof UserUpdateSchema>;

export const UserAddTagSchema = v.object({
  user_id: v.pipe(v.string(), v.uuid(), v.title("User ID")),
  tag_id: v.pipe(v.string(), v.uuid(), v.title("Tag ID")),
});
