import EventEmitter from "node:events";

interface SessionActivity {
  loggedIn: string[];
}

export const SessionEvents = new EventEmitter<SessionActivity>();
