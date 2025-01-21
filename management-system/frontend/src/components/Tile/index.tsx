// import "./style.scss";

interface Props {
  number: number;
  text: string;
  colour: string;
  class?: string;
  href: string;
}

export function Tile(props: Props) {
  return (
    <a class={`tile ${props.class}`} style={{ background: `var(--bs-${props.colour}` }} href={props.href}>
      <div class="tile-number">{props.number}</div>
      <div class="tile-text">{props.text}</div>
    </a>
  );
}
