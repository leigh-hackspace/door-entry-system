// deno-lint-ignore-file no-explicit-any
import { type EntityType, type FieldMetadata, humanise } from "@door-entry-management-system/common";
import type { SelectOption } from "@frontend/components";
import type { ElementOf } from "npm:ts-essentials";
import type * as v from "npm:valibot";

export interface SessionUser {
  id: string;
  role: "admin" | "user";
  name: string;
  email: string;
  sessionToken: string;
}

export interface QuerySort {
  sort: string;
  dir: "asc" | "desc";
}

export interface FetchParameters {
  skip: number;
  take: number;
  search: string;
  orderBy: (readonly [string, "asc" | "desc"])[];
}

export interface FetchResult<TRow> {
  rows: readonly TRow[];
  total: number;
}

export function normaliseError(err: Error) {
  // if (err instanceof AxiosError) {
  //   if (err.response?.data.message) {
  //     const newErr = new Error(err.response?.data.message);
  //     return newErr;
  //   }
  // }

  return err;
}

export const Colours = ["primary", "secondary", "success", "danger", "warning", "info"] as const;

export type Colour = ElementOf<typeof Colours>;

export function bindMethods(that: any) {
  Object.getOwnPropertyNames(Object.getPrototypeOf(that))
    .filter((prop) => typeof that[prop] === "function" && prop !== "constructor")
    .forEach((method) => (that[method] = that[method].bind(that)));
}

export function getFieldInfo(formSchema: v.ObjectSchema<any, any>, fieldName: string) {
  const maybePropSchema = formSchema.entries[fieldName] as
    | v.NullableSchema<any, any>
    | v.SchemaWithPipe<Array<any> & [any]>;

  let propSchema = maybePropSchema;

  let nullable = false;
  let optional = false;

  // Keep unwrapping until we have the actual schema...
  while ("wrapped" in propSchema) {
    if ("type" in propSchema) {
      if (propSchema.type === "nullable") {
        nullable = true;
      }

      if (propSchema.type === "optional") {
        optional = true;
      }
    }

    propSchema = propSchema.wrapped as v.SchemaWithPipe<Array<any> & [any]>;
  }

  const vSchema = propSchema.pipe.find((item): item is v.BaseSchema<any, any, any> => item.kind === "schema");

  const type = vSchema?.type;

  const validationType = propSchema.pipe.find(
    (item): item is v.BaseValidation<any, any, any> => item.kind === "validation"
  )?.type;

  const title =
    propSchema.pipe.find((item): item is v.TitleAction<string, string> => item.type === "title")?.title ?? "???";

  const description = propSchema.pipe.find(
    (item): item is v.DescriptionAction<string, string> => item.type === "description"
  )?.description;

  const metadata = propSchema.pipe.find(
    (item): item is v.MetadataAction<string, FieldMetadata> => item.type === "metadata"
  )?.metadata;

  let inputType: "text" | "select" | "email" | "password" | "lookup" | "textarea" = "text";

  let options: SelectOption[] = [];

  let entityType: EntityType | undefined;

  if (metadata?.lookup) {
    inputType = "lookup";
    entityType = metadata.lookup;
  } else if (type === "picklist") {
    inputType = "select";

    options = (vSchema as v.PicklistSchema<any, any>).options.map((o: string) => ({
      value: o,
      text: humanise(o),
    }));
  } else {
    if (validationType === "email") {
      inputType = "email";
    }
    if (title.toLowerCase().includes("password")) {
      inputType = "password";
    }
  }

  if (metadata?.text) {
    inputType = "textarea";
  }

  return { metadata, title, inputType, options, description, entityType, nullable, optional };
}
