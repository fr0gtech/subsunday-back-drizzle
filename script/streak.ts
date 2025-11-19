import { db } from "../src/db";
import { user, vote } from "../src/db/schema";
import { eq, gte } from "drizzle-orm";
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
    },
    where: gte(user.streak, 1),
  });

  for (const userWithStreak of users) {
    // now we go over user reset streak if needed
    // we should maybe have another script to fully recalc streak just to run once when migrating to this version
    const lastVote = userWithStreak.votes[userWithStreak.votes.length - 1]
    if (!lastVote) return
    if (isWithinInterval(lastVote.createdAt, { start: currentPeriod.currentPeriod.startDate, end: currentPeriod.currentPeriod.endDate })) {
      await db.update(user).set({
        streak: increment(user.streak)
      })
      .where(eq(user.id, userWithStreak.id));
    } else {
      await db.update(user).set({
        streak: 0
      })
      .where(eq(user.id, userWithStreak.id));

    }

  }
})()