import { createServer } from "http";
import { Server } from "socket.io";

const server = createServer();

export const io = new Server(server, {
    cors: {
        origin: process.env.SOCKET_ORIGIN,
    },
});
// track unique ips for online user count thing
const connectedIPs = new Set<string>();

export const initSocket = () => {
    io.on("connection", (socket) => {

        const ip = socket.handshake.address || 
                socket.handshake.headers['x-forwarded-for'] || 
                socket.handshake.headers['x-real-ip'];
        connectedIPs.add(ip as string);
        io.emit("onlineCount", connectedIPs.size);
        socket.on("join", (data) => {
            socket.join(data);
        });
        socket.on("leave", (data) => {
            socket.leave(data);
        });
        socket.on("disconnect", () => {
            const hasOtherConnection = Array.from(io.sockets.sockets.values())
                .some(s => {
                    const otherIp = s.handshake.address || 
                                   s.handshake.headers['x-forwarded-for'] || 
                                   s.handshake.headers['x-real-ip'];
                    return otherIp === (ip as string) && s.id !== socket.id;
                });
            
            if (!hasOtherConnection) {
                connectedIPs.delete(ip as string);
            }
            
            io.emit("onlineCount", connectedIPs.size);
        })
    });

    server.listen(process.env.SOCKET_PORT, () => {
        console.log(`socket running on ${process.env.SOCKET_PORT}`);
    });
}