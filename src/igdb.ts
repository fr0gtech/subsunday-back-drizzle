import { TZDate } from "@date-fns/tz";
import { db } from "./db";
import { game } from "./db/schema";
import type { Game, GameFromSearch, GameFromSearchHypes, GameIGDB, MultiQuery, TwitchToken } from "./db/types";

let token: TwitchToken;
let headers: Bun.HeadersInit;
let method = 'POST'

export async function initIGDB() {
    token = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${process.env.IGDB_CLIENTID}&client_secret=${process.env.IGBB_CLIENTSECRET}&grant_type=client_credentials`,
        {
            method: "POST"
        }
    ).then((e) => e.json()) as TwitchToken

     headers = {
        'Accept': 'application/json',
        'Client-ID': process.env.IGDB_CLIENTID as string,
        'Authorization': `Bearer ${token.access_token}`,
    }   
}
export function IGDBToGameForDb(gameIGDB: GameIGDB){
    const pic = gameIGDB.artworks && gameIGDB.artworks[0] ? gameIGDB.artworks[0].url.replace("t_thumb", "t_720p")
                    :
                    gameIGDB.cover ? gameIGDB.cover.url.replace("t_thumb", "t_720p") : ""
    return {
        name: gameIGDB.name,
        picture: pic,
        link: "",
        steamId: 0,
        description: gameIGDB.summary || "",
        website: gameIGDB.websites ? gameIGDB.websites[0]?.url : "",
        dev: [""],
        price: { final: "n/a" },
        categories: gameIGDB.genres ? gameIGDB.genres.map((e)=>{
            return{
                "id": e.id,
                "description": e.name
            }
        }) : [],
        recommendations: 0,
        // https://api-docs.igdb.com/?javascript#images
        screenshots: gameIGDB.screenshots ? gameIGDB.screenshots.map((e)=>{
            return {
                "id": e.id,
                "path_full": e.url.replace("t_thumb", "t_720p"),
                "path_thumbnail": e.url.replace("t_thumb", "t_screenshot_med")
            }
        }) : "",
        detailedDescription: gameIGDB.storyline || gameIGDB.summary,
        movies: gameIGDB.videos ? gameIGDB.videos.map((e)=>e.video_id) : [],
        createdAt: new TZDate(new Date(), process.env.TIMEZONE),
        updatedAt: new TZDate(new Date(), process.env.TIMEZONE),
        igdbId: gameIGDB.id
    }
}

export async function createGameFromIGDB(gameIGDB: GameIGDB) : Promise<Game[]> {
    const data = IGDBToGameForDb(gameIGDB)
    return await db.insert(game).values(data).returning()
}

export async function findOnIGDB(query: string): Promise<GameIGDB | null> {
        // only thing we can do is req hypes for all games?
        
        // we have to use a huge limit because for example if we search for fortnite we dont get the actuall game even with 100 limit
        // maybe we could try first with 10 and them load more if we cant find exact match but idk
        const cleanedSearch = query.replace(/[^\x00-\x7F]/g, '');
        const gameSearchRaw = await IGDBreq<GameFromSearch[]>('search', `search "${cleanedSearch}"; fields game,name;limit 500;`)
        const gameSearchIds = gameSearchRaw.map((e)=>e.game).filter((e)=>e)
        
        const allSearchedGames = await IGDBreq<MultiQuery<GameFromSearchHypes[]>[]>('multiquery',
            `query games "searchedGames" {
                fields name,game_type;
                where id = (${gameSearchIds});
                sort game_type asc;
            };`
        )
        
        const gameSearch = allSearchedGames[0]?.result
        if (!gameSearch) return null

        const exactMatch = gameSearch.find((game)=>game.name.toLowerCase() === cleanedSearch.toLowerCase())
        let gameFound = exactMatch

        // if we do not match exact make sure that at least something matches otherwise we get stuff like:
        // found game on IGDB for Returnal™ - 3: Donkey Kong Country Returns HD, this was kinda fixed by only allowing asci but yeah we only look for exact matches..
        // not the best we but the search api is also trash so we cant just take most hyped if no exact match


        if (gameFound && gameFound.id) {
        const game = await IGDBreq<GameIGDB[]>('games',
            `fields name,websites.url,websites.type,screenshots.url,genres.name,videos.video_id,cover.url,summary,storyline,artworks.url,game_status;
            where id = ${gameFound.id};`
        )
        if ([6,7,8].includes(game[0]?.game_status as number)){
            // game is rumored, delisted or cancelled
            return null
        }
        // console.log(JSON.stringify(game));
        
        return {...game[0], websites: game[0]?.websites?.sort((a,b) => a.type - b.type)} as GameIGDB
    
    } else {
        console.log("could not find game?");
        return null
    }
}

let lastRequestTime = 0;
const minInterval = 1000 / 1; 


async function IGDBreq<T>(route: string, query: string): Promise<T> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < minInterval) {
    await new Promise(resolve => 
      setTimeout(resolve, minInterval - timeSinceLastRequest)
    );
  }
  
  lastRequestTime = Date.now();
  
  return await fetch(
    `https://api.igdb.com/v4/${route}`,
    {
      method,
      headers,
      body: query
    }
  ).then((res) => res.json()) as T;
}