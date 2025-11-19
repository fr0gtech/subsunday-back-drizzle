import { db } from "../src/db";
import { user, vote } from "../src/db/schema";
import { desc, eq, gte } from "drizzle-orm";
import { getDateRange, increment } from "../src/lib";
import { isBefore, isWithinInterval } from "date-fns";

(async () => {
  // we check after each end of period
  // for each user on a streak we check if voted that period if not we 
  // put back streak to 0
  // we have a calc streak script to re-calc streaks
  // this should only run when its after end of period, like 1min after
  const currentPeriod = getDateRange()
  const users = await db.query.user.findMany({
    with: {
      votes: true,
    }
  });

  for (const userWithStreak of users) {
    // now we go over user reset streak if needed
    // we should maybe have another script to fully recalc streak just to run once when migrating to this version

    // we loop over each vote and keep track how many we can go back and not break streak

    let streak = 0
    let currentPeriodTemp = currentPeriod
    let brokeStreak = false
    for (const voteToCalc of userWithStreak.votes.reverse()) { // reverse so newest vote is first
      if (brokeStreak) break;
      if (isWithinInterval(voteToCalc.createdAt, { // check if in range
        start: currentPeriodTemp.currentPeriod.startDate,
        end: currentPeriodTemp.currentPeriod.endDate
      })) {
        // if we increment we also set a new period to check for next
        currentPeriodTemp = getDateRange({ offset: currentPeriodTemp.lastPeriod.startDate })
        streak++
      } else {
        brokeStreak = true
      }
    }
    console.log(`${userWithStreak.name} old:${userWithStreak.streak} new:${streak}`);

    await db.update(user).set({
      streak: streak
    })
      .where(eq(user.id, userWithStreak.id));
  }
})()