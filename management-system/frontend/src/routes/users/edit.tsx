import { assertError, FieldMetadata, type UserUpdate, UserUpdateSchema } from "@door-entry-management-system/common";
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
import { beginPage } from "@frontend/helper";
import type { RouteSectionProps } from "@solidjs/router";
import { createEffect, createResource, createSignal, Show, Suspense } from "solid-js";
import * as v from "valibot";
import type { TagSearchRecord } from "../../lib/types.ts";
import { openAlert } from "@frontend/dialogs";

const TagTableSchema = v.object({
  code: v.pipe(v.string(), v.title("Code"), v.metadata(FieldMetadata({ icon: "🔑" }))),
  description: v.pipe(v.string(), v.title("Description"), v.metadata(FieldMetadata({ icon: "✍" }))),
  created: v.pipe(v.date(), v.title("Created"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
  updated: v.pipe(v.date(), v.title("Updated"), v.metadata(FieldMetadata({ displayMode: "raw" }))),
});

export function UserEdit(props: RouteSectionProps) {
  const { tRPC, toastService } = beginPage("admin");

  const id = () => props.params.id;

  const [user, { mutate }] = createResource(() => tRPC.User.One.query(id()));
  const [submittedCount, setSubmittedCount] = createSignal(0);

  const [rows, setRows] = createSignal<RowData<TagSearchRecord>>(RowDataDefault);

  const cursorSignal = createSignal(CursorDefault);
  const searchSignal = createSignal("");
  const selectionSignal = createSignal(RowSelectionDefault);

  const onChange = (data: UserUpdate) => mutate({ ...user()!, ...data });

  const onSave = async () => {
    setSubmittedCount(submittedCount() + 1);
    const res = v.parse(UserUpdateSchema, user());

    await tRPC.User.Update.mutate([id(), res]);

    toastService.addToast({ title: "Save", message: "Save successful", life: 5000 });
  };

  const fetchRows = async () => {
    const cursor = cursorSignal[0]();
    const params = fetchParamsFromCursor(cursor);

    try {
      setRows(await tRPC.Tag.Search.query({ ...params, search: searchSignal[0](), user_id: id() }));
    } catch (err) {
      assertError(err);
      await openAlert(`Fetch Error: ${err.name}`, err.message);
    }
  };

  createEffect(fetchRows);

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
            <Show when={rows().rows.length > 0} fallback={<div class="p-2">No tags have been assigned to this user</div>}>
              <MagicBrowser
                schema={TagTableSchema}
                rowData={rows()}
                cursor={cursorSignal}
                selection={selectionSignal}
              />
            </Show>
          </Card.Body>
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
                      <input class="form-control" readOnly value={user()?.gocardless_customer_id ?? "[Unknown]"} />
                    </div>

                    <div>
                      <label class="form-label">GoCardless Payments</label>
                      <ol class="list-group">
                        {user().payments?.map((payment) => (
                          <li class="list-group-item">
                            <div>ID: {payment.id}</div>
                            <div>{payment.charge_date}</div>
                            <div>
                              Amount: {parseInt(payment.amount, 10) / 100} {payment.currency}
                            </div>
                            <div>{payment.description}</div>
                            <div>Status: {payment.status}</div>
                          </li>
                        ))}
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
