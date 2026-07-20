import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
	server: {
		host: true, // コンテナ外(ホストのブラウザ)からのアクセスを受ける
		proxy: {
			// /api で始まるリクエストを Rails に転送する
			'/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
		},
	},
});
