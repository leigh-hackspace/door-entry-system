import * as v from "valibot";
import { FieldMetadata } from "./common.ts";

export interface TagSelect {
  id: string;
  code: string;
  description: string;
  userId: string | null;
  userName: string | null;
}

export const TagCreateSchema = v.object({
  userId: v.optional(
    v.nullable(v.pipe(v.string(), v.uuid(), v.title("User"), v.metadata(FieldMetadata({ icon: "👤", lookup: "User" })))),
  ),
  code: v.pipe(v.string(), v.minLength(2), v.title("Code"), v.metadata(FieldMetadata({ icon: "🔑" }))),
  description: v.pipe(v.string(), v.minLength(2), v.title("Description"), v.metadata(FieldMetadata({ icon: "✍" }))),
});

export type TagCreate = v.InferInput<typeof TagCreateSchema>;

export const TagUpdateSchema = v.partial(TagCreateSchema);

export type TagUpdate = v.InferInput<typeof TagUpdateSchema>;
