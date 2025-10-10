/* IMPORTANT
 * This snapshot file is auto-generated, but designed for humans.
 * It should be checked into source control and tracked carefully.
 * Re-generate by setting TAP_SNAPSHOT=1 and running tests.
 * Make sure to inspect the output below.  Do not ignore changes!
 */
'use strict'
exports[`src/service/callback/vendor/slack.test.ts > TAP > command handling > must match snapshot 1`] = `
Object {
  "blocks": Array [
    Object {
      "text": Object {
        "text": "use <https://foo/system/database-snapshot?voucher=bT0wYauOeLe5Gx3snU3L-3nftJWUbkWngAXFx8ntdUA%7CeyJwdXJwb3NlIjoiZGF0YWJhc2Utc25hcHNob3QiLCJjcmVhdGVkQXQiOjE3NjAwMDU2NjV9|this link> to download a database snapshot (it expires quickly!)",
        "type": "mrkdwn",
      },
      "type": "section",
    },
  ],
  "response_type": "ephemeral",
}
`

exports[`src/service/callback/vendor/slack.test.ts > TAP > command handling > must match snapshot 2`] = `
Object {
  "blocks": Array [
    Object {
      "text": Object {
        "text": "unknown command 😔",
        "type": "mrkdwn",
      },
      "type": "section",
    },
  ],
  "response_type": "ephemeral",
}
`
