import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import type { User } from '../types';

type AuthContextValue = {
	user: User | null;
	loading: boolean;
	signup: (email: string, password: string, passwordConfirmation: string) => Promise<void>;
	login: (email: string, password: string) => Promise<void>;
	logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);

	// 初回マウント時に「ログイン済みか」をサーバーに聞く
	// (クッキーはブラウザが勝手に送るので、聞くだけでよい)
	useEffect(() => {
		api<User>('/api/me')
			.then(setUser)
			.catch(() => setUser(null)) // 401 = 未ログイン
			.finally(() => setLoading(false));
	}, []);

	const signup = async (email: string, password: string, passwordConfirmation: string) => {
		const u = await api<User>('/api/users', {
			method: 'POST',
			body: JSON.stringify({
				user: {
					email_address: email,
					password,
					password_confirmation: passwordConfirmation,
				},
			}),
		});
		setUser(u);
	};

	const login = async (email: string, password: string) => {
		const u = await api<User>('/api/session', {
			method: 'POST',
			body: JSON.stringify({ email_address: email, password }),
		});
		setUser(u);
	};

	const logout = async () => {
		await api<void>('/api/session', { method: 'DELETE' });
		setUser(null);
	};

	return <AuthContext.Provider value={{ user, loading, signup, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error('useAuth は AuthProvider の中でのみ使えます');
	return ctx;
}
