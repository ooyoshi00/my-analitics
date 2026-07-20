import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
	const { login } = useAuth();
	const navigate = useNavigate();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError('');
		try {
			await login(email, password);
			navigate('/');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'ログインに失敗しました');
		}
	};

	return (
		<main className='auth-page'>
			<h1>ログイン</h1>
			<form onSubmit={handleSubmit}>
				<label>
					メールアドレス
					<input type='email' value={email} onChange={(e) => setEmail(e.target.value)} required />
				</label>
				<label>
					パスワード
					<input type='password' value={password} onChange={(e) => setPassword(e.target.value)} required />
				</label>
				{error && <p className='error'>{error}</p>}
				<button type='submit'>ログイン</button>
			</form>
			<p>
				アカウントがない場合は <Link to='/signup'>サインアップ</Link>
			</p>
		</main>
	);
}
