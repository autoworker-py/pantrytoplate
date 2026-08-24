import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { ToastProvider } from './components/Toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import AddItem from './pages/AddItem';
import Recipes from './pages/Recipes';
import RecipeDetail from './pages/RecipeDetail';
import ShoppingList from './pages/ShoppingList';
import Nutrition from './pages/Nutrition';
import Settings from './pages/Settings';

const TABS = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/inventory', label: 'Pantry', icon: '🧺', end: false },
  { to: '/diary', label: 'Diary', icon: '📊', end: false },
  { to: '/recipes', label: 'Recipes', icon: '🍳', end: false },
  { to: '/shopping', label: 'Shopping', icon: '🛒', end: false },
];

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="empty">Loading…</div>;

  if (!user) {
    return (
      <ToastProvider>
        <Login />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="app">
        <header className="topbar">
          <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
            Pantry<span>→</span>Plate
          </Link>
          <NavLink to="/settings" className="btn-ghost btn-sm" aria-label="Settings">
            ⚙︎
          </NavLink>
        </header>

        <main className="container">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/add" element={<AddItem />} />
            <Route path="/diary" element={<Nutrition />} />
            <Route path="/recipes" element={<Recipes />} />
            <Route path="/recipes/:id" element={<RecipeDetail />} />
            <Route path="/shopping" element={<ShoppingList />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <nav className="tabbar">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end}>
              <span className="icon">{tab.icon}</span>
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </ToastProvider>
  );
}
