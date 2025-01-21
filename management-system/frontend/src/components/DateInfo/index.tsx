import { format, formatDistanceToNow } from "npm:date-fns";
import { enGB } from "npm:date-fns/locale";

interface Props {
  record: { created: Date; updated: Date };
}

export function DateInfo(props: Props) {
  return (
    <div>
      <div class="grid">
        <div class="g-col-12 g-col-md-6">
          <div>Created: {format(props.record.created, "PPp", { locale: enGB })}</div>
          <div class="badge text-bg-secondary">{formatDistanceToNow(props.record.created, { addSuffix: true })}</div>
        </div>
        <div class="g-col-12 g-col-md-6">
          <div>Updated: {format(props.record.updated, "PPp", { locale: enGB })}</div>
          <div class="badge text-bg-secondary">{formatDistanceToNow(props.record.updated, { addSuffix: true })}</div>
        </div>
      </div>
    </div>
  );
}
