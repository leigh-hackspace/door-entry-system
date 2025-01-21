import { createSignal } from "npm:solid-js";
import type { SessionUser } from "./common.ts";

interface Session {
  sessionUser: SessionUser;
}

const SessionKey = "om-session";

export class SessionService {
  public session;
  private _setSession;

  constructor() {
    const [session, setSession] = createSignal(this.readSession());

    this.session = session;
    this._setSession = setSession;
  }

  public newSession(sessionUser: SessionUser) {
    this.writeSession({ sessionUser });
  }

  public clearSession() {
    this.writeSession(null);
  }

  private readSession() {
    const json = localStorage.getItem(SessionKey);
    if (!json) return null;
    return JSON.parse(json) as Session;
  }

  private writeSession(session: Session | null) {
    localStorage.setItem(SessionKey, JSON.stringify(session));
    this._setSession(session);
  }
}
