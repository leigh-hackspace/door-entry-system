import type { EntityType } from "@door-entry-management-system/common";
import { openBrowser } from "@frontend/dialogs";
import { AppService } from "@frontend/lib";
import { createEffect, createResource } from "solid-js";
import { assert } from "ts-essentials";

interface Props {
  id: string;
  isInvalid: boolean;
  placeholder: string;
  entityType: EntityType;
  value: string | undefined;

  onChange: (value: string | null) => void;
}

export function LookupInput(props: Props) {
  const { lookupService } = AppService.get();

  createEffect(() => {
    if (props.value === undefined) mutate(undefined);
  }, [props.value]);

  const [name, { mutate }] = createResource(async () => {
    if (props.value === undefined) return;
    assert(typeof props.value === "string", "LookupInput value must be a string!");

    const record = await lookupService.getOne(props.entityType, props.value);
    return lookupService.getName(props.entityType, record);
  });

  const onOpenLookup = async () => {
    const row = await openBrowser(
      `Select ${props.entityType}`,
      lookupService.getLookupTableSchema(props.entityType),
      (fetchParameters) => lookupService.getMany(props.entityType, fetchParameters),
    );

    if (row) {
      mutate(lookupService.getName(props.entityType, row));
      props.onChange(row.id);
    } else if (row === null) {
      mutate("[null]");
      props.onChange(null);
    }
  };

  return (
    <input
      readonly
      type="text"
      id={props.id}
      classList={{
        "form-control": true,
        "is-invalid": props.isInvalid,
        "value-undefined": props.value === undefined,
      }}
      style={{ cursor: "pointer" }}
      placeholder={props.placeholder}
      value={typeof name() === "string" ? name() : ""}
      on:change={(e) => props.onChange(e.currentTarget.value)}
      on:click={onOpenLookup}
    />
  );
}
