export type HomeAssistantCallback = (entityId: string, newState: any) => void;

export class HomeAssistantService {
  private wsUrl: string;
  private accessToken: string;
  private websocket: WebSocket | null = null;
  private isReconnecting: boolean = false;

  public callback: HomeAssistantCallback | null = null;

  constructor(wsUrl: string, accessToken: string) {
    this.wsUrl = wsUrl;
    this.accessToken = accessToken;
  }

  public initialize() {
    this.connect();
  }

  public connect() {
    this.websocket = new WebSocket(this.wsUrl);

    this.websocket.addEventListener("open", () => {
      console.log("WebSocket connection opened to Home Assistant.");
      this.authenticate();
    });

    this.websocket.addEventListener("message", (data) => {
      const message = JSON.parse(data.data);

      if (message.type === "event" && message.event) {
        const entityId = message.event.data.entity_id;
        const newState = message.event.data.new_state;

        if (entityId && this.callback) {
          this.callback(entityId, newState);
        }
      }
    });

    this.websocket.addEventListener("close", () => {
      console.error("WebSocket connection closed. Attempting to reconnect...");
      this.reconnect();
    });

    this.websocket.addEventListener("error", (error) => {
      console.error("WebSocket error:", error);
      this.websocket?.close();
    });
  }

  private authenticate() {
    if (this.websocket) {
      const authMessage = {
        type: "auth",
        access_token: this.accessToken,
      };

      this.websocket.send(JSON.stringify(authMessage));

      this.websocket.addEventListener("message", (data) => {
        const message = JSON.parse(data.data);

        if (message.type === "auth_ok") {
          console.log("WebSocket authenticated successfully.");
          this.subscribeToEvents();
        } else if (message.type === "auth_invalid") {
          console.error("Authentication failed:", message.message);
          this.websocket?.close();
        }
      });
    }
  }

  private subscribeToEvents() {
    if (this.websocket) {
      const subscribeMessage = {
        id: Date.now(),
        type: "subscribe_events",
        event_type: "state_changed",
      };

      this.websocket.send(JSON.stringify(subscribeMessage));
    }
  }

  private reconnect() {
    if (!this.isReconnecting) {
      this.isReconnecting = true;

      setTimeout(() => {
        console.log("Reconnecting to WebSocket...");
        this.isReconnecting = false;
        this.connect();
      }, 5000); // Wait 5 seconds before reconnecting
    }
  }

  public close(): void {
    this.websocket?.close();
  }
}
