import tmi, { type ChatUserstate } from "tmi.js";
import { onMessage } from ".";


export const initTwitchIRC = (CHANNEL: string) => {

    const twitchIRC = new tmi.Client({
        channels: [CHANNEL],
    });

    twitchIRC
        .connect()
        .then(() => {
            console.log(`reading #${CHANNEL}`);
        })
        .catch(console.error);

    twitchIRC.on("message", (channel, userstate: ChatUserstate, message) => {
        onMessage(message, userstate);
    });
}
