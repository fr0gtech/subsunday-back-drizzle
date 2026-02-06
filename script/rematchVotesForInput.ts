/**
 * @description This script updates all votes from arg1 to id from arg2
 */

import { db } from "../src/db";
import { vote } from "../src/db/schema";
import { eq } from "drizzle-orm";

const args = process.argv.slice(2);

const input = args[0];
const toGameId = parseInt(args[1] as any);

(async () => {

  if (!input || !toGameId) {
    throw new Error("not both args provided")
  }

  await db.update(vote).set({
    forId: toGameId
  }).where(eq(vote.voteText, input))

})();