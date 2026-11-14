/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** Address of the game server (http or https) when it is not on port 2567 next to the page. */
	readonly VITE_SERVER_URL?: string;
}
