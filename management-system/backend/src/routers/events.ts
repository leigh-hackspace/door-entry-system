import EventEmitter from "node:events";

interface SessionActivity {
  loggedIn: string[];
  fileProgress: string[];
}

export const SessionEvents = new EventEmitter<SessionActivity>();
