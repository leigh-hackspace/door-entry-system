import { FieldMetadata } from "@door-entry-management-system/common";
import { Card, LinkButton, MagicBrowser, refreshAllBrowsers } from "@frontend/components";
import { openConfirm } from "@frontend/dialogs";
import { beginPage } from "@frontend/helper";
import type { DeviceSearchRecord, FetchParameters } from "@frontend/lib";
import type { RouteSectionProps } from "npm:@solidjs/router";
import * as v from "npm:valibot";

const DeviceTableSchema = v.object({
  name: v.pipe(v.string(), v.title("Name"), v.metadata(FieldMetadata({ icon: "N" }))),
  ip_address: v.pipe(v.string(), v.title("IP Address"), v.metadata(FieldMetadata({ icon: "IP" }))),
  created: v.pipe(v.date(), v.title("Created"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
  updated: v.pipe(v.date(), v.title("Updated"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
});

export function Devices(props: RouteSectionProps) {
  const { navigate, tRPC } = beginPage(["admin", "user"]);

  const onFetch = async (params: FetchParameters) => {
    return tRPC.Device.Search.query(params);
  };

  const onDelete = async (row: DeviceSearchRecord) => {
    const res = await openConfirm("Delete device", `Are you sure you wish to delete "${row.name}"`);

    if (res === "yes") {
      await tRPC.Device.Delete.mutate(row.id);
      refreshAllBrowsers();
    }
  };

  return (
    <main>
      <Card colour="info">
        <Card.Header text="📟 Devices" />
        <Card.Body>
          <MagicBrowser
            schema={DeviceTableSchema}
            rowActions={[
              { name: "Edit", colour: "info", onClick: (row) => navigate(`/devices/${row.id}`) },
              { name: "Delete", colour: "danger", onClick: onDelete },
            ]}
            onFetch={onFetch}
          />
        </Card.Body>
        <Card.Footer>
          <LinkButton colour="info" href="/devices/new">
            New
          </LinkButton>
        </Card.Footer>
      </Card>
    </main>
  );
}
