import { defineRoom, defineServer } from "colyseus";
import { TrainLobbyRoom } from "./room/lobby-room.ts";

const server = defineServer({
	rooms: {
		train_lobby: defineRoom(TrainLobbyRoom).filterBy(["teamSize"]),
	},
});

const port = Number(process.env.PORT ?? 2567);
await server.listen(port);
console.log("Last Train lobby server listening on http://127.0.0.1:" + port);
