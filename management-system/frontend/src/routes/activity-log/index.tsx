import { Card, MagicBrowser } from "@frontend/components";
import { beginPage } from "@frontend/helper";
import type { FetchParameters } from "@frontend/lib";
import type { RouteSectionProps } from "npm:@solidjs/router";
import * as v from "npm:valibot";
import { FieldMetadata } from "../../../../common/src/common.ts";

const ActivityLogTableSchema = v.object({
  code: v.pipe(v.string(), v.title("Code"), v.metadata(FieldMetadata({ icon: "🔑" }))),
  action: v.pipe(v.string(), v.title("Action"), v.metadata(FieldMetadata({ icon: "🔘" }))),
  user_name: v.nullable(v.pipe(v.string(), v.title("User Name"), v.metadata(FieldMetadata({ icon: "👤" })))),
  created: v.pipe(v.date(), v.title("Created"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
});

export function ActivityLogs(props: RouteSectionProps) {
  const { tRPC } = beginPage(["admin", "user"]);

  const onFetch = async (params: FetchParameters) => {
    return tRPC.ActivityLog.Search.query(params);
  };

  return (
    <main>
      <Card colour="primary">
        <Card.Header text="🪵 Activity Logs" />
        <Card.Body>
          <MagicBrowser
            schema={ActivityLogTableSchema}
            initialSort={{ sort: "created", dir: "desc" }}
            onFetch={onFetch}
          />
        </Card.Body>
      </Card>
    </main>
  );
}
