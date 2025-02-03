/* eslint-disable @typescript-eslint/no-explicit-any */
import { getFieldInfo } from "@frontend/lib";
import { For } from "npm:solid-js";
import * as v from "npm:valibot";
import { FormFields } from "../FormFields/index.tsx";
import { LookupInput } from "../LookupInput/index.tsx";
import { Select } from "../Select/index.tsx";
import { TextInput } from "../TextInput/index.tsx";

interface Props<TSchema extends v.ObjectSchema<any, any>, TData extends v.InferInput<TSchema>> {
  schema: TSchema;
  data: TData;
  validation: boolean;

  onChange: (data: TData) => void;
}

export function MagicFields<
  TSchema extends v.ObjectSchema<any, any>,
  TData extends v.InferInput<v.SchemaWithPartial<TSchema, undefined>>
>(props: Props<TSchema, TData>) {
  const fieldsNames = Object.keys(props.schema.entries) as unknown as readonly Extract<keyof TData, string>[];

  const getValidationMessages = (fieldName: keyof TData) => {
    if (!props.validation) return [];

    const validation = v.safeParse(props.schema, props.data);
    const issues = validation.issues?.filter((i): i is v.BaseIssue<any> => "path" in i && "message" in i);

    return issues?.filter((i) => i.path?.length === 1 && i.path[0].key === fieldName).map((i) => i.message) ?? [];
  };

  const onFieldChange = (fieldName: Extract<keyof TData, string>, value: string | undefined | null) => {
    props.onChange({
      ...props.data,
      [fieldName]: value,
    });
  };

  return (
    <FormFields>
      <For each={fieldsNames}>
        {(fieldName) => {
          const { metadata, title, inputType, options, description, entityType } = getFieldInfo(
            props.schema,
            fieldName
          );

          const value = () => props.data[fieldName];

          return (
            <FormFields.Field
              id={fieldName}
              title={title}
              description={description}
              icon={metadata?.icon}
              messages={getValidationMessages(fieldName)}
            >
              {inputType === "text" || inputType === "email" || inputType === "password" ? (
                <TextInput
                  type={inputType}
                  id={fieldName}
                  isInvalid={getValidationMessages(fieldName).length > 0}
                  placeholder={title}
                  value={typeof value() === "string" ? value() : undefined}
                  onChange={(v) => onFieldChange(fieldName, v)}
                />
              ) : inputType === "select" ? (
                <Select
                  id={fieldName}
                  isInvalid={getValidationMessages(fieldName).length > 0}
                  placeholder={title}
                  value={value()}
                  options={options}
                  allowNull={true}
                  onChange={(v) => onFieldChange(fieldName, v)}
                />
              ) : inputType === "lookup" ? (
                <LookupInput
                  id={fieldName}
                  isInvalid={getValidationMessages(fieldName).length > 0}
                  placeholder={title}
                  entityType={entityType!}
                  value={typeof value() === "string" ? value() : undefined}
                  onChange={(v) => onFieldChange(fieldName, v)}
                />
              ) : (
                inputType
              )}
            </FormFields.Field>
          );
        }}
      </For>
    </FormFields>
  );
}
