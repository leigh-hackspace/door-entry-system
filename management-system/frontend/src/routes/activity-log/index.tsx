import { Card, MagicBrowser } from "@frontend/components";
import { beginPage } from "@frontend/helper";
import type { FetchParameters } from "@frontend/lib";
import type { RouteSectionProps } from "npm:@solidjs/router";
import * as v from "npm:valibot";

const ActivityLogTableSchema = v.object({
  code: v.pipe(v.string(), v.title("Code")),
  action: v.pipe(v.string(), v.title("Action")),
  user_name: v.nullable(v.pipe(v.string(), v.title("User Name"))),
  created: v.pipe(v.date(), v.title("Created")),
});

export function ActivityLogs(props: RouteSectionProps) {
  const { navigate, tRPC } = beginPage("admin");

  const onFetch = async (params: FetchParameters) => {
    return tRPC.ActivityLog.Search.query(params);
  };

  return (
    <main>
      <Card colour="primary">
        <Card.Header text="Activity Logs" />
        <Card.Body>
          <MagicBrowser
            schema={ActivityLogTableSchema}
            // rowActions={[{ name: "Edit", colour: "info", onClick: (e) => navigate(`/activity-log/${e.id}`) }]}
            onFetch={onFetch}
          />
        </Card.Body>
        <Card.Footer>&nbsp;</Card.Footer>
      </Card>
    </main>
  );
}
