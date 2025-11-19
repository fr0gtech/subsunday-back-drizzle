import { type Day } from "date-fns";

export type SteamGame = {
    appid: number;
    name: string;
};

export type DateRangeOptions = {
    _fromDay?: Day;
    _fromTime?: string;
    _toDay?: Day;
    _toTime?: string; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    offset?: Date;
};

declare module "bun" {
    interface Env {
        TWITCH_CHANNEL_NAME: string
        DATABASE_URL: string
        SOCKET_ORIGIN: string
        SOCKET_PORT: number,
        TIMEZONE: string,
        FROM_DAY: number,
        FROM_TIME: string,
        TO_DAY: number,
        TO_TIME: string,
        STEAM_WEB_API_KEY: string
    }
}