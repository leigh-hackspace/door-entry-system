import { type UserUpdate, UserUpdateSchema } from "@door-entry-management-system/common";
import { Button, Card, DateInfo, MagicFields } from "@frontend/components";
import { beginPage } from "@frontend/helper";
import type { RouteSectionProps } from "npm:@solidjs/router";
import { createResource, createSignal, Show, Suspense } from "npm:solid-js";
import * as v from "npm:valibot";

export function UserEdit(props: RouteSectionProps) {
  const { tRPC, toastService } = beginPage("admin");

  const id = () => props.params.id;

  const [user, { mutate }] = createResource(() => tRPC.User.One.query(props.params.id));
  const [submittedCount, setSubmittedCount] = createSignal(0);

  const onChange = (data: UserUpdate) => mutate({ ...user()!, ...data });

  const onSave = async () => {
    setSubmittedCount(submittedCount() + 1);
    const res = v.parse(UserUpdateSchema, user());

    await tRPC.User.Update.mutate([id(), res]);

    toastService.addToast({ title: "Save", message: "Save successful", life: 5000 });
  };

  return (
    <main class="grid gap-3">
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
