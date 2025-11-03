import { format } from "date-fns";
import { enGB } from "date-fns/locale";

export function formatDateTime(date: Date) {
  return format(date, "PPp", { locale: enGB });
}

export function formatDate(date: Date) {
  return format(date, "P", { locale: enGB });
}

/*
2016-04-14T10:10:11Z
2016-04-14T10:10:11.123Z
*/
export const IsoDateDb = /^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(|.\d{3})(?:Z)$/;
