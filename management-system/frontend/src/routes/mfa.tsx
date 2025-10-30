import { assertError } from "@door-entry-management-system/common";
import { Button, Card } from "@frontend/components";
import { openAlert } from "@frontend/dialogs";
import { AppService } from "@frontend/services";
import { narrow } from "@frontend/utils";
import { Byte, Encoder } from "@nuintun/qrcode";
import { type RouteSectionProps, useNavigate } from "@solidjs/router";
import { createResource, createSignal, Match, onMount, Show, Switch } from "solid-js";

export function Mfa(props: RouteSectionProps) {
  const navigate = useNavigate();

  const [mfa] = createResource(async () => {
    try {
      return await AppService.get().tRPC.Auth.GetMfaInfo.mutate({});
    } catch (err) {
      assertError(err);
      await openAlert("MFA", err.message);
    }
  });

  const [token, setToken] = createSignal("");

  onMount(async () => {});

  const onQrCode = (img: HTMLImageElement, uri: string) => {
    try {
      const encoder = new Encoder({
        level: "H",
      });

      const qrcode = encoder.encode(new Byte(uri));

      img.src = qrcode.toDataURL();
    } catch (err) {
      console.error(err);
      openAlert("QR Code", "Failed to generate");
    }
  };

  const onConfirmMfaToken = async () => {
    const success = await AppService.get().tRPC.Auth.SendMfaToken.mutate({ token: token() });

    if (success) {
      navigate("/");
    } else {
      await openAlert("MFA", "The token did not match");
    }
  };

  return (
    <main>
      <div class="grid">
        <div class="g-col-12 g-col-md-6 g-start-md-4">
          <Show when={mfa()}>
            {(mfa) => (
              <Card colour="danger">
                <Card.Header text="MFA" />
                <Card.Body>
                  <Switch>
                    <Match when={narrow(mfa, (mfa) => mfa.mode === "challenge")}>
                      {(mfa) => (
                        <>
                          <dl>
                            <dt>Issuer</dt>
                            <dd>{mfa().issuer}</dd>
                            <dt>Label</dt>
                            <dd>{mfa().label}</dd>
                          </dl>

                          <label for="challenge_token">Enter Token To Login</label>
                          <input
                            id="challenge_token"
                            type="text"
                            value={token()}
                            on:keyup={(e) => setToken(e.currentTarget.value)}
                            on:keydown={(e) => e.code === "Enter" && onConfirmMfaToken()}
                          />
                        </>
                      )}
                    </Match>
                    <Match when={narrow(mfa, (mfa) => mfa.mode === "setup")}>
                      {(mfa) => (
                        <>
                          <div>Scan or Click the QR Code</div>

                          <div style={{ "text-align": "center" }}>
                            <a href={mfa()?.uri}>
                              <img style={{ width: "100%" }} ref={(i) => onQrCode(i, mfa().uri)} alt="QR Code" />
                            </a>
                          </div>

                          <label for="confirm_token">Enter Token To Confirm</label>
                          <input
                            id="confirm_token"
                            type="text"
                            value={token()}
                            on:keyup={(e) => setToken(e.currentTarget.value)}
                          />
                        </>
                      )}
                    </Match>
                  </Switch>
                </Card.Body>
                <Card.Footer>
                  <Button colour="primary" on:click={onConfirmMfaToken}>
                    Send
                  </Button>
                </Card.Footer>
              </Card>
            )}
          </Show>
        </div>
      </div>
    </main>
  );
}
