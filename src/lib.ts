import {
  type Day,
  nextDay,
  setMilliseconds,
  setSeconds,
  setMinutes,
  setHours,
  subDays,
  getDay,
  previousDay,
} from "date-fns";
import Fuse from "fuse.js"
import { TZDate, tz } from "@date-fns/tz";
import { db } from "./db";
import { desc, eq, sql, type AnyColumn } from "drizzle-orm";
import { game } from "./db/schema";
import type { Game } from "./db/types";
import type { DateRangeOptions, SteamGame } from "./types";
import { sleep } from "bun";

export let games: SteamGame[];
export let gamesFetchTime: Date;

export const loadGames = async () => games = await getSteamGames()
export const increment = (column: AnyColumn, value = 1) => sql`${column} + ${value}`;

export function getDateRange(options?: DateRangeOptions) {
  const { _fromDay, _fromTime, _toDay, _toTime, offset } = options || {};

  const fromDay = (_fromDay || process.env.FROM_DAY) as Day;
  const fromTime = (_fromTime || process.env.FROM_TIME) as string;
  const toDay = (_toDay || process.env.TO_DAY) as Day;
  const toTime = (_toTime || process.env.TO_TIME) as string;

  const now = offset || new Date();
  const [fromHour, fromMinute]: number[] = fromTime.split(":").map(Number);
  const [toHour, toMinute] = toTime.split(":").map(Number);

  if (typeof fromHour !== "number" || typeof fromMinute !== "number" || typeof toHour !== "number" || typeof toMinute !== "number") {
    throw new Error("!fromHour || !fromMinute || !toHour || !toMinute");
  }

  const periodStart =
    getDay(now) == fromDay ? now : previousDay(now, fromDay, { in: tz(process.env.TIMEZONE as string) });

  const startDate = setMilliseconds(
    setSeconds(setMinutes(setHours(periodStart, fromHour), fromMinute), 0),
    0,
  );

  // relative from start we get the next day
  const periodEndDate = nextDay(periodStart, toDay, { in: tz(process.env.TIMEZONE as string) });
  const endDate = setMilliseconds(
    setSeconds(setMinutes(setHours(periodEndDate, toHour), toMinute), 0),
    0,
  );

  const nextStart = nextDay(periodEndDate, fromDay, { in: tz(process.env.TIMEZONE as string) });

  const nextStartDate = setMilliseconds(
    setSeconds(setMinutes(setHours(nextStart, fromHour), fromMinute), 0),
    0,
  );
  // if its sunday we want to use the last Period to fetch items and display data?
  return {
    currentPeriod: {
      startDate,
      endDate,
      nextStartDate,
    },
    isSunday: getDay(now) == 0,
    lastPeriod: {
      startDate: subDays(startDate, 7),
      endDate: subDays(endDate, 7),
      nextStartDate: subDays(nextStartDate, 7),
    },
  };
}

export const getGameOnDb = async (gameMsg: string, steamId: string | undefined) => {
  if (steamId) {
    return await db.query.game.findFirst({
      where: eq(game.steamId, parseInt(steamId))
    })
  } else {
    // the sql below does keyword and exact search and sorts by steamId?
    // this will take a steam game before a non steam game?
    // FIXME: just make this better... maybe we need to do better when creating games?
    // https://orm.drizzle.team/docs/guides/postgresql-full-text-search we could also set weight for title and desc and stuff
    return await db.query.game.findFirst({
      where: sql`
    to_tsvector('english', ${game.name})
    @@ plainto_tsquery('english', ${gameMsg})
  `,
    orderBy: sql`
    CASE 
      WHEN LOWER(${game.name}) = LOWER(${gameMsg}) THEN 0
      WHEN LOWER(${game.name}) LIKE LOWER(${gameMsg}) || '%' THEN 1
      ELSE 2
    END,
    LENGTH(${game.name}),
    ${game.recommendations} DESC,
    ${game.id}
  `
    });
  }
}

export const updateGameIGDB = async (gameOnDb: Game): Promise<Game[]> => {
  const steamAppDetails = await getInfobyId(gameOnDb.steamId)
  const moreInfo = (steamAppDetails as any)[gameOnDb.steamId].data;
  return await db.update(game).set({
    name: moreInfo.name,
    picture: moreInfo.header_image || "",
    link: "",
    steamId: gameOnDb.steamId,
    description: moreInfo.short_description || "",
    website: moreInfo.website || "",
    dev: moreInfo.developers || [""],
    price: moreInfo.is_free ? { final: "free" } : moreInfo.price_overview || { final: "n/a" },
    categories: moreInfo.genres || {},
    recommendations: moreInfo.recommendations ? moreInfo.recommendations.total : 0,
    screenshots: moreInfo.screenshots,
    detailedDescription: JSON.stringify({ html: moreInfo.detailed_description }),
    movies: moreInfo.movies,
    createdAt: new TZDate(new Date(), process.env.TIMEZONE),
    updatedAt: new TZDate(new Date(), process.env.TIMEZONE),
  }).where(eq(game.id, gameOnDb.id)).returning()
}

export const updateGame = async (gameOnDb: Game): Promise<Game[]> => {
  const steamAppDetails = await getInfobyId(gameOnDb.steamId)
  const moreInfo = (steamAppDetails as any)[gameOnDb.steamId].data;
  return await db.update(game).set({
    name: moreInfo.name,
    picture: moreInfo.header_image || "",
    link: "",
    steamId: gameOnDb.steamId,
    description: moreInfo.short_description || "",
    website: moreInfo.website || "",
    dev: moreInfo.developers || [""],
    price: moreInfo.is_free ? { final: "free" } : moreInfo.price_overview || { final: "n/a" },
    categories: moreInfo.genres || {},
    recommendations: moreInfo.recommendations ? moreInfo.recommendations.total : 0,
    screenshots: moreInfo.screenshots,
    detailedDescription: JSON.stringify({ html: moreInfo.detailed_description }),
    movies: moreInfo.movies,
    createdAt: new TZDate(new Date(), process.env.TIMEZONE),
    updatedAt: new TZDate(new Date(), process.env.TIMEZONE),
  }).where(eq(game.id, gameOnDb.id)).returning()
}


export const createGameOnDb = async (match: { name: string; appId: number | null; }, gameMsg: string): Promise<Game[]> => {
  if (!match.appId) {
    return await db.insert(game).values({
      name: gameMsg,
      steamId: 0,
      picture: "default",
      link: "notOnSteam",
      description: "",
      website: "",
      price: [""],
      categories: {},
      createdAt: new TZDate(new Date(), process.env.TIMEZONE),
      updatedAt: new TZDate(new Date(), process.env.TIMEZONE)
    }).returning()
  } else {
    const steamAppDetails = await getInfobyId(match.appId)

    const moreInfo = (steamAppDetails as any)[match.appId].data;
    if (!moreInfo || !(steamAppDetails as any)[match.appId].success) {
      // if we get a game like lol that is on steam game list but we cant get detail page just call itself with no appid
      return createGameOnDb({ appId: null, name: match.name }, gameMsg)
    }
    return await db.insert(game).values({
      name: moreInfo.name,
      picture: moreInfo.header_image || "",
      link: "",
      steamId: match.appId,
      description: moreInfo.short_description || "",
      website: moreInfo.website || "",
      dev: moreInfo.developers || [""],
      price: moreInfo.is_free ? { final: "free" } : moreInfo.price_overview || { final: "n/a" },
      categories: moreInfo.genres || {},
      recommendations: moreInfo.recommendations ? moreInfo.recommendations.total : 0,
      screenshots: moreInfo.screenshots,
      detailedDescription: JSON.stringify({ html: moreInfo.detailed_description }),
      movies: moreInfo.movies,
      createdAt: new TZDate(new Date(), process.env.TIMEZONE),
      updatedAt: new TZDate(new Date(), process.env.TIMEZONE),
    }).returning()
  }
}


export function getSteamAppIdFromURL(url: string): string | undefined {
  const regex = /^https?:\/\/store\.steampowered\.com\/app\/(\d+)(?:\/|$)/;
  const match = url.match(regex);
  if (!match) {
    return
  } else {
    return match[1]
  }
}
export async function findClosestSteamGame(userInput: string) {
  // if this is bad it kinda messes up everything and it is kinda bad
  // this is just bad if someone does not actually copy past the game name but types it so
  // risk of rain POG -> could fail matching 
  // but ppl could also just copy past actual game name and it would work with no issues
  // TODO: Create issue for this
  const fuse = new Fuse(games, {
    keys: ["name"],
    threshold: 0.09, // lower is stricter make this lower if we get mismatches otherwise write own logic
  });
  const [result] = fuse.search(userInput);
  if (result) {
    const { item } = result;
    return {
      name: item.name,
      appId: item.appid,
    };
  } else {
    return {
      name: "",
      appId: null
    };
  }
}

export async function checkIfSteamBanned() {
  let banned = true
  let retries = 1
  while (banned) {
    // when rebuilding votes this may hit a rate limit?
    const url = new URL("https://store.steampowered.com/api/appdetails")
    url.searchParams.set("appids", "70"); // use old ass game to check
    url.searchParams.set("cc", "us");
    const resp = await fetch(url.toString())

    // we can get rate limited or even banned... not sure if we get unbanned after a while...
    // if you are not sure if you are banned check: https://store.steampowered.com/
    if (resp.status === 403) {
      // we hit steam rate limit wait for a bit and rerun self
      console.log(`We are banned from steam wait and retry: ${10000 * retries} secs`);
      await sleep(10000 * retries)
      retries++
    } else if (resp.status === 200) {
      console.log(`Ban check passed`);
      banned = false
    }
  }
  return true
}

export async function getInfobyId(appId: number) {
  // when rebuilding votes this may hit a rate limit?
  const url = new URL("https://store.steampowered.com/api/appdetails")
  url.searchParams.set("appids", appId.toString());
  url.searchParams.set("cc", "us");
  const resp = await fetch(url.toString())

  // we can get rate limited or even banned... not sure if we get unbanned after a while...
  // if you are not sure if you are banned check: https://store.steampowered.com/
  if (resp.status === 429 || resp.status === 403) {
    // we hit steam rate limit wait for a bit and rerun self
    console.log("hit steam rate limit sleeping for 15000");

    await sleep(15000)
    return await getInfobyId(appId)
  } else if (resp.status !== 200) {
    console.log(resp);
  }
  const json = await resp.json()
  return json

}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getSteamGames(): Promise<SteamGame[]> {
  let run = true
  let allGames = []
  const url = new URL("https://api.steampowered.com/IStoreService/GetAppList/v1/");
  url.searchParams.set("key", process.env.STEAM_WEB_API_KEY);
  url.searchParams.set("max_results", "50000") // this is max https://steamapi.xpaw.me/#IStoreService/GetAppList
  // this could help load less if we only get english description but ... it only takes  a few sec to load all anyways
  // url.searchParams.set("have_description_language", "english")
  while (run) {
    if (allGames.length) url.searchParams.set("last_appid", allGames[allGames.length - 1].appid) // this api endpoit uses last loaded id as a cursor to load more
    const response = await fetch(url.toString());
    const data = await response.json() as any;
    allGames.push(...data.response.apps)
    if (!data.response.have_more_results) run = false
  }

  gamesFetchTime = new TZDate(new Date(), process.env.TIMEZONE)
  console.log(`${allGames.length} steam games loaded`);
  return allGames;
}



// this is kinda bad but also should help anyone avoid running without env
export function checkENV() {
  const REQUIRED_ENV = [
    "TWITCH_CHANNEL_NAME",
    "DATABASE_URL",
    "SOCKET_ORIGIN",
    "SOCKET_PORT",
    "TIMEZONE",
    "FROM_DAY",
    "FROM_TIME",
    "TO_DAY",
    "TO_TIME",
    "STEAM_WEB_API_KEY",
  ]
  const missing: string[] = [];

  for (const key of REQUIRED_ENV) {
    if (process.env[key] === undefined || process.env[key] === "") {
      missing.push(key);
    }
  }
  if (missing.length) {
    throw new Error(
      `Missing required environment variables:\n${missing.join("\n")}`
    );
  }
}



export type MomentType = {
  id: string;
  durationMilliseconds: number;
  positionMilliseconds: number;
  type: string;
  gameId?: number;
  description: string;
}

export const getMoments = async (vodId: string): Promise<MomentType[]> => {
  let body: any = {
    operationName: 'VideoPreviewCard__VideoMoments',
    variables: { videoId: vodId },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: '7399051b2d46f528d5f0eedf8b0db8d485bb1bb4c0a2c6707be6f1290cdcb31a',
      },
    },
  };

  const data: any = await fetch('https://gql.twitch.tv/gql', {
    headers: { 'Client-Id': process.env.TWITCH_CHAT_DL_CLIENT_ID as string },
    referrer: 'https://www.twitch.tv/',
    body: JSON.stringify(body),
    method: 'POST',
    mode: 'cors',
  }).then((e) => e.json());
  const moments = data.data.video.moments.edges.map((e: any) => e.node);
  return moments;
};