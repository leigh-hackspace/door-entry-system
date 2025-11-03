import {
  assertError,
  FieldMetadata,
  formatDate,
  humanise,
  type ScanEvent,
  type UserUpdate,
  UserUpdateSchema,
} from "@door-entry-management-system/common";
import {
  Button,
  Card,
  CursorDefault,
  DateInfo,
  fetchParamsFromCursor,
  MagicBrowser,
  MagicFields,
  type RowData,
  RowDataDefault,
  RowSelectionDefault,
} from "@frontend/components";
import { openAlert, openConfirm } from "@frontend/dialogs";
import { beginPage } from "@frontend/helper";
import type { TagSearchRecord } from "@frontend/services";
import type { RouteSectionProps } from "@solidjs/router";
import { differenceInSeconds, formatDistanceToNow } from "date-fns";
import { createEffect, createResource, createSignal, For, onCleanup, Show, Suspense } from "solid-js";
import * as v from "valibot";

const TagTableSchema = v.object({
  code: v.pipe(v.string(), v.title("Code"), v.metadata(FieldMetadata({ icon: "🔑" }))),
  description: v.pipe(v.string(), v.title("Description"), v.metadata(FieldMetadata({ icon: "✍" }))),
  created: v.pipe(v.date(), v.title("Created"), v.metadata(FieldMetadata({ width: "140px" }))),
  updated: v.pipe(v.date(), v.title("Updated"), v.metadata(FieldMetadata({ width: "140px" }))),
});

export function UserEdit(props: RouteSectionProps) {
  const { tRPC, toastService } = beginPage("admin");

  const id = () => props.params.id;

  const [user, { mutate }] = createResource(() => tRPC.User.OneDetailed.query(id()));
  const [submittedCount, setSubmittedCount] = createSignal(0);
  const [lastScan, setLastScan] = createSignal<ScanEvent>();

  const [rows, setRows] = createSignal<RowData<TagSearchRecord>>(RowDataDefault);
  const [cursor, setCursor] = createSignal(CursorDefault);
  const [search, setSearch] = createSignal("");
  const [selection, setSelection] = createSignal(RowSelectionDefault);

  const scanSubscription = tRPC.ActivityLog.UnknownScans.subscribe(undefined, {
    onData: (scan) => {
      if (differenceInSeconds(Date.now(), scan.time) < 5 * 60) {
        setLastScan(scan);

        console.log("Code detected:", scan.code, formatDistanceToNow(scan.time, { addSuffix: true }));

        toastService.addToastAtTime({
          title: "Scan Detected",
          message: `Code = ${scan.code}`,
          time: scan.time.getTime(),
          life: 5000,
        });
      }
    },
  });

  onCleanup(() => scanSubscription.unsubscribe());

  const onChange = (data: UserUpdate) => mutate({ ...user()!, ...data });

  const onSave = async () => {
    setSubmittedCount(submittedCount() + 1);
    const res = v.parse(UserUpdateSchema, user());

    await tRPC.User.Update.mutate([id(), res]);

    toastService.addToast({ title: "Save", message: "Save successful", life: 5000 });
  };

  const onAddLastScan = async () => {
    await tRPC.Tag.AddCodeToUser.mutate({ code: lastScan()!.code, user_id: id() });
    setLastScan(undefined);

    await fetchUserTags();

    toastService.addToast({ title: "Added Tag", message: "Tag added successfully", life: 5000 });
  };

  const onDeleteTag = async () => {
    const { ids } = selection();

    if (ids.length !== 1) return;

    const res = await openConfirm("Delete tag", `Are you sure you wish to delete ${ids.length} tags`);

    if (res === "yes") {
      await tRPC.Tag.Delete.mutate(ids[0]);

      setSelection(RowSelectionDefault);

      await fetchUserTags();
    }
  };

  const fetchUserTags = async () => {
    const params = fetchParamsFromCursor(cursor());

    try {
      setRows(await tRPC.Tag.Search.query({ ...params, search: search(), user_id: id() }));
    } catch (err) {
      assertError(err);
      await openAlert(`Fetch Error: ${err.name}`, err.message);
    }
  };

  createEffect(fetchUserTags);

  return (
    <main class="grid gap-3" ref={(main) => main.style.setProperty("--grid-rows", main.children.length.toString())}>
      <div class="g-col-12 g-col-xl-6">
        <Card colour="success">
          <Card.Header text="Update User" />
          <Card.Body>
            <form>
              <Suspense fallback="Loading...">
                <Show when={user()}>
                  {(user) => (
                    <div class="d-flex flex-column gap-3">
                      <MagicFields
                        schema={UserUpdateSchema}
                        data={user()}
                        validation={submittedCount() > 0}
                        onChange={onChange}
                      />
                      <DateInfo record={user()} />
                    </div>
                  )}
                </Show>
              </Suspense>
            </form>
          </Card.Body>
          <Card.Footer>
            <Button colour="primary" type="button" on:click={onSave}>
              Save
            </Button>
          </Card.Footer>
        </Card>
      </div>

      <div class="g-col-12 g-col-xl-6">
        <Card colour="success">
          <Card.Header text="Tags" />
          <Card.Body pad={0}>
            <Show
              when={rows().rows.length > 0}
              fallback={<div class="p-2">No tags have been assigned to this user</div>}
            >
              <MagicBrowser
                schema={TagTableSchema}
                rowData={rows()}
                cursor={[cursor, setCursor]}
                selection={[selection, setSelection]}
              />
            </Show>
          </Card.Body>
          <Card.Footer>
            <Show when={lastScan()}>
              {(lastScan) => (
                <Button colour="warning" on:click={onAddLastScan}>
                  Add code "{lastScan().code}" detected {formatDistanceToNow(lastScan().time, { addSuffix: true })}
                </Button>
              )}
            </Show>
            <Show when={selection().ids.length === 1}>
              <Button colour="danger" on:click={() => onDeleteTag()}>
                Delete
              </Button>
            </Show>
          </Card.Footer>
        </Card>
      </div>

      <div class="g-col-12 g-col-xl-6">
        <Card colour="success">
          <Card.Header text="Stats" />
          <Card.Body>
            <Suspense fallback="Loading...">
              <Show when={user()}>
                {(user) => (
                  <div class="d-flex flex-column gap-3">
                    <div>
                      <label class="form-label">GoCardless Customer ID</label>
                      <input class="form-control" readOnly value={user()?.gocardlessCustomerId ?? "[Unknown]"} />
                    </div>

                    <div>
                      <label class="form-label">GoCardless Payments</label>
                      <ol class="list-group">
                        <For each={user().payments}>
                          {(payment) => (
                            <li class="list-group-item">
                              <div>ID: {payment.id}</div>
                              <div>{formatDate(payment.charge_date)}</div>
                              <div>Amount: £{payment.amount}</div>
                              <div>{payment.description}</div>
                              <div>Status: {humanise(payment.status)}</div>
                            </li>
                          )}
                        </For>
                      </ol>
                    </div>
                  </div>
                )}
              </Show>
            </Suspense>
          </Card.Body>
        </Card>
      </div>
    </main>
  );
}
