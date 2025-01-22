import * as v from "valibot";
import { FieldMetadata } from "./common.ts";

export const TagCreateSchema = v.object({
  user_id: v.optional(
    v.nullable(v.pipe(v.string(), v.uuid(), v.title("User"), v.metadata(FieldMetadata({ icon: "👤", lookup: "User" }))))
  ),
  code: v.pipe(v.string(), v.minLength(2), v.title("Name"), v.metadata(FieldMetadata({ icon: "Code" }))),
  description: v.pipe(v.string(), v.minLength(2), v.title("Description"), v.metadata(FieldMetadata({ icon: "Desc" }))),
});

export type TagCreate = v.InferInput<typeof TagCreateSchema>;

export const TagUpdateSchema = v.partial(TagCreateSchema);

export type TagUpdate = v.InferInput<typeof TagUpdateSchema>;
