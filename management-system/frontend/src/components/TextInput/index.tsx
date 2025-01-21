interface Props {
  id: string;
  type: "text" | "email" | "password";
  isInvalid: boolean;
  placeholder: string;
  value: string | undefined;

  onChange: (value: string) => void;
}

export function TextInput(props: Props) {
  return (
    <input
      type={props.type}
      id={props.id}
      classList={{
        "form-control": true,
        "is-invalid": props.isInvalid,
        "value-undefined": props.value === undefined,
      }}
      placeholder={props.placeholder}
      value={typeof props.value === "string" ? props.value : ""}
      autocomplete={props.type === "password" ? "new-password" : "off"}
      on:change={(e) => props.onChange(e.currentTarget.value)}
    />
  );
}
