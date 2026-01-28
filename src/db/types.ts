// src/lib/db/types.ts

import type { game, user, vote } from './schema';
import type { InferSelectModel } from 'drizzle-orm';

// For selecting (fetching) data
export type Game = InferSelectModel<typeof game>;
export type User = InferSelectModel<typeof user>;
export type Vote = InferSelectModel<typeof vote>;

export type GamePrice = {
	final: number;
	initial: number;
	currency: string;
	final_formatted: string;
	discount_percent: number;
	initial_formatted: string;
};

export type GameCategories = {
	id: number;
	description: string;
};


export type TwitchToken = {
    access_token: string,
    expires_in: number,
    token_type: string,
}

export type GameFromSearch = {
    id: number,
    game: number,
    name: string
}

export type GameFromSearchHypes = {
    id: number,
    hypes: number,
    name: string
}

export type GameIGDB = {
    id: number;
    age_ratings: number[];
    alternative_names: number[];
    cover: {
        id: number,
        url: string
    },
	game_status: number;
    created_at: number;
    external_games: number[];
    first_release_date: number;
    game_modes: number[];
    genres: {
        id: number,
        name: string
    }[],
    hypes: number;
    involved_companies: number[];
    keywords: number[];
    name: string;
    platforms: number[];
    release_dates: number[];
    screenshots: {
        id: number,
        url: string
    }[],
    artworks: {
        id: number,
        url: string
    }[],
    similar_games: number[];
    slug: string;
    storyline: string;
    summary: string;
    tags: number[];
    themes: number[];
    updated_at: number;
    url: string;
    videos: {
        id: number,
        video_id: string
    }[],
    websites: {
        id: number,
        url: string,
        type: number
    }[] | undefined,
    checksum: string;
    language_supports: number[];
    game_localizations: number[];
    collections: number[];
    game_type: number;
};
export type MultiQuery<T> = {
    name: string,
    result: T
}