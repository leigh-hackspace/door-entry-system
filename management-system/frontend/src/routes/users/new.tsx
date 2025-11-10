import { type UserCreate, UserCreateSchema } from "@door-entry-management-system/common";
import { Button, Card, MagicFields } from "@frontend/components";
import { beginPage } from "@frontend/helper";
import type { RouteSectionProps } from "@solidjs/router";
import { createSignal } from "solid-js";
import * as v from "valibot";

export function UserNew(props: RouteSectionProps) {
  const { navigate, tRPC, toastService } = beginPage("admin");

  const [user, setUser] = createSignal<Partial<UserCreate>>({});
  const [submittedCount, setSubmittedCount] = createSignal(0);

  const onChange = (data: Partial<UserCreate>) => {
    setUser({ ...user(), ...data });
  };

  const onSave = async () => {
    setSubmittedCount(submittedCount() + 1);
    const res = v.parse(UserCreateSchema, user());

    const id = await tRPC.User.create.mutate(res);

    toastService.addToast({ title: "Save", message: "Save successful", life: 5000 });
    navigate(`/users/${id}`);
  };

  return (
    <main>
      <Card colour="success">
        <Card.Header text="Create User" />
        <Card.Body>
          <form>
            <MagicFields
              schema={UserCreateSchema}
              data={user()}
              validation={submittedCount() > 0}
              onChange={onChange}
            />
          </form>
        </Card.Body>
        <Card.Footer>
          <Button colour="primary" type="button" on:click={onSave}>
            Save
          </Button>
        </Card.Footer>
      </Card>
    </main>
  );
}
