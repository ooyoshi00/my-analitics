import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';

// ログイン必須ページを包むコンポーネント
function RequireAuth({ children }: { children: ReactNode }) {
	const { user, loading } = useAuth();
	if (loading) return <p>読み込み中...</p>;
	if (!user) return <Navigate to='/login' replace />;
	return children;
}

export default function App() {
	return (
		<AuthProvider>
			<BrowserRouter>
				<Routes>
					<Route path='/login' element={<Login />} />
					<Route path='/signup' element={<Signup />} />
					<Route
						path='/'
						element={
							<RequireAuth>
								<Dashboard />
							</RequireAuth>
						}
					/>
				</Routes>
			</BrowserRouter>
		</AuthProvider>
	);
}
