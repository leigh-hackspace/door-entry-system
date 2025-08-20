import { Card } from "@frontend/components";
import { AppService, getAuthReturnUrl } from "@frontend/lib";
import { type RouteSectionProps, useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";

export function AuthReturn(props: RouteSectionProps) {
  const navigate = useNavigate();

  onMount(async () => {
    const url = new URL(globalThis.location.href);

    const code = url.searchParams.get("code") as string;

    const res = await AppService.get().tRPC.Auth.CompleteOAuth.mutate({
      code,
      return_auth: getAuthReturnUrl(),
    });

    AppService.get().loginExternal(res.user, res.token);

    navigate("/");
  });

  return (
    <main>
      <div class="grid">
        <div class="g-col-12 g-col-md-6 g-start-md-4">
          <Card colour="danger">
            <Card.Header text="Please wait" />
            <Card.Body>Authorisation in progress...</Card.Body>
          </Card>
        </div>
      </div>
    </main>
  );
}
