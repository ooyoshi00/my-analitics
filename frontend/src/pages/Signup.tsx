import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Signup() {
	const { signup } = useAuth();
	const navigate = useNavigate();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [passwordConfirmation, setPasswordConfirmation] = useState('');
	const [error, setError] = useState('');

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError('');
		try {
			await signup(email, password, passwordConfirmation);
			navigate('/');
		} catch (err) {
			setError(err instanceof Error ? err.message : '登録に失敗しました');
		}
	};

	return (
		<main className='auth-page'>
			<h1>サインアップ</h1>
			<form onSubmit={handleSubmit}>
				<label>
					メールアドレス
					<input type='email' value={email} onChange={(e) => setEmail(e.target.value)} required />
				</label>
				<label>
					パスワード(8文字以上)
					<input type='password' value={password} onChange={(e) => setPassword(e.target.value)} required />
				</label>
				<label>
					パスワード(確認)
					<input type='password' value={passwordConfirmation} onChange={(e) => setPasswordConfirmation(e.target.value)} required />
				</label>
				{error && <p className='error'>{error}</p>}
				<button type='submit'>登録する</button>
			</form>
			<p>
				アカウントがある場合は <Link to='/login'>ログイン</Link>
			</p>
		</main>
	);
}
