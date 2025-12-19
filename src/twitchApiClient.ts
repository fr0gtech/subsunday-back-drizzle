import { ApiClient, type ApiConfig } from "@twurple/api";
import { RefreshingAuthProvider } from "@twurple/auth";
import { createInterface } from "readline";

export let apiClient: ApiClient;

export const setUpApiClient = async () => {
  const clientId = process.env.TWITCH_CLIENTID;
  const clientSecret = process.env.TWITCH_CLIENTSECRET;
  const redirectUri = process.env.TWITCH_REDIRECT_URI;

  let accessToken: string;
  let refreshToken: string;

  try {
    const file = Bun.file(`${process.cwd()}/tokens.userid.json`,);
    const contents = await file.json();
    
    accessToken = contents.access_token;
    refreshToken = contents.refresh_token;
  } catch (err) {
    console.log(
      `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=chat:read+chat:edit`
    );
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ans = await new Promise<string>((resolve) =>
      rl.question("Code?", (ans) => {
        rl.close();
        resolve(ans);
      })
    );

    const url2 = `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&code=${ans}&grant_type=authorization_code&redirect_uri=${redirectUri}`;

    const oauth: any = await fetch(url2, { method: "POST" }).then((e) =>
      e.json()
    );

    accessToken = oauth.access_token;
    refreshToken = oauth.refresh_token;
    console.log("got twitch token");

    await Bun.write(`./tokens.${"userid"}.json`, JSON.stringify(oauth, null, 4));
  }

  const authProvider = new RefreshingAuthProvider({
    clientId,
    clientSecret,
  } as any);

  await authProvider.addUserForToken({
    accessToken,
    refreshToken,
    expiresIn: null,
    obtainmentTimestamp: 0,
  });

  authProvider.onRefresh(
    async (userId: any, newTokenData: any) =>
        await Bun.write(`./tokens.${"userid"}.json`, JSON.stringify(newTokenData, null, 4))
  );

  const apiConfig: ApiConfig = {
    authProvider: authProvider,
  };

  apiClient = new ApiClient(apiConfig);

};
