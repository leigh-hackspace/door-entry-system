import type { AppRouter } from "@door-entry-management-system/backend";
import { createTRPCClient, httpBatchLink, httpSubscriptionLink, splitLink, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import superjson from "superjson";

const ApiBaseUrl = getApiBaseUrl();

export function getApiBaseUrl() {
  if (
    globalThis.location.hostname === "localhost" ||
    /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/.test(
      globalThis.location.hostname,
    )
  ) {
    return `http://${globalThis.location.hostname}:${parseInt(globalThis.location.port, 10) - 1}`;
  } else {
    return globalThis.location.origin.replace("://", "://api-");
  }
}

interface TrpcClientOptions {
  getAuthorisation: () => string | undefined;
  onSessionExpired: () => void;
  onMfaRequired: () => void;
}

export function getTrpcClient(options: TrpcClientOptions) {
  return createTRPCClient<AppRouter>({
    links: [
      errorLink({
        onError: (err) => {
          if (err instanceof TRPCClientError) {
            if (
              err.data && "code" in err.data && err.data.code === "UNAUTHORIZED"
            ) {
              if (err.message.includes("MFA")) {
                options.onMfaRequired();
              } else {
                options.onSessionExpired();
              }
            }
          }
        },
      }),
      splitLink({
        condition: (op) => op.type === "subscription",
        false: httpBatchLink({
          url: ApiBaseUrl,
          headers: () => {
            const headers: Record<string, string> = {};

            const authorisation = options.getAuthorisation();

            if (authorisation) {
              headers.Authorization = authorisation;
            }

            return headers;
          },
          transformer: superjson,
        }),
        true: httpSubscriptionLink({
          url: ApiBaseUrl,
          connectionParams: () => {
            const authorisation = options.getAuthorisation();

            if (authorisation) {
              return {
                authorization: authorisation,
              };
            }

            return {};
          },
          transformer: superjson,
        }),
      }),
    ],
  });
}

interface CustomLinkOpts {
  onError: (err: Error) => void;
}

export const errorLink = (opts: CustomLinkOpts): TRPCLink<AppRouter> => () => {
  // here we just got initialized in the app - this happens once per app
  // useful for storing cache for instance
  return ({ next, op }) => {
    // this is when passing the result to the next link
    // each link needs to return an observable which propagates results
    return observable((observer) => {
      // console.log("performing operation:", op);

      const unsubscribe = next(op).subscribe({
        next(value) {
          // console.log("we received value", value);
          observer.next(value);
        },
        error(err) {
          // console.log("we received error", err);
          opts.onError(err);
          observer.error(err);
        },
        complete() {
          observer.complete();
        },
      });

      return unsubscribe;
    });
  };
};
