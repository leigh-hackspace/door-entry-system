import { assertError } from "@door-entry-management-system/common";
import { AlertDialog, openDialog } from "@frontend/dialogs";
import { type Colour, normaliseError } from "@frontend/lib";
import { createSignal, type JSX } from "npm:solid-js";
import * as v from "npm:valibot";

type LinkOrActionProps = { "on:click": Exclude<JSX.HTMLElementTags["button"]["on:click"], undefined> };

type Props = JSX.HTMLElementTags["button"] &
  LinkOrActionProps & {
    colour: Colour;
  };

export function Button(props: Props) {
  // const navigate = useNavigate();
  const [working, setWorking] = createSignal(false);

  const onClick = async (e: MouseEvent) => {
    try {
      setWorking(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (props["on:click"] as any)(e);
    } catch (_err) {
      assertError(_err);

      console.log("Error", _err.constructor.name);
      console.error(_err);

      const err = normaliseError(_err);

      let message = err.message;

      if (err instanceof v.ValiError) {
        message = err.issues.map((i, idx) => `[${idx}] ${i.message}`).join("\n");
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

  return (
    <button
      {...props}
      classList={{ ...props.classList, btn: true, ["btn-" + props.colour]: true }}
      disabled={props.disabled || working()}
      on:click={onClick}
    />
  );
}
