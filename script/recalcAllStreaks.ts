import { db } from "../src/db";
import { user } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { getDateRange } from "../src/lib";
import { isWithinInterval } from "date-fns";
import type { Vote } from "../src/db/types";

(async () => {
const { currentPeriod } = getDateRange();
  const users = await db.query.user.findMany({
    with: {
      votes: true,
    }
  });
  const now = new Date();

  function hasVoteInPeriod(votes: Vote[], period: any) {
    return votes.some((v: { createdAt: string | number | Date; }) =>
      isWithinInterval(v.createdAt, {
        start: period.startDate,
        end: period.endDate,
      })
    );
  }

  for (const userWithStreak of users) {
    const votes = [...userWithStreak.votes].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    let streak = 0;

    let period = currentPeriod;

    while (true) {
      const voted = hasVoteInPeriod(votes, period);

      const isCurrent = isWithinInterval(now, {
        start: period.startDate,
        end: period.endDate,
      });

      if (voted) {
        streak++;
      } else {
        if (isCurrent) {
          // do NOT break streak for current open period
        } else {
          // streak ends
          break;
        }
      }
      period = getDateRange({ offset: period.startDate }).lastPeriod;
    }

    if (userWithStreak.streak !== streak) {
      console.log(`${userWithStreak.name} old:${userWithStreak.streak} new:${streak}`);
    }

    await db.update(user)
      .set({ streak })
      .where(eq(user.id, userWithStreak.id));
  }
  })()