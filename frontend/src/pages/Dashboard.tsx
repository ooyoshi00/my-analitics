import { useAuth } from '../auth/AuthContext';

export default function Dashboard() {
	const { user, logout } = useAuth();

	return (
		<main>
			<header className='app-header'>
				<h1>MyAnalytics</h1>
				<div>
					<span>{user?.email_address}</span>
					<button onClick={logout}>ログアウト</button>
				</div>
			</header>
			<p>ようこそ!ここに診断結果の一覧が入ります(第6章)。</p>
		</main>
	);
}
