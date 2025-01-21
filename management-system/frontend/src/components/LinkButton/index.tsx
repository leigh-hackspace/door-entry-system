import { Colour } from "@frontend/lib";
import { useNavigate } from "npm:@solidjs/router";
import { JSX } from "npm:solid-js";

type LinkOrActionProps = { href: string };

type Props = JSX.HTMLElementTags["button"] &
  LinkOrActionProps & {
    colour: Colour;
  };

export function LinkButton({ classList, colour, ...props }: Props) {
  const navigate = useNavigate();

  const onClick = async (e: MouseEvent) => {
    navigate(props.href);
  };

  return <button {...props} classList={{ ...classList, btn: true, ["btn-" + colour]: true }} on:click={onClick} />;
}
