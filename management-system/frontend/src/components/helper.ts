import { assertError, type EntityType, type FieldMetadata, humanise } from "@door-entry-management-system/common";
import { AlertDialog, openDialog } from "@frontend/dialogs";
import type { ElementOf } from "ts-essentials";
import * as v from "valibot";
import type { SelectOption } from "./Select/index.tsx";

export const Colours = ["primary", "secondary", "success", "danger", "warning", "info"] as const;

export type Colour = ElementOf<typeof Colours>;

export interface QuerySort {
  sort: string;
  dir: "asc" | "desc";
}

export interface FetchParameters {
  skip: number;
  take: number;
  orderBy: (readonly [string, "asc" | "desc"])[];
}

/** Get the closest ancestor that is scrolling this element (overflow/overflow-y) */
export function getScrollingAncestor(el: HTMLElement): HTMLElement | undefined {
  while (el && el.parentElement) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY || style.overflow)) {
      return el;
    }
    el = el.parentElement;
  }
  return undefined;
}

export function debounce<
  TFunc extends (...args: TArgs) => void,
  TArgs extends unknown[],
>(
  callback: TFunc,
  wait: number,
) {
  let lastCallTime = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: TArgs) => {
    const now = Date.now();

    if (now - lastCallTime > wait) {
      // If enough time has passed, call immediately
      lastCallTime = now;
      callback(...args);
    } else {
      // Otherwise, clear existing timeout and set a new one
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        lastCallTime = Date.now();
        callback(...args);
      }, wait);
    }
  };
}

export function normaliseError(err: Error) {
  return err;
}

export function handleAsyncClick(
  handle: (e: MouseEvent | TouchEvent) => Promise<void>,
  setWorking: (working: boolean) => void,
) {
  return async (e: MouseEvent | TouchEvent) => {
    try {
      setWorking(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await handle(e);
    } catch (_err) {
      assertError(_err);

      console.log("Error", _err.constructor.name);
      console.error(_err);

      const err = normaliseError(_err);

      let message = err.message;

      if (err instanceof v.ValiError) {
        message = err.issues.map((i, idx) => `[${idx}] ${i.message}`).join(
          "\n",
        );
      }

      await openDialog(AlertDialog, {
        title: "An error occurred",
        message: "<p>" + message.replaceAll("\n", "</p><p>") + "</p>",
      });

      // alert(message);
    } finally {
      setWorking(false);
    }
  };
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
    (item): item is v.BaseValidation<any, any, any> => item.kind === "validation",
  )?.type;

  const title = propSchema.pipe.find((item): item is v.TitleAction<string, string> => item.type === "title")?.title ?? "???";

  const description = propSchema.pipe.find(
    (item): item is v.DescriptionAction<string, string> => item.type === "description",
  )?.description;

  const metadata = propSchema.pipe.find(
    (item): item is v.MetadataAction<string, FieldMetadata> => item.type === "metadata",
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
