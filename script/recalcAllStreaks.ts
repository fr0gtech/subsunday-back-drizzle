import { db } from "../src/db";
import { user } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { getDateRange } from "../src/lib";
import { isWithinInterval } from "date-fns";
import type { Vote } from "../src/db/types";

(async () => {
  const { currentPeriod } = getDateRange();
  const now = new Date();
  const BATCH_SIZE = 500; 
  let offset = 0;
  let processedCount = 0;

  function hasVoteInPeriod(votes: Vote[], period: any) {
    return votes.some((v: { createdAt: string | number | Date }) =>
      isWithinInterval(v.createdAt, {
        start: period.startDate,
        end: period.endDate,
      })
    );
  }

  while (true) {
    const users = await db.query.user.findMany({
      limit: BATCH_SIZE,
      offset: offset,
      with: {
        votes: true,
      },
    });

    if (users.length === 0) {
      break; 
    }

    console.log(`Processing batch: ${offset} to ${offset + users.length}`);

    for (const userWithStreak of users) {
      const votes = [...userWithStreak.votes].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );

      let streak = 0;
      let period = currentPeriod;
      let run = true;

      while (run) {
        const voted = hasVoteInPeriod(votes, period);
        const isCurrent = isWithinInterval(now, {
          start: period.startDate,
          end: period.endDate,
        });

        if (voted && !isCurrent) {
          streak++;
        } else if (voted && isCurrent) {
          streak++;
        }
        if (!voted && !isCurrent) {
          run = false;
          break;
        }

        period = getDateRange({ offset: period.startDate }).lastPeriod;
      }

      if (userWithStreak.streak !== streak) {
        console.log(
          `${userWithStreak.name} old:${userWithStreak.streak} new:${streak}`
        );
      }

      await db
        .update(user)
        .set({ streak })
        .where(eq(user.id, userWithStreak.id));

      processedCount++;
    }

    offset += BATCH_SIZE;
    console.log(`processed ${processedCount} users so far...`);
  }

  console.log(`finished processing ${processedCount} users`);
})();