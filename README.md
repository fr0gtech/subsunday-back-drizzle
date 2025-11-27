# Sub Sunday Backend (drizzle)

This is the backend of [sub-sunday.com](https://sub-sunday.com/). This reads chat via IRC and saves votes. It includes the [socket.io](http://socket.io) logic for realtime updates. `streak.ts` is ran from crontab every sunday at 22:01 to check for streaks.

## Voting period

`Sunday(00:00) - Saturday (22:00)` `GMT-4` `America/New_York`

## Setup

Votes can fully be build from `buildVotes.ts` as long as the API used is available.
The timestamps there are in GMT+0 timezone so we convert them to America/New_York before inserting into db

Set servers Timezone to: America/New_York `sudo timedatectl set-timezone America/New_York`
Generate Drizzle schema: `bunx drizzle-kit generate`
Push schema to DB: `bunx drizzle-kit push`
## Setup crontab

`01 22 * * SAT cd /opt/subsunday-back/ && /home/subsunday/.bun/bin/bun scripts/streak.ts`

## Frontend
The Frontend can be found [here](https://github.com/fr0gtech/subsunday-front)

## Features

- Realtime updates with [socket.io](https://socket.io/)
- IRC Twitch reader
- Match vote to steam game

## Development

Check .env file

*requirements*:

- Bun.js
- postgresql
1. `bun install`
2. `bun src/index.ts`

## Seeding

For development purposes we have a `seed.ts` file to create fake votes

`bun src/seed.ts`