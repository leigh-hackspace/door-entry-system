import * as v from "valibot";
import { Config } from "@/config";

export class AuthentikService {
  public async getTokenWithAuthenticationCode(code: string, return_auth: string) {
    const form = new URLSearchParams();

    form.set("client_id", Config.DE_AUTHENTIK_CLIENT_ID);
    form.set("client_secret", Config.DE_AUTHENTIK_CLIENT_SECRET);
    form.set("grant_type", "authorization_code");
    form.set("code", code);
    form.set("redirect_uri", return_auth);

    const res = await fetch(`https://${Config.DE_AUTHENTIK_HOST}/application/o/token/`, {
      method: "POST",
      headers: [["Content-Type", "application/x-www-form-urlencoded"]],
      body: form.toString(),
    });

    if (res.status !== 200) {
      console.error("getTokenWithAuthenticationCode:", await res.text());
      throw new Error("Error getting token");
    }

    return v.parse(TokenResponseSchema, await res.json());
  }

  public async getTokenWithRefreshToken(refresh_token: string) {
    const form = new URLSearchParams();

    form.set("client_id", Config.DE_AUTHENTIK_CLIENT_ID);
    form.set("client_secret", Config.DE_AUTHENTIK_CLIENT_SECRET);
    form.set("grant_type", "refresh_token");
    form.set("refresh_token", refresh_token);

    const res = await fetch(`https://${Config.DE_AUTHENTIK_HOST}/application/o/token/`, {
      method: "POST",
      headers: [["Content-Type", "application/x-www-form-urlencoded"]],
      body: form.toString(),
    });

    if (res.status !== 200) {
      console.error("getTokenWithRefreshToken:", await res.text());
      throw new Error("Error getting token");
    }

    const json = await res.json();
    return v.parse(TokenResponseSchema, json);
  }

  public async getAllUsers() {
    const userRes = await fetch(`https://${Config.DE_AUTHENTIK_HOST}/api/v3/core/users/`, {
      method: "GET",
      headers: [
        ["Accept", "application/json"],
        ["Authorization", `Bearer ${Config.DE_AUTHENTIK_API_TOKEN}`],
      ],
    });

    if (userRes.status !== 200) {
      console.error("getAllUsers:", await userRes.text());
      throw new Error("Error getting user info");
    }

    const json = await userRes.json();
    return v.parse(makePaginatedResponseSchema(UserCoreResponseSchema), json);
  }
}

export class AuthentikUserClient {
  constructor(private access_token: string) {}

  public async getUserInfo() {
    const userRes = await fetch(`https://${Config.DE_AUTHENTIK_HOST}/application/o/userinfo/`, {
      method: "POST",
      headers: [
        ["Accept", "application/json"],
        ["Authorization", `Bearer ${this.access_token}`],
      ],
    });

    if (userRes.status !== 200) {
      console.error("getUserInfo:", await userRes.text());
      throw new Error("Error getting user info");
    }

    const json = await userRes.json();
    return v.parse(UserInfoResponseSchema, json);
  }
}

const TokenResponseSchema = v.object({
  access_token: v.string(),
  refresh_token: v.string(),
});

const Pagination = v.object({
  next: v.number(),
  previous: v.number(),
  count: v.number(),
  current: v.number(),
  total_pages: v.number(),
  start_index: v.number(),
  end_index: v.number(),
});

const makePaginatedResponseSchema = <TResult extends v.ObjectSchema<any, any>>(result: TResult) => {
  return v.object({
    pagination: Pagination,
    results: v.array(result),
  });
};

const UserInfoResponseSchema = v.object({
  sub: v.string(), // Same as "uid"
  email: v.pipe(v.string(), v.email()),
  name: v.string(),
  preferred_username: v.string(),
  groups: v.array(v.string()),
});

// #region Example
/*
{
  sub: "9ee348c487719807246b620ba697b87e2514767fee09f0d98564a70d85715a6a",
  sid: "2a37ecc0557cfab81bf2a090279770e2736335718435e6ab79bc67b047d6ada3",
  ak_proxy: {
    user_attributes: {
      "leighhack.org/door_access_uid": [ "97-40-8D-4C" ],
      "leighhack.org/gocardless-customer-id": "CU002KH8C5NKNZ"
    },
    is_superuser: true
  },
  email: "cjdell@gmail.com",
  email_verified: true,
  name: "Christopher Dell",
  given_name: "Christopher Dell",
  preferred_username: "cjdell",
  nickname: "cjdell",
  groups: [ "Public", "Infra", "Members" ]
}
*/
// #endregion

const UserCoreResponseSchema = v.object({
  pk: v.number(),
  username: v.string(),
  name: v.string(),
  is_active: v.boolean(),
  is_superuser: v.boolean(),
  groups: v.array(v.string()),
  groups_obj: v.array(v.object({ name: v.string() })),
  email: v.union([v.pipe(v.string(), v.email()), v.literal("")]), // Allow empty string as well
  avatar: v.string(),
  attributes: v.partial(
    v.object({
      "leighhack.org/gocardless-customer-id": v.string(),
    }),
  ),
  uid: v.string(), // Same as "sub"
  path: v.string(),
  uuid: v.pipe(v.string(), v.uuid()),
});

// #region Example
/*
{
  "pk": 13,
  "username": "cjdell",
  "name": "Christopher Dell",
  "is_active": true,
  "last_login": "2025-03-06T09:55:20.328500Z",
  "is_superuser": true,
  "groups": [
    "b5cb41c7-affd-46e7-bdcc-55face77016c",
    "811840ba-2a9f-4622-bb83-0976664a91a5",
    "5e4d061d-b04b-40a3-ba80-f6f1fcf90640"
  ],
  "groups_obj": [
    {
      "pk": "b5cb41c7-affd-46e7-bdcc-55face77016c",
      "num_pk": 24164,
      "name": "Public",
      "is_superuser": false,
      "parent": null,
      "attributes": {}
    },
    {
      "pk": "811840ba-2a9f-4622-bb83-0976664a91a5",
      "num_pk": 17159,
      "name": "Infra",
      "is_superuser": true,
      "parent": "5e4d061d-b04b-40a3-ba80-f6f1fcf90640",
      "parent_name": "Members",
      "attributes": {}
    },
    {
      "pk": "5e4d061d-b04b-40a3-ba80-f6f1fcf90640",
      "num_pk": 12534,
      "name": "Members",
      "is_superuser": false,
      "parent": "b5cb41c7-affd-46e7-bdcc-55face77016c",
      "parent_name": "Public",
      "attributes": {}
    }
  ],
  "email": "cjdell@gmail.com",
  "avatar": "https://secure.gravatar.com/avatar/bd98562c25382afcc7bf4ba5a05b92e0?size=158&rating=g&default=404",
  "attributes": {
    "leighhack.org/door_access_uid": [
      "97-40-8D-4C"
    ],
    "leighhack.org/gocardless-customer-id": "CU002KH8C5NKNZ"
  },
  "uid": "9ee348c487719807246b620ba697b87e2514767fee09f0d98564a70d85715a6a",
  "path": "users",
  "type": "internal",
  "uuid": "9c5afb72-c99a-4a91-b08f-a141a5d4a9f1"
}
*/
// #endregion
